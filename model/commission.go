package model

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 推广与分销返现共用账本。金额全部是 quota 整数；比例是基点（1bp = 0.01%）。

const (
	CommissionProgramReferral    = "referral"
	CommissionProgramDistributor = "distributor"
	// CommissionProgramAll 仅供管理端查询显式使用；归属与记账永远只用具体 program。
	CommissionProgramAll = "all"

	CommissionSourceTypeTopUp = "topup"

	CommissionStatusFrozen   = "frozen"
	CommissionStatusSettled  = "settled"
	CommissionStatusReversed = "reversed"

	CommissionRateSourceCampaign = "campaign"
	CommissionRateSourcePersonal = "personal"
	CommissionRateSourceDefault  = "default"

	CommissionBalanceTypeAffQuota    = "aff_quota"
	CommissionBalanceTypeDistributor = "distributor"

	SettlementTriggerInstant        = "instant"
	SettlementTriggerConfirm        = "confirm"
	SettlementTriggerEarly          = "early"
	SettlementTriggerReversal       = "reversal"
	SettlementTriggerDebtWaive      = "debt_waive"
	SettlementTriggerWithdrawHold   = "withdraw_hold"
	SettlementTriggerWithdrawPaid   = "withdraw_paid"
	SettlementTriggerWithdrawReject = "withdraw_reject"
	SettlementTriggerTransfer       = "transfer"

	CampaignStatusScheduled = "scheduled"
	CampaignStatusCancelled = "cancelled"
	// 以下状态由时间推导，不落库
	CampaignStatusActive = "active"
	CampaignStatusEnded  = "ended"
)

var (
	ErrCommissionInvalid       = errors.New("invalid commission operation")
	ErrCommissionInsufficient  = errors.New("insufficient referral commission balance")
	ErrCommissionNotFound      = errors.New("commission record not found")
	ErrCommissionConflict      = errors.New("commission state changed; refresh and retry")
	ErrCommissionEarlyNoReason = errors.New("early confirmation requires a reason")
	ErrCampaignOverlap         = errors.New("campaign time range overlaps an existing campaign")
	ErrCampaignStarted         = errors.New("a started campaign can only be ended early")
	ErrCampaignHighRate        = errors.New("campaign rate above 30% requires confirmation")
	ErrDebtExceeds             = errors.New("waive amount exceeds outstanding debt")
	ErrCommissionProgram       = errors.New("an explicit commission program is required")
)

// requireCommissionProgram 校验查询/统计入参里的业务线：必须显式给出
// referral 或 distributor；allowAll 为 true 时管理端可传 "all" 查全部。
func requireCommissionProgram(program string, allowAll bool) (string, error) {
	switch program {
	case CommissionProgramReferral, CommissionProgramDistributor:
		return program, nil
	case CommissionProgramAll:
		if allowAll {
			return program, nil
		}
	}
	return "", ErrCommissionProgram
}

func commissionBalanceType(program string) string {
	if program == CommissionProgramDistributor {
		return CommissionBalanceTypeDistributor
	}
	return CommissionBalanceTypeAffQuota
}

type CommissionRecord struct {
	Id                int    `json:"id" gorm:"primaryKey"`
	Program           string `json:"program" gorm:"type:varchar(16);index"`
	SourceType        string `json:"source_type" gorm:"type:varchar(16);uniqueIndex:idx_commission_source,priority:1"`
	SourceId          int    `json:"source_id" gorm:"uniqueIndex:idx_commission_source,priority:2"`
	BeneficiaryUserId int    `json:"beneficiary_user_id" gorm:"index:idx_commission_beneficiary_time,priority:1"`
	InviteeUserId     int    `json:"invitee_user_id" gorm:"index"`
	BaseQuota         int    `json:"base_quota" gorm:"type:bigint"`
	PaidMoney         string `json:"paid_money" gorm:"type:varchar(32)"`
	Currency          string `json:"currency" gorm:"type:varchar(8)"`
	RateBps           int    `json:"rate_bps"`
	RateSource        string `json:"rate_source" gorm:"type:varchar(16)"`
	CampaignId        int    `json:"campaign_id" gorm:"index"`
	CommissionQuota   int    `json:"commission_quota" gorm:"type:bigint"`
	Status            string `json:"status" gorm:"type:varchar(16);index"`
	HoldDays          int    `json:"hold_days"`
	AvailableAt       int64  `json:"available_at" gorm:"type:bigint;index"`
	DueNotifiedAt     int64  `json:"due_notified_at" gorm:"type:bigint;index"`
	SettlementId      int    `json:"settlement_id" gorm:"index"`
	ReversedQuota     int    `json:"reversed_quota" gorm:"type:bigint"`
	TermsVersion      int    `json:"terms_version"`
	PeriodDay         int    `json:"period_day" gorm:"index"`
	CreatedAt         int64  `json:"created_at" gorm:"type:bigint;index:idx_commission_beneficiary_time,priority:2"`
	UpdatedAt         int64  `json:"updated_at" gorm:"type:bigint"`
}

func (r *CommissionRecord) BeforeCreate(_ *gorm.DB) error {
	now := common.GetTimestamp()
	if r.CreatedAt == 0 {
		r.CreatedAt = now
	}
	r.UpdatedAt = now
	return nil
}

type CommissionSettlement struct {
	Id                int    `json:"id" gorm:"primaryKey"`
	Program           string `json:"program" gorm:"type:varchar(16);index"`
	BeneficiaryUserId int    `json:"beneficiary_user_id" gorm:"index:idx_settlement_beneficiary_time,priority:1"`
	Trigger           string `json:"trigger" gorm:"type:varchar(16)"`
	BalanceType       string `json:"balance_type" gorm:"type:varchar(16)"`
	WithdrawalId      int    `json:"withdrawal_id" gorm:"index"`
	CommissionCount   int    `json:"commission_count"`
	GrossQuota        int    `json:"gross_quota" gorm:"type:bigint"`
	DebtOffsetQuota   int    `json:"debt_offset_quota" gorm:"type:bigint"`
	DebtAddedQuota    int    `json:"debt_added_quota" gorm:"type:bigint"`
	DebtBefore        int    `json:"debt_before" gorm:"type:bigint"`
	DebtAfter         int    `json:"debt_after" gorm:"type:bigint"`
	CreditedQuota     int    `json:"credited_quota" gorm:"type:bigint"`
	BalanceBefore     int    `json:"balance_before" gorm:"type:bigint"`
	BalanceAfter      int    `json:"balance_after" gorm:"type:bigint"`
	OperatorId        int    `json:"operator_id"`
	Note              string `json:"note" gorm:"type:text"`
	CreatedAt         int64  `json:"created_at" gorm:"type:bigint;index:idx_settlement_beneficiary_time,priority:2"`
}

type CommissionDebt struct {
	Id               int    `json:"id" gorm:"primaryKey"`
	UserId           int    `json:"user_id" gorm:"uniqueIndex:idx_debt_user_type,priority:1"`
	BalanceType      string `json:"balance_type" gorm:"type:varchar(16);uniqueIndex:idx_debt_user_type,priority:2"`
	DebtQuota        int    `json:"debt_quota" gorm:"type:bigint"`
	TotalDebtQuota   int    `json:"total_debt_quota" gorm:"type:bigint"`
	TotalOffsetQuota int    `json:"total_offset_quota" gorm:"type:bigint"`
	UpdatedAt        int64  `json:"updated_at" gorm:"type:bigint"`
}

type CommissionCampaign struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	Name        string `json:"name" gorm:"type:varchar(64)"`
	Program     string `json:"program" gorm:"type:varchar(16);index:idx_campaign_program_time,priority:1"`
	RateBps     int    `json:"rate_bps"`
	StartsAt    int64  `json:"starts_at" gorm:"type:bigint;index:idx_campaign_program_time,priority:2"`
	EndsAt      int64  `json:"ends_at" gorm:"type:bigint;index:idx_campaign_program_time,priority:3"`
	Status      string `json:"status" gorm:"type:varchar(16)"`
	Description string `json:"description" gorm:"type:text"`
	CreatedBy   int    `json:"created_by"`
	CreatedAt   int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"type:bigint"`
	Version     int    `json:"version"`
}

func (c *CommissionCampaign) EffectiveStatus(now int64) string {
	if c.Status == CampaignStatusCancelled {
		return CampaignStatusCancelled
	}
	switch {
	case now < c.StartsAt:
		return CampaignStatusScheduled
	case now < c.EndsAt:
		return CampaignStatusActive
	default:
		return CampaignStatusEnded
	}
}

// topUpCommissionCurrency 仅用于展示快照；额度计算只走 quota。
func topUpCommissionCurrency(topUp *TopUp) string {
	if topUp.PaymentProvider == PaymentProviderEpay || topUp.PaymentMethod == "" {
		return "CNY"
	}
	return "USD"
}

// topUpCreditedQuota 与各充值完成分支一致的入账额度推导（补账时使用同一口径）。
func topUpCreditedQuota(topUp *TopUp) (int, error) {
	var d decimal.Decimal
	switch {
	case topUp.PaymentProvider == PaymentProviderStripe:
		d = decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	case topUp.PaymentProvider == PaymentProviderCreem:
		// Creem 分支直接以 Amount 为额度单位
		d = decimal.NewFromInt(topUp.Amount)
	default:
		d = decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	}
	return common.WalletQuotaFromDecimalStrict(d)
}

func periodDayOf(ts int64) int {
	day, _ := strconv.Atoi(time.Unix(ts, 0).Local().Format("20060102"))
	return day
}

func activeCampaignFor(program string, at int64) *CommissionCampaign {
	var campaign CommissionCampaign
	err := DB.Where("program = ? AND status = ? AND starts_at <= ? AND ends_at > ?",
		program, CampaignStatusScheduled, at, at).
		Order("starts_at").First(&campaign).Error
	if err != nil {
		return nil
	}
	return &campaign
}

// accrueCommission 在充值事务提交后调用；任何失败都不影响已完成的充值，只记录日志。
func accrueCommission(topUp *TopUp, creditedQuota int) {
	if topUp == nil || creditedQuota <= 0 {
		return
	}
	if err := doAccrueCommission(topUp, creditedQuota); err != nil {
		common.SysError(fmt.Sprintf("commission accrual failed for top-up %d: %s", topUp.Id, err.Error()))
	}
}

func doAccrueCommission(topUp *TopUp, creditedQuota int) error {
	// 归属在注册时写入 invite_attributions：用推广链接注册的永远算推广，
	// 用分销链接注册的永远算分销，不再按邀请人当前身份推断。
	var attr InviteAttribution
	if err := DB.Select("program", "inviter_user_id").Where("invitee_user_id = ?", topUp.UserId).Take(&attr).Error; err != nil {
		return nil
	}
	inviterId := attr.InviterUserId
	if inviterId <= 0 || inviterId == topUp.UserId {
		return nil
	}
	program := attr.Program
	completeAt := topUp.CompleteTime
	if completeAt <= 0 {
		completeAt = common.GetTimestamp()
	}
	var rateBps, campaignId, holdDays int
	rateSource := CommissionRateSourceDefault
	if program == CommissionProgramDistributor {
		if !operation_setting.DistributorEnabled {
			return nil
		}
		// 记账路径不走缓存（B1.3）；分销商已停用则这笔不返现，也不降级为推广
		var profile DistributorProfile
		err := DB.Select("status", "rate_bps", "hold_days").Where("user_id = ?", inviterId).Take(&profile).Error
		if err != nil || profile.Status != DistributorStatusActive {
			common.SysLog(fmt.Sprintf("commission skipped for top-up %d: distributor %d is not active", topUp.Id, inviterId))
			return nil
		}
		if profile.HoldDays != nil {
			holdDays = *profile.HoldDays
		} else {
			holdDays = operation_setting.DistributorHoldDays
		}
		if campaign := activeCampaignFor(program, completeAt); campaign != nil {
			rateBps, rateSource, campaignId = campaign.RateBps, CommissionRateSourceCampaign, campaign.Id
		} else if profile.RateBps != nil {
			rateBps, rateSource = *profile.RateBps, CommissionRateSourcePersonal
		} else {
			rateBps = operation_setting.DistributorDefaultRateBps
		}
	} else {
		if !operation_setting.ReferralCommissionEnabled {
			return nil
		}
		if campaign := activeCampaignFor(program, completeAt); campaign != nil {
			rateBps, rateSource, campaignId = campaign.RateBps, CommissionRateSourceCampaign, campaign.Id
		} else {
			rateBps = operation_setting.ReferralRateBps
		}
	}
	rateBps = min(max(rateBps, 0), operation_setting.MaxCommissionRateBps)
	if rateBps == 0 {
		return nil
	}
	commissionDec := decimal.NewFromInt(int64(creditedQuota)).
		Mul(decimal.NewFromInt(int64(rateBps))).
		Div(decimal.NewFromInt(10000)).
		Truncate(0)
	commissionQuota, clamp := common.QuotaFromDecimalChecked(commissionDec)
	if clamp != nil {
		common.SysError(fmt.Sprintf("commission quota clamped for top-up %d: %s", topUp.Id, clamp.Error()))
	}
	if commissionQuota <= 0 {
		return nil
	}
	record := &CommissionRecord{
		Program:           program,
		SourceType:        CommissionSourceTypeTopUp,
		SourceId:          topUp.Id,
		BeneficiaryUserId: inviterId,
		InviteeUserId:     topUp.UserId,
		BaseQuota:         creditedQuota,
		PaidMoney:         decimal.NewFromFloat(topUp.Money).StringFixed(2),
		Currency:          topUpCommissionCurrency(topUp),
		RateBps:           rateBps,
		RateSource:        rateSource,
		CampaignId:        campaignId,
		CommissionQuota:   commissionQuota,
		Status:            CommissionStatusFrozen,
		HoldDays:          holdDays,
		TermsVersion:      termsVersionForProgram(program),
		PeriodDay:         periodDayOf(completeAt),
	}
	if program == CommissionProgramDistributor {
		record.AvailableAt = completeAt + int64(holdDays)*86400
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(record)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil // 重放或补账：已记过
		}
		if program == CommissionProgramReferral {
			return settleCommissions(tx, inviterId, []int{record.Id}, SettlementTriggerInstant, 0, "")
		}
		return nil
	})
}

// settleCommissions 把处于 frozen 的流水结算进对应余额，先抵扣同类型欠款。
// 必须在事务内调用。
func settleCommissions(tx *gorm.DB, beneficiaryId int, recordIds []int, trigger string, operatorId int, note string) error {
	if len(recordIds) == 0 {
		return nil
	}
	var records []CommissionRecord
	if err := lockForUpdate(tx).Where("id IN ? AND status = ?", recordIds, CommissionStatusFrozen).Order("id").Find(&records).Error; err != nil {
		return err
	}
	if len(records) != len(recordIds) {
		return ErrCommissionConflict
	}
	program := records[0].Program
	for i := range records {
		if records[i].Program != program || records[i].BeneficiaryUserId != beneficiaryId {
			return ErrCommissionInvalid
		}
	}
	gross := 0
	for i := range records {
		gross += records[i].CommissionQuota - records[i].ReversedQuota
	}
	if gross < 0 {
		return ErrCommissionInvalid
	}
	balanceType := commissionBalanceType(program)
	debtBefore, debtAfter, offset, err := offsetCommissionDebt(tx, beneficiaryId, balanceType, gross)
	if err != nil {
		return err
	}
	credited := gross - offset
	var balanceBefore, balanceAfter int
	if program == CommissionProgramReferral {
		var user User
		if err := lockForUpdate(tx).Select("id", "aff_quota").Where("id = ?", beneficiaryId).Take(&user).Error; err != nil {
			return err
		}
		balanceBefore = user.AffQuota
		if credited > 0 {
			if credited > common.MaxWalletQuota-user.AffQuota {
				return common.ValidateWalletQuota(user.AffQuota + credited)
			}
			result := tx.Model(&User{}).Where("id = ? AND aff_quota = ?", beneficiaryId, user.AffQuota).
				Updates(map[string]any{"aff_quota": gorm.Expr("aff_quota + ?", credited), "aff_history": gorm.Expr("aff_history + ?", credited)})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrCommissionConflict
			}
		}
		balanceAfter = user.AffQuota + credited
	} else {
		var profile DistributorProfile
		if err := lockForUpdate(tx).Where("user_id = ?", beneficiaryId).Take(&profile).Error; err != nil {
			return err
		}
		balanceBefore = profile.BalanceQuota
		if credited > 0 {
			if credited > common.MaxWalletQuota-profile.BalanceQuota {
				return common.ValidateWalletQuota(profile.BalanceQuota + credited)
			}
			result := tx.Model(&DistributorProfile{}).Where("user_id = ? AND balance_quota = ?", beneficiaryId, profile.BalanceQuota).
				Update("balance_quota", gorm.Expr("balance_quota + ?", credited))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrCommissionConflict
			}
		}
		balanceAfter = profile.BalanceQuota + credited
	}
	settlement := &CommissionSettlement{
		Program:           program,
		BeneficiaryUserId: beneficiaryId,
		Trigger:           trigger,
		BalanceType:       balanceType,
		CommissionCount:   len(records),
		GrossQuota:        gross,
		DebtOffsetQuota:   offset,
		DebtBefore:        debtBefore,
		DebtAfter:         debtAfter,
		CreditedQuota:     credited,
		BalanceBefore:     balanceBefore,
		BalanceAfter:      balanceAfter,
		OperatorId:        operatorId,
		Note:              note,
		CreatedAt:         common.GetTimestamp(),
	}
	if err := tx.Create(settlement).Error; err != nil {
		return err
	}
	ids := make([]int, 0, len(records))
	for i := range records {
		ids = append(ids, records[i].Id)
	}
	result := tx.Model(&CommissionRecord{}).Where("id IN ? AND status = ?", ids, CommissionStatusFrozen).
		Updates(map[string]any{"status": CommissionStatusSettled, "settlement_id": settlement.Id, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return result.Error
	}
	if int(result.RowsAffected) != len(ids) {
		return ErrCommissionConflict
	}
	return nil
}

// offsetCommissionDebt 用本次返现抵扣欠款；返回抵扣前后的欠款快照与抵扣额。事务内调用。
func offsetCommissionDebt(tx *gorm.DB, userId int, balanceType string, gross int) (before, after, offset int, err error) {
	var debt CommissionDebt
	err = lockForUpdate(tx).Where("user_id = ? AND balance_type = ?", userId, balanceType).Take(&debt).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, 0, 0, nil
	}
	if err != nil {
		return 0, 0, 0, err
	}
	before = debt.DebtQuota
	offset = min(gross, debt.DebtQuota)
	if offset <= 0 {
		return before, before, 0, nil
	}
	after = debt.DebtQuota - offset
	result := tx.Model(&CommissionDebt{}).Where("id = ? AND debt_quota = ?", debt.Id, debt.DebtQuota).
		Updates(map[string]any{"debt_quota": after, "total_offset_quota": gorm.Expr("total_offset_quota + ?", offset), "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return 0, 0, 0, result.Error
	}
	if result.RowsAffected != 1 {
		return 0, 0, 0, ErrCommissionConflict
	}
	return before, after, offset, nil
}

// addCommissionDebt 增加欠款（冲正时余额不够扣的差额）。事务内调用。
func addCommissionDebt(tx *gorm.DB, userId int, balanceType string, amount int) (before, after int, err error) {
	if amount <= 0 {
		return 0, 0, nil
	}
	var debt CommissionDebt
	err = lockForUpdate(tx).Where("user_id = ? AND balance_type = ?", userId, balanceType).Take(&debt).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		debt = CommissionDebt{UserId: userId, BalanceType: balanceType, DebtQuota: amount, TotalDebtQuota: amount, UpdatedAt: common.GetTimestamp()}
		if err = tx.Create(&debt).Error; err != nil {
			return 0, 0, err
		}
		return 0, amount, nil
	case err != nil:
		return 0, 0, err
	}
	before = debt.DebtQuota
	after = debt.DebtQuota + amount
	if err = tx.Model(&CommissionDebt{}).Where("id = ?", debt.Id).
		Updates(map[string]any{"debt_quota": after, "total_debt_quota": gorm.Expr("total_debt_quota + ?", amount), "updated_at": common.GetTimestamp()}).Error; err != nil {
		return 0, 0, err
	}
	return before, after, nil
}

// reverseCommissionClawTx 对已结算流水按 claw 金额从对应余额扣回，不足记欠款。
// 锁顺序与 settleCommissions 一致：先欠款行、再余额行，避免并发死锁。
func reverseCommissionClawTx(tx *gorm.DB, record *CommissionRecord, claw int, operatorId int, note string) error {
	if claw <= 0 {
		return nil
	}
	balanceType := commissionBalanceType(record.Program)
	var existingDebt CommissionDebt
	err := lockForUpdate(tx).Where("user_id = ? AND balance_type = ?", record.BeneficiaryUserId, balanceType).Take(&existingDebt).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	var balanceBefore, take int
	if record.Program == CommissionProgramReferral {
		var user User
		if err := lockForUpdate(tx).Select("id", "aff_quota").Where("id = ?", record.BeneficiaryUserId).Take(&user).Error; err != nil {
			return err
		}
		balanceBefore = user.AffQuota
		take = min(claw, user.AffQuota)
		if take > 0 {
			result := tx.Model(&User{}).Where("id = ? AND aff_quota >= ?", user.Id, take).Update("aff_quota", gorm.Expr("aff_quota - ?", take))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrCommissionConflict
			}
		}
	} else {
		var profile DistributorProfile
		if err := lockForUpdate(tx).Where("user_id = ?", record.BeneficiaryUserId).Take(&profile).Error; err != nil {
			return err
		}
		balanceBefore = profile.BalanceQuota
		take = min(claw, profile.BalanceQuota)
		if take > 0 {
			result := tx.Model(&DistributorProfile{}).Where("user_id = ? AND balance_quota >= ?", profile.UserId, take).
				Update("balance_quota", gorm.Expr("balance_quota - ?", take))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrCommissionConflict
			}
		}
	}
	debtBefore, debtAfter, err := addCommissionDebt(tx, record.BeneficiaryUserId, balanceType, claw-take)
	if err != nil {
		return err
	}
	return tx.Create(&CommissionSettlement{
		Program:           record.Program,
		BeneficiaryUserId: record.BeneficiaryUserId,
		Trigger:           SettlementTriggerReversal,
		BalanceType:       balanceType,
		CommissionCount:   1,
		GrossQuota:        claw,
		DebtAddedQuota:    claw - take,
		DebtBefore:        debtBefore,
		DebtAfter:         debtAfter,
		CreditedQuota:     take,
		BalanceBefore:     balanceBefore,
		BalanceAfter:      balanceBefore - take,
		OperatorId:        operatorId,
		Note:              note,
		CreatedAt:         common.GetTimestamp(),
	}).Error
}

// reverseCommissionsForTopUpTx 按累计冲正比例调整流水 reversed_quota。
// 在支付冲正事务内调用，receiptReversedTotal 是回执更新后的累计冲正额度。
func reverseCommissionsForTopUpTx(tx *gorm.DB, topUpId int, receiptReversedTotal int, receiptCredited int) error {
	if receiptReversedTotal <= 0 || receiptCredited <= 0 {
		return nil
	}
	var record CommissionRecord
	err := lockForUpdate(tx).Where("source_type = ? AND source_id = ?", CommissionSourceTypeTopUp, topUpId).Take(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	targetDec := decimal.NewFromInt(int64(record.CommissionQuota)).
		Mul(decimal.NewFromInt(int64(receiptReversedTotal))).
		Div(decimal.NewFromInt(int64(receiptCredited))).
		Truncate(0)
	target, clamp := common.QuotaFromDecimalChecked(targetDec)
	if clamp != nil {
		return clamp
	}
	target = min(target, record.CommissionQuota)
	increment := target - record.ReversedQuota
	if increment <= 0 {
		return nil
	}
	newReversed := record.ReversedQuota + increment
	newStatus := record.Status
	if newReversed >= record.CommissionQuota {
		newStatus = CommissionStatusReversed
	}
	result := tx.Model(&CommissionRecord{}).Where("id = ? AND reversed_quota = ?", record.Id, record.ReversedQuota).
		Updates(map[string]any{"reversed_quota": newReversed, "status": newStatus, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrCommissionConflict
	}
	if record.Status == CommissionStatusSettled {
		return reverseCommissionClawTx(tx, &record, increment, 0, "refund reversal")
	}
	return nil
}

// ReverseCommissionRecord 管理端手动对单条流水全额冲正。
func ReverseCommissionRecord(recordId int, reason string, operatorId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var record CommissionRecord
		err := lockForUpdate(tx).Where("id = ?", recordId).Take(&record).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCommissionNotFound
		}
		if err != nil {
			return err
		}
		if record.Status == CommissionStatusReversed {
			return ErrCommissionConflict
		}
		claw := record.CommissionQuota - record.ReversedQuota
		result := tx.Model(&CommissionRecord{}).Where("id = ? AND status = ?", record.Id, record.Status).
			Updates(map[string]any{"reversed_quota": record.CommissionQuota, "status": CommissionStatusReversed, "updated_at": common.GetTimestamp()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrCommissionConflict
		}
		if record.Status == CommissionStatusSettled {
			return reverseCommissionClawTx(tx, &record, claw, operatorId, reason)
		}
		return nil
	})
}

// ConfirmCommissions 管理员确认分销返现（可整组）。未到期流水要求理由，按 early 结算。
func ConfirmCommissions(recordIds []int, operatorId int, note string) error {
	if len(recordIds) == 0 {
		return ErrCommissionInvalid
	}
	now := common.GetTimestamp()
	var records []CommissionRecord
	if err := DB.Where("id IN ?", recordIds).Find(&records).Error; err != nil {
		return err
	}
	if len(records) != len(recordIds) {
		return ErrCommissionNotFound
	}
	early := false
	byBeneficiary := map[int][]int{}
	for i := range records {
		r := &records[i]
		if r.Program != CommissionProgramDistributor {
			return ErrCommissionInvalid
		}
		if r.Status != CommissionStatusFrozen {
			return ErrCommissionConflict
		}
		if r.AvailableAt > now {
			early = true
		}
		byBeneficiary[r.BeneficiaryUserId] = append(byBeneficiary[r.BeneficiaryUserId], r.Id)
	}
	trigger := SettlementTriggerConfirm
	if early {
		if note == "" {
			return ErrCommissionEarlyNoReason
		}
		trigger = SettlementTriggerEarly
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		for beneficiaryId, ids := range byBeneficiary {
			if err := settleCommissions(tx, beneficiaryId, ids, trigger, operatorId, note); err != nil {
				return err
			}
		}
		return nil
	})
}

// AdjustCommissionAvailableAt 调整单条冻结流水的到账时间，同时清零已提醒标记。
func AdjustCommissionAvailableAt(recordId int, availableAt int64, reason string, operatorId int) error {
	if reason == "" || availableAt <= 0 {
		return ErrCommissionInvalid
	}
	result := DB.Model(&CommissionRecord{}).
		Where("id = ? AND status = ? AND program = ?", recordId, CommissionStatusFrozen, CommissionProgramDistributor).
		Updates(map[string]any{"available_at": availableAt, "due_notified_at": 0, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrCommissionNotFound
	}
	return nil
}

// WaiveCommissionDebt 减免欠款；把减免额计入 total_offset 以保持 total_debt - total_offset == debt 恒等式。
func WaiveCommissionDebt(userId int, balanceType string, amount int, reason string, operatorId int) error {
	if amount <= 0 || reason == "" {
		return ErrCommissionInvalid
	}
	if balanceType != CommissionBalanceTypeAffQuota && balanceType != CommissionBalanceTypeDistributor {
		return ErrCommissionInvalid
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var debt CommissionDebt
		if err := lockForUpdate(tx).Where("user_id = ? AND balance_type = ?", userId, balanceType).Take(&debt).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDebtExceeds
			}
			return err
		}
		if amount > debt.DebtQuota {
			return ErrDebtExceeds
		}
		result := tx.Model(&CommissionDebt{}).Where("id = ? AND debt_quota >= ?", debt.Id, amount).
			Updates(map[string]any{
				"debt_quota":         gorm.Expr("debt_quota - ?", amount),
				"total_offset_quota": gorm.Expr("total_offset_quota + ?", amount),
				"updated_at":         common.GetTimestamp(),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrCommissionConflict
		}
		return tx.Create(&CommissionSettlement{
			Program:           commissionProgramOf(balanceType),
			BeneficiaryUserId: userId,
			Trigger:           SettlementTriggerDebtWaive,
			BalanceType:       balanceType,
			DebtOffsetQuota:   amount,
			DebtBefore:        debt.DebtQuota,
			DebtAfter:         debt.DebtQuota - amount,
			OperatorId:        operatorId,
			Note:              reason,
			CreatedAt:         common.GetTimestamp(),
		}).Error
	})
}

func commissionProgramOf(balanceType string) string {
	if balanceType == CommissionBalanceTypeDistributor {
		return CommissionProgramDistributor
	}
	return CommissionProgramReferral
}

// MarkDueCommissionsNotified 把已到期待确认且未提醒过的分销流水标记为已提醒，返回受影响的分销商。
func MarkDueCommissionsNotified(now int64) (map[int]int, error) {
	var rows []struct {
		BeneficiaryUserId int `gorm:"column:beneficiary_user_id"`
		Cnt               int `gorm:"column:cnt"`
	}
	if err := DB.Model(&CommissionRecord{}).
		Select("beneficiary_user_id, COUNT(*) AS cnt").
		Where("program = ? AND status = ? AND available_at <= ? AND due_notified_at = 0", CommissionProgramDistributor, CommissionStatusFrozen, now).
		Group("beneficiary_user_id").Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	if err := DB.Model(&CommissionRecord{}).
		Where("program = ? AND status = ? AND available_at <= ? AND due_notified_at = 0", CommissionProgramDistributor, CommissionStatusFrozen, now).
		Update("due_notified_at", now).Error; err != nil {
		return nil, err
	}
	summary := make(map[int]int, len(rows))
	for _, row := range rows {
		summary[row.BeneficiaryUserId] = row.Cnt
	}
	return summary, nil
}

// DueCommissionSummary 到期待确认的分销流水汇总（管理端徽标与提醒用）。
func DueCommissionSummary(now int64) (count int, quota int, oldestWaitDays int, err error) {
	var row struct {
		Cnt      int   `gorm:"column:cnt"`
		Quota    int   `gorm:"column:quota"`
		MinAvail int64 `gorm:"column:min_avail"`
	}
	err = DB.Model(&CommissionRecord{}).
		Select("COUNT(*) AS cnt, COALESCE(SUM(commission_quota - reversed_quota), 0) AS quota, COALESCE(MIN(available_at), 0) AS min_avail").
		Where("program = ? AND status = ? AND available_at <= ?", CommissionProgramDistributor, CommissionStatusFrozen, now).
		Take(&row).Error
	if err != nil {
		return 0, 0, 0, err
	}
	waitDays := 0
	if row.MinAvail > 0 {
		waitDays = int((now - row.MinAvail) / 86400)
	}
	return row.Cnt, row.Quota, waitDays, nil
}

// ---------- 列表查询 ----------

type CommissionRecordFilter struct {
	Program       string
	Status        string // "due" 展开为 frozen + available_at<=now
	BeneficiaryId int
	InviteeId     int
	DueOnly       bool
	Start         int
	Size          int
}

func ListCommissionRecords(filter CommissionRecordFilter) ([]CommissionRecord, int64, error) {
	var total int64
	if _, err := requireCommissionProgram(filter.Program, true); err != nil {
		return nil, 0, err
	}
	query := DB.Model(&CommissionRecord{})
	if filter.Program != CommissionProgramAll {
		query = query.Where("program = ?", filter.Program)
	}
	if filter.BeneficiaryId > 0 {
		query = query.Where("beneficiary_user_id = ?", filter.BeneficiaryId)
	}
	if filter.InviteeId > 0 {
		query = query.Where("invitee_user_id = ?", filter.InviteeId)
	}
	switch filter.Status {
	case "due":
		query = query.Where("status = ? AND available_at <= ?", CommissionStatusFrozen, common.GetTimestamp())
	case "":
	default:
		query = query.Where("status = ?", filter.Status)
	}
	if filter.DueOnly {
		query = query.Where("status = ? AND available_at <= ?", CommissionStatusFrozen, common.GetTimestamp())
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var records []CommissionRecord
	err := query.Order("id DESC").Offset(filter.Start).Limit(filter.Size).Find(&records).Error
	return records, total, err
}

// GetCommissionRecord 按主键取流水；不存在返回 ErrCommissionNotFound。
func GetCommissionRecord(id int) (*CommissionRecord, error) {
	var record CommissionRecord
	if err := DB.Where("id = ?", id).Take(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCommissionNotFound
		}
		return nil, err
	}
	return &record, nil
}

// GetCommissionRecordsByIds 批量取流水（确认到账通知按受益人聚合用）。
func GetCommissionRecordsByIds(ids []int) ([]CommissionRecord, error) {
	var records []CommissionRecord
	err := DB.Where("id IN ?", ids).Find(&records).Error
	return records, err
}

func ListCommissionSettlements(userId int, program string, trigger string, start int, size int) ([]CommissionSettlement, int64, error) {
	var total int64
	if _, err := requireCommissionProgram(program, true); err != nil {
		return nil, 0, err
	}
	query := DB.Model(&CommissionSettlement{})
	if userId > 0 {
		query = query.Where("beneficiary_user_id = ?", userId)
	}
	if program != CommissionProgramAll {
		query = query.Where("program = ?", program)
	}
	if trigger != "" {
		query = query.Where(map[string]any{"trigger": trigger})
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []CommissionSettlement
	err := query.Order("id DESC").Offset(start).Limit(size).Find(&rows).Error
	return rows, total, err
}

func ListCommissionDebts(userId int, program string) ([]CommissionDebt, error) {
	if _, err := requireCommissionProgram(program, true); err != nil {
		return nil, err
	}
	var rows []CommissionDebt
	query := DB.Model(&CommissionDebt{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	switch program {
	case CommissionProgramReferral:
		query = query.Where("balance_type = ?", CommissionBalanceTypeAffQuota)
	case CommissionProgramDistributor:
		query = query.Where("balance_type = ?", CommissionBalanceTypeDistributor)
	}
	err := query.Order("id").Find(&rows).Error
	return rows, err
}

func GetCommissionDebt(userId int, balanceType string) (*CommissionDebt, error) {
	var debt CommissionDebt
	err := DB.Where("user_id = ? AND balance_type = ?", userId, balanceType).Take(&debt).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &CommissionDebt{UserId: userId, BalanceType: balanceType}, nil
	}
	if err != nil {
		return nil, err
	}
	return &debt, nil
}

// ---------- 汇总与趋势 ----------

// CountInvitees 统计邀请人在指定业务线下的被邀请人数；归属以 invite_attributions 为准。
func CountInvitees(inviterId int, program string) (int64, error) {
	if _, err := requireCommissionProgram(program, false); err != nil {
		return 0, err
	}
	var count int64
	err := DB.Model(&InviteAttribution{}).Where(&InviteAttribution{InviterUserId: inviterId, Program: program}).Count(&count).Error
	return count, err
}

// CommissionTotals 聚合一个受益人的流水统计（用于看板）。
func CommissionTotals(beneficiaryId int, program string) (map[string]int, error) {
	if _, err := requireCommissionProgram(program, false); err != nil {
		return nil, err
	}
	var rows []struct {
		Status string `gorm:"column:status"`
		Cnt    int    `gorm:"column:cnt"`
		Quota  int    `gorm:"column:quota"`
		Base   int    `gorm:"column:base"`
	}
	if err := DB.Model(&CommissionRecord{}).
		Select("status, COUNT(*) AS cnt, COALESCE(SUM(commission_quota - reversed_quota),0) AS quota, COALESCE(SUM(base_quota),0) AS base").
		Where("beneficiary_user_id = ? AND program = ?", beneficiaryId, program).
		Group("status").Find(&rows).Error; err != nil {
		return nil, err
	}
	totals := map[string]int{"frozen_count": 0, "frozen_quota": 0, "settled_quota": 0, "reversed_quota": 0, "topup_base_quota": 0}
	for _, row := range rows {
		totals["topup_base_quota"] += row.Base
		switch row.Status {
		case CommissionStatusFrozen:
			totals["frozen_count"] = row.Cnt
			totals["frozen_quota"] = row.Quota
		case CommissionStatusSettled:
			totals["settled_quota"] = row.Quota
		case CommissionStatusReversed:
			totals["reversed_quota"] = row.Quota
		}
	}
	return totals, nil
}

// CommissionTrend 按 period_day 聚合近 days 天的流水。
func CommissionTrend(beneficiaryId int, program string, days int) ([]map[string]any, error) {
	if _, err := requireCommissionProgram(program, false); err != nil {
		return nil, err
	}
	if days != 7 && days != 30 && days != 90 {
		days = 30
	}
	minDay := periodDayOf(time.Now().AddDate(0, 0, -days).Unix())
	var rows []struct {
		PeriodDay int `gorm:"column:period_day"`
		Quota     int `gorm:"column:quota"`
		Cnt       int `gorm:"column:cnt"`
	}
	if err := DB.Model(&CommissionRecord{}).
		Select("period_day, COALESCE(SUM(commission_quota - reversed_quota),0) AS quota, COUNT(*) AS cnt").
		Where("beneficiary_user_id = ? AND program = ? AND period_day >= ?", beneficiaryId, program, minDay).
		Group("period_day").Order("period_day").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{"day": row.PeriodDay, "commission_quota": row.Quota, "count": row.Cnt})
	}
	return out, nil
}

// ListInvitees 返回指定业务线下的被邀请人脱敏列表：用户名、注册时间、该人产生
// 的返现基数合计。人员名单来自 invite_attributions（注册时定死的归属），
// 不随邀请人后来的身份变化而漂移。
func ListInvitees(inviterId int, program string, start int, size int) ([]map[string]any, int64, error) {
	total, err := CountInvitees(inviterId, program)
	if err != nil {
		return nil, 0, err
	}
	var attrs []InviteAttribution
	if err := DB.Select("invitee_user_id").Where(&InviteAttribution{InviterUserId: inviterId, Program: program}).
		Order("invitee_user_id DESC").Offset(start).Limit(size).Find(&attrs).Error; err != nil {
		return nil, 0, err
	}
	ids := make([]int, 0, len(attrs))
	for i := range attrs {
		ids = append(ids, attrs[i].InviteeUserId)
	}
	usersById := map[int]User{}
	if len(ids) > 0 {
		var users []User
		if err := DB.Select("id", "username", "created_at").Where("id IN ?", ids).Find(&users).Error; err != nil {
			return nil, 0, err
		}
		for i := range users {
			usersById[users[i].Id] = users[i]
		}
	}
	baseByInvitee := map[int]int{}
	if len(ids) > 0 {
		var sums []struct {
			InviteeUserId int `gorm:"column:invitee_user_id"`
			Base          int `gorm:"column:base"`
		}
		if err := DB.Model(&CommissionRecord{}).
			Select("invitee_user_id, COALESCE(SUM(base_quota),0) AS base").
			Where("beneficiary_user_id = ? AND program = ? AND invitee_user_id IN ?", inviterId, program, ids).
			Group("invitee_user_id").Find(&sums).Error; err != nil {
			return nil, 0, err
		}
		for _, s := range sums {
			baseByInvitee[s.InviteeUserId] = s.Base
		}
	}
	out := make([]map[string]any, 0, len(attrs))
	for i := range attrs {
		user, ok := usersById[attrs[i].InviteeUserId]
		if !ok {
			continue
		}
		out = append(out, map[string]any{
			"username":    maskUsername(user.Username),
			"created_at":  user.CreatedAt,
			"topup_quota": baseByInvitee[user.Id],
		})
	}
	return out, total, nil
}

// MaskInviteeName 返回被邀请人的脱敏用户名；查不到返回 "***"。
func MaskInviteeName(userId int) string {
	var user User
	if err := DB.Select("username").Where("id = ?", userId).Take(&user).Error; err != nil {
		return "***"
	}
	return maskUsername(user.Username)
}

func maskUsername(name string) string {
	runes := []rune(name)
	if len(runes) == 0 {
		return "***"
	}
	if len(runes) <= 2 {
		return string(runes[:1]) + "***"
	}
	return string(runes[:1]) + "***" + string(runes[len(runes)-1:])
}

// ---------- 活动 CRUD ----------

func campaignTimeOverlap(tx *gorm.DB, program string, excludeId int, startsAt, endsAt int64) (bool, error) {
	var count int64
	query := tx.Model(&CommissionCampaign{}).
		Where("program = ? AND status = ? AND starts_at < ? AND ends_at > ?", program, CampaignStatusScheduled, endsAt, startsAt)
	if excludeId > 0 {
		query = query.Where("id != ?", excludeId)
	}
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func CreateCommissionCampaign(name, program string, rateBps int, startsAt, endsAt int64, description string, confirmHighRate bool, createdBy int) (*CommissionCampaign, error) {
	name = fmt.Sprintf("%.64s", name)
	if program != CommissionProgramReferral && program != CommissionProgramDistributor {
		return nil, ErrCommissionInvalid
	}
	if rateBps <= 0 || rateBps > operation_setting.MaxCommissionRateBps || startsAt <= 0 || endsAt <= startsAt || name == "" {
		return nil, ErrCommissionInvalid
	}
	if rateBps > operation_setting.CommissionHighRateBps && !confirmHighRate {
		return nil, ErrCampaignHighRate
	}
	campaign := &CommissionCampaign{Name: name, Program: program, RateBps: rateBps, StartsAt: startsAt, EndsAt: endsAt,
		Status: CampaignStatusScheduled, Description: description, CreatedBy: createdBy, Version: 1,
		CreatedAt: common.GetTimestamp(), UpdatedAt: common.GetTimestamp()}
	err := DB.Transaction(func(tx *gorm.DB) error {
		overlap, err := campaignTimeOverlap(tx, program, 0, startsAt, endsAt)
		if err != nil {
			return err
		}
		if overlap {
			return ErrCampaignOverlap
		}
		return tx.Create(campaign).Error
	})
	if err != nil {
		return nil, err
	}
	return campaign, nil
}

func UpdateCommissionCampaign(id int, name string, rateBps int, startsAt, endsAt int64, description string, confirmHighRate bool, version int, operatorId int) error {
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var campaign CommissionCampaign
		err := lockForUpdate(tx).Where("id = ?", id).Take(&campaign).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCommissionNotFound
		}
		if err != nil {
			return err
		}
		if campaign.Version != version || campaign.Status != CampaignStatusScheduled {
			return ErrCommissionConflict
		}
		started := campaign.StartsAt <= now
		if rateBps > operation_setting.CommissionHighRateBps && !confirmHighRate {
			return ErrCampaignHighRate
		}
		if started {
			// 已开始的只能把结束时间提前；其他字段必须保持不变
			if endsAt <= now || endsAt >= campaign.EndsAt || rateBps != campaign.RateBps || startsAt != campaign.StartsAt || name != campaign.Name {
				return ErrCampaignStarted
			}
		} else if rateBps <= 0 || rateBps > operation_setting.MaxCommissionRateBps || startsAt <= 0 || endsAt <= startsAt {
			return ErrCommissionInvalid
		}
		overlap, err := campaignTimeOverlap(tx, campaign.Program, campaign.Id, startsAt, endsAt)
		if err != nil {
			return err
		}
		if overlap {
			return ErrCampaignOverlap
		}
		result := tx.Model(&CommissionCampaign{}).Where("id = ? AND version = ?", id, version).
			Updates(map[string]any{"name": name, "rate_bps": rateBps, "starts_at": startsAt, "ends_at": endsAt,
				"description": description, "version": gorm.Expr("version + 1"), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrCommissionConflict
		}
		return nil
	})
}

func CancelCommissionCampaign(id int, version int, operatorId int) error {
	now := common.GetTimestamp()
	result := DB.Model(&CommissionCampaign{}).
		Where("id = ? AND version = ? AND status = ? AND starts_at > ?", id, version, CampaignStatusScheduled, now).
		Updates(map[string]any{"status": CampaignStatusCancelled, "version": gorm.Expr("version + 1"), "updated_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrCampaignStarted
	}
	return nil
}

func ListCommissionCampaigns(program string, start int, size int) ([]CommissionCampaign, int64, error) {
	var total int64
	if _, err := requireCommissionProgram(program, true); err != nil {
		return nil, 0, err
	}
	query := DB.Model(&CommissionCampaign{})
	if program != CommissionProgramAll {
		query = query.Where("program = ?", program)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var campaigns []CommissionCampaign
	err := query.Order("id DESC").Offset(start).Limit(size).Find(&campaigns).Error
	return campaigns, total, err
}

// GetCommissionCampaign 按主键取活动；不存在返回 ErrCommissionNotFound。
func GetCommissionCampaign(id int) (*CommissionCampaign, error) {
	var campaign CommissionCampaign
	if err := DB.Where("id = ?", id).Take(&campaign).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCommissionNotFound
		}
		return nil, err
	}
	return &campaign, nil
}

// ListVisibleCampaigns 用户侧：进行中与即将开始的活动。
func ListVisibleCampaigns(now int64) ([]CommissionCampaign, error) {
	var campaigns []CommissionCampaign
	err := DB.Where("status = ? AND ends_at > ?", CampaignStatusScheduled, now).Order("starts_at").Find(&campaigns).Error
	return campaigns, err
}

// BackfillCommissions 对指定充值单按历史时间重跑记账（幂等）；返回新记账条数。
func BackfillCommissions(topupIds []int, operatorId int) (int, error) {
	if len(topupIds) == 0 {
		return 0, ErrCommissionInvalid
	}
	var topUps []TopUp
	if err := DB.Where("status = ? AND id IN ?", "success", topupIds).Order("id").Limit(500).Find(&topUps).Error; err != nil {
		return 0, err
	}
	created := 0
	for i := range topUps {
		creditedQuota, err := topUpCreditedQuota(&topUps[i])
		if err != nil || creditedQuota <= 0 {
			continue
		}
		before := countCommissionForTopUp(topUps[i].Id)
		doAccrueCommission(&topUps[i], creditedQuota)
		if countCommissionForTopUp(topUps[i].Id) > before {
			created++
		}
	}
	return created, nil
}

// TopupAttributionPrograms 返回这批充值单按注册归属会落在哪些业务线上，
// 供管理端在补账前做按业务线的权限校验；无归属的充值单不产生任何 program。
func TopupAttributionPrograms(topupIds []int) ([]string, error) {
	var programs []string
	err := DB.Model(&TopUp{}).
		Select("DISTINCT invite_attributions.program").
		Joins("JOIN invite_attributions ON invite_attributions.invitee_user_id = top_ups.user_id").
		Where("top_ups.id IN ?", topupIds).
		Pluck("invite_attributions.program", &programs).Error
	return programs, err
}

func countCommissionForTopUp(topUpId int) int64 {
	var count int64
	DB.Model(&CommissionRecord{}).Where("source_type = ? AND source_id = ?", CommissionSourceTypeTopUp, topUpId).Count(&count)
	return count
}

// TransferReferralQuotaToQuota 推广返现余额转入账户余额；记录结算流水。
// 推广返现不可提现，只能转入账户余额（同 aff_transfer 语义，另写 commission_settlements）。
func TransferReferralQuotaToQuota(userId int, amountQuota int) error {
	if amountQuota <= 0 {
		return ErrCommissionInvalid
	}
	var creditedUserQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Where("id = ?", userId).Take(&user).Error; err != nil {
			return err
		}
		if user.AffQuota < amountQuota {
			return ErrCommissionInsufficient
		}
		if err := common.ValidateWalletQuota(user.Quota + amountQuota); err != nil {
			return ErrWalletQuotaLimitExceeded
		}
		if err := tx.Model(&User{}).Where("id = ?", userId).
			Updates(map[string]any{
				"aff_quota": gorm.Expr("aff_quota - ?", amountQuota),
				"quota":     gorm.Expr("quota + ?", amountQuota),
			}).Error; err != nil {
			return err
		}
		creditedUserQuota = user.Quota + amountQuota
		return tx.Create(&CommissionSettlement{
			Program:           CommissionProgramReferral,
			BeneficiaryUserId: userId,
			Trigger:           SettlementTriggerTransfer,
			BalanceType:       CommissionBalanceTypeAffQuota,
			CreditedQuota:     amountQuota,
			BalanceBefore:     user.AffQuota,
			BalanceAfter:      user.AffQuota - amountQuota,
			CreatedAt:         common.GetTimestamp(),
		}).Error
	})
	if err != nil {
		return err
	}
	syncCreditUserQuotaCache(userId, creditedUserQuota, "referral commission transfer")
	return nil
}
