package model

import (
	"errors"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	DistributorStatusActive    = "active"
	DistributorStatusSuspended = "suspended"

	ApplicationStatusPending   = "pending"
	ApplicationStatusApproved  = "approved"
	ApplicationStatusRejected  = "rejected"
	ApplicationStatusWithdrawn = "withdrawn"

	WithdrawMethodAlipay = "alipay"
	WithdrawMethodWechat = "wechat"
	WithdrawMethodBank   = "bank"
	WithdrawMethodUSDT   = "usdt"

	WithdrawalStatusPending  = "pending"
	WithdrawalStatusApproved = "approved"
	WithdrawalStatusPaid     = "paid"
	WithdrawalStatusRejected = "rejected"
)

var (
	ErrDistributorInvalid   = errors.New("invalid distributor operation")
	ErrDistributorNotFound  = errors.New("distributor record not found")
	ErrDistributorConflict  = errors.New("distributor state changed; refresh and retry")
	ErrDistributorDisabled  = errors.New("distributor program is not available")
	ErrApplicationExists    = errors.New("a pending application already exists")
	ErrTermsVersionMismatch = errors.New("commission terms changed; review the latest terms and resubmit")
	ErrWithdrawAmountLow    = errors.New("amount is below the minimum withdrawal")
	ErrWithdrawBalance      = errors.New("amount exceeds the withdrawable balance")
	ErrWithdrawPending      = errors.New("an unfinished withdrawal already exists")
	ErrWithdrawMethod       = errors.New("payout method is not available")
	ErrWithdrawAccount      = errors.New("payout account details are incomplete or invalid")
)

// 驳回后需等待 24 小时才能重新申请（B1.9）。
const DistributorReapplyWaitSeconds = 24 * 3600

// ReapplyTooSoonError 驳回未满 24 小时再次提交；RetryAt 供前端展示倒计时。
type ReapplyTooSoonError struct{ RetryAt int64 }

func (e *ReapplyTooSoonError) Error() string {
	return "reapplication is allowed 24 hours after the last rejection"
}

type DistributorProfile struct {
	Id                    int     `json:"id" gorm:"primaryKey"`
	UserId                int     `json:"user_id" gorm:"uniqueIndex"`
	DistCode              *string `json:"dist_code" gorm:"type:varchar(32);uniqueIndex"`
	Status                string  `json:"status" gorm:"type:varchar(16);index"`
	RateBps               *int    `json:"rate_bps"`
	HoldDays              *int    `json:"hold_days"`
	ApprovedBy            int     `json:"approved_by"`
	ApprovedAt            int64   `json:"approved_at" gorm:"type:bigint"`
	BalanceQuota          int     `json:"balance_quota" gorm:"type:bigint"`
	WithdrawingQuota      int     `json:"withdrawing_quota" gorm:"type:bigint"`
	TotalWithdrawnQuota   int     `json:"total_withdrawn_quota" gorm:"type:bigint"`
	TotalTransferredQuota int     `json:"total_transferred_quota" gorm:"type:bigint"`
	Note                  string  `json:"-" gorm:"type:text"`
	CreatedAt             int64   `json:"created_at" gorm:"type:bigint"`
	UpdatedAt             int64   `json:"updated_at" gorm:"type:bigint"`
	Version               int     `json:"version"`
}

type DistributorApplication struct {
	Id                 int    `json:"id" gorm:"primaryKey"`
	UserId             int    `json:"user_id" gorm:"index"`
	Status             string `json:"status" gorm:"type:varchar(16);index"`
	Contact            string `json:"-" gorm:"type:varchar(128)"`
	ChannelDesc        string `json:"channel_desc" gorm:"type:text"`
	ReviewerId         int    `json:"reviewer_id"`
	ReviewNote         string `json:"review_note" gorm:"type:text"`
	ReviewedAt         int64  `json:"reviewed_at" gorm:"type:bigint"`
	AgreedTermsVersion int    `json:"agreed_terms_version"`
	AgreedAt           int64  `json:"agreed_at" gorm:"type:bigint"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt          int64  `json:"updated_at" gorm:"type:bigint"`
	Version            int    `json:"version"`
}

type DistributorWithdrawal struct {
	Id              int    `json:"id" gorm:"primaryKey"`
	UserId          int    `json:"user_id" gorm:"index:idx_withdrawal_user_time,priority:1"`
	AmountQuota     int    `json:"amount_quota" gorm:"type:bigint"`
	Method          string `json:"method" gorm:"type:varchar(16)"`
	PayoutCurrency  string `json:"payout_currency" gorm:"type:varchar(8)"`
	PayoutAmount    string `json:"payout_amount" gorm:"type:varchar(32)"`
	FxRate          string `json:"fx_rate" gorm:"type:varchar(32)"`
	AccountSnapshot string `json:"-" gorm:"type:text"`
	PayoutNetwork   string `json:"payout_network" gorm:"type:varchar(16)"`
	Status          string `json:"status" gorm:"type:varchar(16);index"`
	ReviewerId      int    `json:"reviewer_id"`
	ReviewedAt      int64  `json:"reviewed_at" gorm:"type:bigint"`
	PaidBy          int    `json:"paid_by"`
	PaidAt          int64  `json:"paid_at" gorm:"type:bigint"`
	PayoutRef       string `json:"payout_ref" gorm:"type:varchar(128)"`
	ReviewNote      string `json:"review_note" gorm:"type:text"`
	CreatedAt       int64  `json:"created_at" gorm:"type:bigint;index:idx_withdrawal_user_time,priority:2"`
	UpdatedAt       int64  `json:"updated_at" gorm:"type:bigint"`
	Version         int    `json:"version"`
}

func (w *DistributorWithdrawal) BeforeCreate(_ *gorm.DB) error {
	now := common.GetTimestamp()
	if w.CreatedAt == 0 {
		w.CreatedAt = now
	}
	w.UpdatedAt = now
	return nil
}

// ---------- 身份查询（带短 TTL 缓存，供 RequireDistributor 中间件与记账分流使用） ----------

type distributorProfileCacheEntry struct {
	profile   *DistributorProfile
	expiresAt int64
}

var distributorProfileCache sync.Map

const distributorProfileCacheTTL = 30 // seconds

// GetActiveDistributorProfile 返回 active 分销身份；不存在或停用返回 nil。
// 30 秒内存缓存；审批/停用/改资料时调用 InvalidateDistributorProfileCache。
func GetActiveDistributorProfile(userId int) *DistributorProfile {
	if cached, ok := distributorProfileCache.Load(userId); ok {
		entry := cached.(distributorProfileCacheEntry)
		if entry.expiresAt > common.GetTimestamp() {
			return entry.profile
		}
	}
	var profile DistributorProfile
	var result *DistributorProfile
	err := DB.Where("user_id = ?", userId).Take(&profile).Error
	if err == nil && profile.Status == DistributorStatusActive {
		p := profile
		result = &p
	}
	distributorProfileCache.Store(userId, distributorProfileCacheEntry{profile: result, expiresAt: common.GetTimestamp() + distributorProfileCacheTTL})
	return result
}

func InvalidateDistributorProfileCache(userId int) {
	distributorProfileCache.Delete(userId)
}

// GetDistributorStatus 给 GetSelf 返回身份状态：active/suspended/pending/rejected/none。
func GetDistributorStatus(userId int) string {
	var profile DistributorProfile
	if err := DB.Select("status").Where("user_id = ?", userId).Take(&profile).Error; err == nil {
		return profile.Status
	}
	var app DistributorApplication
	if err := DB.Select("status").Where("user_id = ?", userId).Order("id DESC").Take(&app).Error; err == nil {
		if app.Status == ApplicationStatusPending {
			return "pending"
		}
		return "rejected"
	}
	return "none"
}

// ---------- 申请与审批 ----------

func SubmitDistributorApplication(userId int, contact string, channelDesc string, termsVersion int) (*DistributorApplication, error) {
	contact = strings.TrimSpace(contact)
	channelDesc = strings.TrimSpace(channelDesc)
	if !operation_setting.DistributorEnabled || !operation_setting.DistributorApplyEnabled {
		return nil, ErrDistributorDisabled
	}
	if termsVersion != operation_setting.DistributorAgreementVersion {
		return nil, ErrTermsVersionMismatch
	}
	if contact == "" || len([]rune(contact)) > 128 || channelDesc == "" || len([]rune(channelDesc)) > 1000 {
		return nil, ErrDistributorInvalid
	}
	if GetActiveDistributorProfile(userId) != nil {
		return nil, ErrDistributorInvalid
	}
	var pending DistributorApplication
	if err := DB.Where("user_id = ? AND status = ?", userId, ApplicationStatusPending).Take(&pending).Error; err == nil {
		return nil, ErrApplicationExists
	}
	// B1.9：最近一次驳回满 24 小时才允许重新申请；撤回不受此限。
	var lastRejected DistributorApplication
	err := DB.Where("user_id = ? AND status = ?", userId, ApplicationStatusRejected).
		Order("id DESC").Limit(1).Take(&lastRejected).Error
	switch {
	case err == nil:
		if retryAt := lastRejected.ReviewedAt + DistributorReapplyWaitSeconds; retryAt > common.GetTimestamp() {
			return nil, &ReapplyTooSoonError{RetryAt: retryAt}
		}
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return nil, err
	}
	app := &DistributorApplication{
		UserId:             userId,
		Status:             ApplicationStatusPending,
		Contact:            contact,
		ChannelDesc:        channelDesc,
		AgreedTermsVersion: termsVersion,
		AgreedAt:           common.GetTimestamp(),
		Version:            1,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", userId).Take(&user).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&DistributorApplication{}).Where("user_id = ? AND status = ?", userId, ApplicationStatusPending).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrApplicationExists
		}
		if err := AcknowledgeTermsTx(tx, userId, TermsDocDistributorAgreement, TermsKindAgree, termsVersion); err != nil {
			return err
		}
		return tx.Create(app).Error
	})
	if err != nil {
		return nil, err
	}
	return app, nil
}

func WithdrawDistributorApplication(id int, userId int) error {
	result := DB.Model(&DistributorApplication{}).
		Where("id = ? AND user_id = ? AND status = ?", id, userId, ApplicationStatusPending).
		Updates(map[string]any{"status": ApplicationStatusWithdrawn, "updated_at": common.GetTimestamp(), "version": gorm.Expr("version + 1")})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrDistributorNotFound
	}
	return nil
}

func GetLatestDistributorApplication(userId int) *DistributorApplication {
	var app DistributorApplication
	if err := DB.Where("user_id = ?", userId).Order("id DESC").Take(&app).Error; err != nil {
		return nil
	}
	return &app
}

func ListDistributorApplications(status string, start int, size int) ([]DistributorApplication, int64, error) {
	var total int64
	query := DB.Model(&DistributorApplication{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var apps []DistributorApplication
	err := query.Order("id DESC").Offset(start).Limit(size).Find(&apps).Error
	return apps, total, err
}

// ReviewDistributorApplication 审批申请；approve 时在同一事务里建分销身份。
func ReviewDistributorApplication(id int, action string, note string, version int, reviewerId int, rateBps *int, holdDays *int) error {
	approvedUserId := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var app DistributorApplication
		err := lockForUpdate(tx).Where("id = ?", id).Take(&app).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDistributorNotFound
		}
		if err != nil {
			return err
		}
		if app.Status != ApplicationStatusPending || app.Version != version {
			return ErrDistributorConflict
		}
		now := common.GetTimestamp()
		switch action {
		case "approve":
			if rateBps != nil && (*rateBps < 0 || *rateBps > operation_setting.MaxCommissionRateBps) {
				return ErrDistributorInvalid
			}
			if holdDays != nil && (*holdDays < 0 || *holdDays > 90) {
				return ErrDistributorInvalid
			}
			distCode, err := generateDistCode(tx)
			if err != nil {
				return err
			}
			profile := &DistributorProfile{
				UserId:     app.UserId,
				DistCode:   &distCode,
				Status:     DistributorStatusActive,
				RateBps:    rateBps,
				HoldDays:   holdDays,
				ApprovedBy: reviewerId,
				ApprovedAt: now,
				CreatedAt:  now,
				UpdatedAt:  now,
				Version:    1,
			}
			if err := tx.Create(profile).Error; err != nil {
				return err // user_id 唯一约束防止重复身份
			}
			app.Status = ApplicationStatusApproved
			approvedUserId = app.UserId
		case "reject":
			if strings.TrimSpace(note) == "" {
				return ErrDistributorInvalid
			}
			app.Status = ApplicationStatusRejected
		default:
			return ErrDistributorInvalid
		}
		app.ReviewerId = reviewerId
		app.ReviewNote = note
		app.ReviewedAt = now
		app.UpdatedAt = now
		if err := tx.Model(&DistributorApplication{}).Where("id = ? AND version = ?", id, version).
			Updates(map[string]any{"status": app.Status, "reviewer_id": reviewerId, "review_note": note,
				"reviewed_at": now, "updated_at": now, "version": gorm.Expr("version + 1")}).Error; err != nil {
			return err
		}
		return nil
	})
	if err == nil && approvedUserId > 0 {
		// 审批后立即生效：记账与身份判定都按直读处理，这里仍清缓存让看板即时可见
		InvalidateDistributorProfileCache(approvedUserId)
	}
	return err
}

// UpdateDistributorProfile 管理员编辑分销身份（B1.10）：只更新请求里带了的字段。
// 指针为 nil 表示不改动该字段；rateBps/holdDays 外层非 nil 而内层为 nil 表示清空
// 个人配置（回退到全局默认）。停用再恢复不得丢个人比例。
func UpdateDistributorProfile(userId int, status *string, rateBps **int, holdDays **int, note *string, version int, operatorId int) error {
	updates := map[string]any{"version": gorm.Expr("version + 1"), "updated_at": common.GetTimestamp()}
	if status != nil {
		if *status != DistributorStatusActive && *status != DistributorStatusSuspended {
			return ErrDistributorInvalid
		}
		updates["status"] = *status
	}
	if rateBps != nil {
		if *rateBps == nil {
			updates["rate_bps"] = nil
		} else {
			if **rateBps < 0 || **rateBps > operation_setting.MaxCommissionRateBps {
				return ErrDistributorInvalid
			}
			updates["rate_bps"] = *rateBps
		}
	}
	if holdDays != nil {
		if *holdDays == nil {
			updates["hold_days"] = nil
		} else {
			if **holdDays < 0 || **holdDays > 90 {
				return ErrDistributorInvalid
			}
			updates["hold_days"] = *holdDays
		}
	}
	if note != nil {
		updates["note"] = *note
	}
	if len(updates) == 2 {
		return ErrDistributorInvalid
	}
	result := DB.Model(&DistributorProfile{}).Where("user_id = ? AND version = ?", userId, version).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrDistributorConflict
	}
	InvalidateDistributorProfileCache(userId)
	return nil
}

func ListDistributorProfiles(start int, size int) ([]DistributorProfile, int64, error) {
	var total int64
	if err := DB.Model(&DistributorProfile{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var profiles []DistributorProfile
	err := DB.Order("id DESC").Offset(start).Limit(size).Find(&profiles).Error
	return profiles, total, err
}

// GetDistributorApplicationById 按 id 取申请（通知/审计取申请人用）。
func GetDistributorApplicationById(id int) (*DistributorApplication, error) {
	var app DistributorApplication
	if err := DB.Where("id = ?", id).Take(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDistributorNotFound
		}
		return nil, err
	}
	return &app, nil
}

func GetDistributorProfileByUser(userId int) (*DistributorProfile, error) {
	var profile DistributorProfile
	if err := DB.Where("user_id = ?", userId).Take(&profile).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDistributorNotFound
		}
		return nil, err
	}
	return &profile, nil
}

// ---------- 提现 ----------

func validateWithdrawalAccount(method string, account map[string]string) (normalized map[string]string, err error) {
	get := func(key string) string { return strings.TrimSpace(account[key]) }
	out := map[string]string{}
	switch method {
	case WithdrawMethodAlipay:
		out["name"], out["account"] = get("name"), get("account")
		if out["name"] == "" || out["account"] == "" {
			return nil, ErrWithdrawAccount
		}
	case WithdrawMethodWechat:
		out["name"], out["account"] = get("name"), get("account")
		if out["name"] == "" || out["account"] == "" {
			return nil, ErrWithdrawAccount
		}
	case WithdrawMethodBank:
		out["name"], out["bank"], out["account"] = get("name"), get("bank"), get("account")
		digits := onlyDigits(out["account"])
		if out["name"] == "" || out["bank"] == "" || len(digits) < 8 || len(digits) > 32 {
			return nil, ErrWithdrawAccount
		}
		out["account"] = digits
	case WithdrawMethodUSDT:
		out["network"], out["address"] = get("network"), get("address")
		if !validUsdtAddress(out["network"], out["address"]) {
			return nil, ErrWithdrawAccount
		}
	default:
		return nil, ErrWithdrawMethod
	}
	return out, nil
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func validUsdtAddress(network string, address string) bool {
	switch network {
	case "trc20":
		return len(address) == 34 && strings.HasPrefix(address, "T")
	case "erc20":
		if len(address) != 42 || !strings.HasPrefix(address, "0x") {
			return false
		}
		for _, r := range address[2:] {
			if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r >= 'A' && r <= 'F') {
				return false
			}
		}
		return true
	default:
		return false
	}
}

// CreateDistributorWithdrawal 提交提现申请；事务里锁 profile、冻结金额、建单、写结算。
// account 明文在进入本函数前已用于构造安全验证 context，这里只落加密快照。
func CreateDistributorWithdrawal(userId int, amountQuota int, method string, account map[string]string) (*DistributorWithdrawal, error) {
	if !operation_setting.DistributorWithdrawEnabled {
		return nil, ErrDistributorDisabled
	}
	if amountQuota <= 0 {
		return nil, ErrDistributorInvalid
	}
	methods := operation_setting.DistributorWithdrawMethods()
	allowed := false
	for _, m := range methods {
		if m == method {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, ErrWithdrawMethod
	}
	normalized, err := validateWithdrawalAccount(method, account)
	if err != nil {
		return nil, err
	}
	payoutNetwork := ""
	if method == WithdrawMethodUSDT {
		payoutNetwork = normalized["network"]
		networkAllowed := false
		for _, n := range operation_setting.DistributorUsdtNetworks() {
			if n == payoutNetwork {
				networkAllowed = true
				break
			}
		}
		if !networkAllowed {
			return nil, ErrWithdrawMethod
		}
	}
	minQuota, err := operation_setting.WithdrawMinQuota()
	if err != nil {
		return nil, err
	}
	if amountQuota < minQuota {
		return nil, ErrWithdrawAmountLow
	}
	snapshotPlain, err := common.Marshal(normalized)
	if err != nil {
		return nil, err
	}
	snapshot, err := common.EncryptAccountSnapshot(snapshotPlain)
	if err != nil {
		return nil, err
	}
	usdAmount := decimal.NewFromInt(int64(amountQuota)).Div(decimal.NewFromFloat(common.QuotaPerUnit))
	payoutCurrency, payoutAmount := "CNY", ""
	if method == WithdrawMethodUSDT {
		payoutCurrency = "USDT"
		payoutAmount = usdAmount.StringFixed(2)
	} else {
		payoutAmount = usdAmount.Mul(decimal.NewFromFloat(operation_setting.USDExchangeRate)).StringFixed(2)
	}
	fxRate := decimal.NewFromFloat(operation_setting.USDExchangeRate).String()
	now := common.GetTimestamp()
	withdrawal := &DistributorWithdrawal{
		UserId:          userId,
		AmountQuota:     amountQuota,
		Method:          method,
		PayoutCurrency:  payoutCurrency,
		PayoutAmount:    payoutAmount,
		FxRate:          fxRate,
		AccountSnapshot: snapshot,
		PayoutNetwork:   payoutNetwork,
		Status:          WithdrawalStatusPending,
		Version:         1,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		ok, err := hasCurrentAgreementTx(tx, userId)
		if err != nil {
			return err
		}
		if !ok {
			return ErrTermsVersionMismatch
		}
		var profile DistributorProfile
		if err := lockForUpdate(tx).Where("user_id = ?", userId).Take(&profile).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDistributorNotFound
			}
			return err
		}
		var pending int64
		if err := tx.Model(&DistributorWithdrawal{}).
			Where("user_id = ? AND status IN ?", userId, []string{WithdrawalStatusPending, WithdrawalStatusApproved}).
			Count(&pending).Error; err != nil {
			return err
		}
		if pending > 0 {
			return ErrWithdrawPending
		}
		if amountQuota > profile.BalanceQuota {
			return ErrWithdrawBalance
		}
		result := tx.Model(&DistributorProfile{}).Where("user_id = ? AND balance_quota >= ?", userId, amountQuota).
			Updates(map[string]any{
				"balance_quota":     gorm.Expr("balance_quota - ?", amountQuota),
				"withdrawing_quota": gorm.Expr("withdrawing_quota + ?", amountQuota),
				"updated_at":        now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWithdrawBalance
		}
		if err := tx.Create(withdrawal).Error; err != nil {
			return err
		}
		return tx.Create(&CommissionSettlement{
			Program:           CommissionProgramDistributor,
			BeneficiaryUserId: userId,
			Trigger:           SettlementTriggerWithdrawHold,
			BalanceType:       CommissionBalanceTypeDistributor,
			WithdrawalId:      withdrawal.Id,
			CreditedQuota:     amountQuota,
			BalanceBefore:     profile.BalanceQuota,
			BalanceAfter:      profile.BalanceQuota - amountQuota,
			CreatedAt:         now,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return withdrawal, nil
}

// ReviewDistributorWithdrawal 管理员审核提现：approve 改状态不动余额；reject 退回余额。
func ReviewDistributorWithdrawal(id int, action string, note string, version int, reviewerId int) error {
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var withdrawal DistributorWithdrawal
		err := lockForUpdate(tx).Where("id = ?", id).Take(&withdrawal).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDistributorNotFound
		}
		if err != nil {
			return err
		}
		if withdrawal.Status != WithdrawalStatusPending || withdrawal.Version != version {
			return ErrDistributorConflict
		}
		switch action {
		case "approve":
			result := tx.Model(&DistributorWithdrawal{}).Where("id = ? AND version = ?", id, version).
				Updates(map[string]any{"status": WithdrawalStatusApproved, "reviewer_id": reviewerId, "reviewed_at": now,
					"review_note": note, "version": gorm.Expr("version + 1"), "updated_at": now})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrDistributorConflict
			}
			return nil
		case "reject":
			if strings.TrimSpace(note) == "" {
				return ErrDistributorInvalid
			}
			var profile DistributorProfile
			if err := lockForUpdate(tx).Where("user_id = ?", withdrawal.UserId).Take(&profile).Error; err != nil {
				return err
			}
			if err := tx.Model(&DistributorProfile{}).Where("user_id = ?", withdrawal.UserId).
				Updates(map[string]any{
					"balance_quota":     gorm.Expr("balance_quota + ?", withdrawal.AmountQuota),
					"withdrawing_quota": gorm.Expr("withdrawing_quota - ?", withdrawal.AmountQuota),
					"updated_at":        now,
				}).Error; err != nil {
				return err
			}
			result := tx.Model(&DistributorWithdrawal{}).Where("id = ? AND version = ?", id, version).
				Updates(map[string]any{"status": WithdrawalStatusRejected, "reviewer_id": reviewerId, "reviewed_at": now,
					"review_note": note, "version": gorm.Expr("version + 1"), "updated_at": now})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrDistributorConflict
			}
			return tx.Create(&CommissionSettlement{
				Program:           CommissionProgramDistributor,
				BeneficiaryUserId: withdrawal.UserId,
				Trigger:           SettlementTriggerWithdrawReject,
				BalanceType:       CommissionBalanceTypeDistributor,
				WithdrawalId:      withdrawal.Id,
				CreditedQuota:     withdrawal.AmountQuota,
				BalanceBefore:     profile.BalanceQuota,
				BalanceAfter:      profile.BalanceQuota + withdrawal.AmountQuota,
				OperatorId:        reviewerId,
				Note:              note,
				CreatedAt:         now,
			}).Error
		default:
			return ErrDistributorInvalid
		}
	})
}

// MarkDistributorWithdrawalPaid 标记已打款，累计已提现并写结算。
func MarkDistributorWithdrawalPaid(id int, payoutRef string, note string, version int, operatorId int) error {
	payoutRef = strings.TrimSpace(payoutRef)
	if payoutRef == "" || len(payoutRef) > 128 {
		return ErrDistributorInvalid
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var withdrawal DistributorWithdrawal
		err := lockForUpdate(tx).Where("id = ?", id).Take(&withdrawal).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDistributorNotFound
		}
		if err != nil {
			return err
		}
		if withdrawal.Status != WithdrawalStatusApproved || withdrawal.Version != version {
			return ErrDistributorConflict
		}
		var profile DistributorProfile
		if err := lockForUpdate(tx).Where("user_id = ?", withdrawal.UserId).Take(&profile).Error; err != nil {
			return err
		}
		if profile.WithdrawingQuota < withdrawal.AmountQuota {
			return ErrDistributorConflict
		}
		if err := tx.Model(&DistributorProfile{}).Where("user_id = ?", withdrawal.UserId).
			Updates(map[string]any{
				"withdrawing_quota":     gorm.Expr("withdrawing_quota - ?", withdrawal.AmountQuota),
				"total_withdrawn_quota": gorm.Expr("total_withdrawn_quota + ?", withdrawal.AmountQuota),
				"updated_at":            now,
			}).Error; err != nil {
			return err
		}
		result := tx.Model(&DistributorWithdrawal{}).Where("id = ? AND version = ?", id, version).
			Updates(map[string]any{"status": WithdrawalStatusPaid, "paid_by": operatorId, "paid_at": now,
				"payout_ref": payoutRef, "review_note": note, "version": gorm.Expr("version + 1"), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrDistributorConflict
		}
		return tx.Create(&CommissionSettlement{
			Program:           CommissionProgramDistributor,
			BeneficiaryUserId: withdrawal.UserId,
			Trigger:           SettlementTriggerWithdrawPaid,
			BalanceType:       CommissionBalanceTypeDistributor,
			WithdrawalId:      withdrawal.Id,
			CreditedQuota:     withdrawal.AmountQuota,
			BalanceBefore:     profile.BalanceQuota,
			BalanceAfter:      profile.BalanceQuota,
			OperatorId:        operatorId,
			Note:              note,
			CreatedAt:         now,
		}).Error
	})
}

func ListDistributorWithdrawals(userId int, status string, start int, size int) ([]DistributorWithdrawal, int64, error) {
	var total int64
	query := DB.Model(&DistributorWithdrawal{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []DistributorWithdrawal
	err := query.Order("id DESC").Offset(start).Limit(size).Find(&rows).Error
	return rows, total, err
}

func GetDistributorWithdrawal(id int) (*DistributorWithdrawal, error) {
	var withdrawal DistributorWithdrawal
	if err := DB.Where("id = ?", id).Take(&withdrawal).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDistributorNotFound
		}
		return nil, err
	}
	return &withdrawal, nil
}

// DecryptWithdrawalAccount 解密收款账户快照（仅管理端详情接口调用，且要求 distributor.settle）。
// 没有快照的单（如结清线下打款未填账户）返回空表，不报错（R6）。
func DecryptWithdrawalAccount(withdrawal *DistributorWithdrawal) (map[string]string, error) {
	if withdrawal.AccountSnapshot == "" {
		return map[string]string{}, nil
	}
	plain, err := common.DecryptAccountSnapshot(withdrawal.AccountSnapshot)
	if err != nil {
		return nil, err
	}
	var account map[string]string
	if err := common.Unmarshal(plain, &account); err != nil {
		return nil, err
	}
	return account, nil
}

// MaskedWithdrawalAccount 列表脱敏：只显示尾号。
func MaskedWithdrawalAccount(withdrawal *DistributorWithdrawal) string {
	account, err := DecryptWithdrawalAccount(withdrawal)
	if err != nil {
		return ""
	}
	value := account["account"]
	if value == "" {
		value = account["address"]
	}
	runes := []rune(value)
	if len(runes) <= 4 {
		return "****"
	}
	return "****" + string(runes[len(runes)-4:])
}

// TransferDistributorBalanceToQuota 分销余额转入账户余额，即时到账。
func TransferDistributorBalanceToQuota(userId int, amountQuota int) error {
	if amountQuota <= 0 {
		return ErrDistributorInvalid
	}
	var creditedUserQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		ok, err := hasCurrentAgreementTx(tx, userId)
		if err != nil {
			return err
		}
		if !ok {
			return ErrTermsVersionMismatch
		}
		var profile DistributorProfile
		if err := lockForUpdate(tx).Where("user_id = ?", userId).Take(&profile).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDistributorNotFound
			}
			return err
		}
		if amountQuota > profile.BalanceQuota {
			return ErrWithdrawBalance
		}
		var user User
		if err := lockForUpdate(tx).Select("id", "quota").Where("id = ?", userId).Take(&user).Error; err != nil {
			return err
		}
		if amountQuota > common.MaxWalletQuota-user.Quota {
			return common.ValidateWalletQuota(user.Quota + amountQuota)
		}
		if err := tx.Model(&DistributorProfile{}).Where("user_id = ? AND balance_quota >= ?", userId, amountQuota).
			Updates(map[string]any{
				"balance_quota":           gorm.Expr("balance_quota - ?", amountQuota),
				"total_transferred_quota": gorm.Expr("total_transferred_quota + ?", amountQuota),
				"updated_at":              common.GetTimestamp(),
			}).Error; err != nil {
			return err
		}
		result := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, common.MaxWalletQuota-amountQuota).
			Update("quota", gorm.Expr("quota + ?", amountQuota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWalletQuotaLimitExceeded
		}
		creditedUserQuota = user.Quota + amountQuota
		return tx.Create(&CommissionSettlement{
			Program:           CommissionProgramDistributor,
			BeneficiaryUserId: userId,
			Trigger:           SettlementTriggerTransfer,
			BalanceType:       CommissionBalanceTypeDistributor,
			CreditedQuota:     amountQuota,
			BalanceBefore:     profile.BalanceQuota,
			BalanceAfter:      profile.BalanceQuota - amountQuota,
			CreatedAt:         common.GetTimestamp(),
		}).Error
	})
	if err != nil {
		return err
	}
	syncCreditUserQuotaCache(userId, creditedUserQuota, "distributor balance transfer")
	return nil
}

// ---------- 分销钱包信息 ----------

type DistributorWalletInfo struct {
	BalanceQuota          int      `json:"balance_quota"`
	WithdrawingQuota      int      `json:"withdrawing_quota"`
	TotalWithdrawnQuota   int      `json:"total_withdrawn_quota"`
	TotalTransferredQuota int      `json:"total_transferred_quota"`
	DebtQuota             int      `json:"debt_quota"`
	WithdrawEnabled       bool     `json:"withdraw_enabled"`
	MinWithdrawQuota      int      `json:"min_withdraw_quota"`
	MinWithdrawCNY        string   `json:"min_withdraw_cny"`
	USDExchangeRate       float64  `json:"usd_exchange_rate"`
	Methods               []string `json:"methods"`
	UsdtNetworks          []string `json:"usdt_networks"`
}

func GetDistributorWalletInfo(userId int) (*DistributorWalletInfo, error) {
	profile, err := GetDistributorProfileByUser(userId)
	if err != nil {
		return nil, err
	}
	debt, err := GetCommissionDebt(userId, CommissionBalanceTypeDistributor)
	if err != nil {
		return nil, err
	}
	minQuota, _ := operation_setting.WithdrawMinQuota()
	return &DistributorWalletInfo{
		BalanceQuota:          profile.BalanceQuota,
		WithdrawingQuota:      profile.WithdrawingQuota,
		TotalWithdrawnQuota:   profile.TotalWithdrawnQuota,
		TotalTransferredQuota: profile.TotalTransferredQuota,
		DebtQuota:             debt.DebtQuota,
		WithdrawEnabled:       operation_setting.DistributorWithdrawEnabled,
		MinWithdrawQuota:      minQuota,
		MinWithdrawCNY:        operation_setting.DistributorWithdrawMinCNY,
		USDExchangeRate:       operation_setting.USDExchangeRate,
		Methods:               operation_setting.DistributorWithdrawMethods(),
		UsdtNetworks:          operation_setting.DistributorUsdtNetworks(),
	}, nil
}

// DueCommissionForUser 某分销商到期待确认的条数和金额。
func DueCommissionForUser(userId int, now int64) (int, int, error) {
	var row struct {
		Cnt   int `gorm:"column:cnt"`
		Quota int `gorm:"column:quota"`
	}
	err := DB.Model(&CommissionRecord{}).
		Select("COUNT(*) AS cnt, COALESCE(SUM(commission_quota - reversed_quota),0) AS quota").
		Where("beneficiary_user_id = ? AND program = ? AND status = ? AND available_at <= ?",
			userId, CommissionProgramDistributor, CommissionStatusFrozen, now).
		Take(&row).Error
	return row.Cnt, row.Quota, err
}

// ---------- 停用结清（B1.7） ----------

const (
	SettleOutFrozenConfirm   = "confirm"  // 冻结返现整批确认到账
	SettleOutFrozenReverse   = "reverse"  // 冻结返现整批作废
	SettleOutBalanceTransfer = "transfer" // 余额转入账户余额
	SettleOutBalancePayout   = "payout"   // 余额线下打款（生成已打款提现单）
)

// SettleOutPayout 结清"线下打款"参数：实际打款金额、币种与凭证必填，
// 币种必须与提现方式一致；收款账户选填，填了加密保存（R6）。
type SettleOutPayout struct {
	Method   string
	Ref      string
	Currency string
	Amount   string
	Network  string
	Account  map[string]string
}

// SettleOutDistributor 管理员结清停用分销商（§1.2.9）：
// 冻结中的返现按 frozenAction 整批确认（到期按 confirm、未到期按 early 记）或作废，
// 余额按 balanceAction 转入其账户余额或生成已打款提现单（记操作人）。
// 每一步都写结算记录；仅 suspended 档案允许结清；有未完成的提现单时拒绝（R7）。
func SettleOutDistributor(userId int, frozenAction string, balanceAction string, payout SettleOutPayout, reason string, operatorId int) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ErrDistributorInvalid
	}
	if frozenAction != SettleOutFrozenConfirm && frozenAction != SettleOutFrozenReverse {
		return ErrDistributorInvalid
	}
	if balanceAction != SettleOutBalanceTransfer && balanceAction != SettleOutBalancePayout {
		return ErrDistributorInvalid
	}
	var snapshot string
	var fxRate string
	if balanceAction == SettleOutBalancePayout {
		payout.Ref = strings.TrimSpace(payout.Ref)
		if payout.Ref == "" || len(payout.Ref) > 128 {
			return ErrDistributorInvalid
		}
		methods := operation_setting.DistributorWithdrawMethods()
		allowed := false
		for _, m := range methods {
			if m == payout.Method {
				allowed = true
				break
			}
		}
		if !allowed {
			return ErrDistributorInvalid
		}
		expectedCurrency := "CNY"
		if payout.Method == WithdrawMethodUSDT {
			expectedCurrency = "USDT"
			if strings.TrimSpace(payout.Network) == "" {
				return ErrDistributorInvalid
			}
		}
		if payout.Currency != expectedCurrency {
			return ErrDistributorInvalid
		}
		amount, err := decimal.NewFromString(strings.TrimSpace(payout.Amount))
		if err != nil || !amount.IsPositive() || len(payout.Amount) > 32 {
			return ErrDistributorInvalid
		}
		payout.Amount = amount.String()
		fxRate = decimal.NewFromFloat(operation_setting.USDExchangeRate).String()
		if len(payout.Account) > 0 {
			plain, err := common.Marshal(payout.Account)
			if err != nil {
				return err
			}
			snapshot, err = common.EncryptAccountSnapshot(plain)
			if err != nil {
				return err
			}
		}
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var profile DistributorProfile
		err := lockForUpdate(tx).Where("user_id = ?", userId).Take(&profile).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDistributorNotFound
		}
		if err != nil {
			return err
		}
		if profile.Status != DistributorStatusSuspended {
			return ErrDistributorInvalid
		}
		var unfinished int64
		if err := tx.Model(&DistributorWithdrawal{}).
			Where("user_id = ? AND status IN ?", userId, []string{WithdrawalStatusPending, WithdrawalStatusApproved}).
			Count(&unfinished).Error; err != nil {
			return err
		}
		if unfinished > 0 {
			return ErrWithdrawPending
		}
		// 1) 冻结返现逐笔处理
		var frozen []CommissionRecord
		if err := lockForUpdate(tx).
			Where("beneficiary_user_id = ? AND program = ? AND status = ?", userId, CommissionProgramDistributor, CommissionStatusFrozen).
			Order("id").Find(&frozen).Error; err != nil {
			return err
		}
		if len(frozen) > 0 {
			ids := make([]int, 0, len(frozen))
			gross := 0
			early := false
			for i := range frozen {
				ids = append(ids, frozen[i].Id)
				gross += frozen[i].CommissionQuota - frozen[i].ReversedQuota
				if frozen[i].AvailableAt > now {
					early = true
				}
			}
			if frozenAction == SettleOutFrozenConfirm {
				trigger := SettlementTriggerConfirm
				if early {
					trigger = SettlementTriggerEarly
				}
				if err := settleCommissions(tx, userId, ids, trigger, operatorId, reason); err != nil {
					return err
				}
				// settleCommissions 改过 balance_quota，重读
				if err := tx.Select("balance_quota").Where("user_id = ?", userId).Take(&profile).Error; err != nil {
					return err
				}
			} else {
				result := tx.Model(&CommissionRecord{}).
					Where("id IN ? AND status = ?", ids, CommissionStatusFrozen).
					Updates(map[string]any{
						"reversed_quota": gorm.Expr("commission_quota"),
						"status":         CommissionStatusReversed,
						"updated_at":     now,
					})
				if result.Error != nil {
					return result.Error
				}
				if int(result.RowsAffected) != len(ids) {
					return ErrCommissionConflict
				}
				if err := tx.Create(&CommissionSettlement{
					Program:           CommissionProgramDistributor,
					BeneficiaryUserId: userId,
					Trigger:           SettlementTriggerReversal,
					BalanceType:       CommissionBalanceTypeDistributor,
					CommissionCount:   len(ids),
					GrossQuota:        gross,
					BalanceBefore:     profile.BalanceQuota,
					BalanceAfter:      profile.BalanceQuota,
					OperatorId:        operatorId,
					Note:              reason,
					CreatedAt:         now,
				}).Error; err != nil {
					return err
				}
			}
		}
		// 2) 余额清零
		balance := profile.BalanceQuota
		if balance <= 0 {
			return nil
		}
		if balanceAction == SettleOutBalanceTransfer {
			var user User
			if err := lockForUpdate(tx).Select("id", "quota").Where("id = ?", userId).Take(&user).Error; err != nil {
				return err
			}
			if balance > common.MaxWalletQuota-user.Quota {
				return common.ValidateWalletQuota(user.Quota + balance)
			}
			if err := tx.Model(&DistributorProfile{}).Where("user_id = ?", userId).
				Updates(map[string]any{
					"balance_quota":           0,
					"total_transferred_quota": gorm.Expr("total_transferred_quota + ?", balance),
					"updated_at":              now,
				}).Error; err != nil {
				return err
			}
			result := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, common.MaxWalletQuota-balance).
				Update("quota", gorm.Expr("quota + ?", balance))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrWalletQuotaLimitExceeded
			}
			return tx.Create(&CommissionSettlement{
				Program:           CommissionProgramDistributor,
				BeneficiaryUserId: userId,
				Trigger:           SettlementTriggerTransfer,
				BalanceType:       CommissionBalanceTypeDistributor,
				CreditedQuota:     balance,
				BalanceBefore:     balance,
				BalanceAfter:      0,
				OperatorId:        operatorId,
				Note:              reason,
				CreatedAt:         now,
			}).Error
		}
		withdrawal := DistributorWithdrawal{
			UserId:          userId,
			AmountQuota:     balance,
			Method:          payout.Method,
			PayoutCurrency:  payout.Currency,
			PayoutAmount:    payout.Amount,
			FxRate:          fxRate,
			AccountSnapshot: snapshot,
			PayoutNetwork:   payout.Network,
			Status:          WithdrawalStatusPaid,
			ReviewerId:      operatorId,
			ReviewedAt:      now,
			PaidBy:          operatorId,
			PaidAt:          now,
			PayoutRef:       payout.Ref,
			ReviewNote:      reason,
		}
		if err := tx.Create(&withdrawal).Error; err != nil {
			return err
		}
		if err := tx.Model(&DistributorProfile{}).Where("user_id = ?", userId).
			Updates(map[string]any{
				"balance_quota":         0,
				"total_withdrawn_quota": gorm.Expr("total_withdrawn_quota + ?", balance),
				"updated_at":            now,
			}).Error; err != nil {
			return err
		}
		return tx.Create(&CommissionSettlement{
			Program:           CommissionProgramDistributor,
			BeneficiaryUserId: userId,
			Trigger:           SettlementTriggerWithdrawPaid,
			BalanceType:       CommissionBalanceTypeDistributor,
			WithdrawalId:      withdrawal.Id,
			CreditedQuota:     balance,
			BalanceBefore:     balance,
			BalanceAfter:      0,
			OperatorId:        operatorId,
			Note:              reason,
			CreatedAt:         now,
		}).Error
	})
}
