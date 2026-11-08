package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	InvoiceStatusPending         = "pending"
	InvoiceStatusAwaitingPayment = "awaiting_payment"
	InvoiceStatusProcessing      = "processing"
	InvoiceStatusIssued          = "issued"
	InvoiceStatusRejected        = "rejected"

	InvoiceSettlementBalance = "balance"
	InvoiceSettlementDirect  = "direct"
)

var (
	ErrInvoiceDisabled      = errors.New("invoicing is not enabled")
	ErrInvoiceAmountRange   = errors.New("invoice amount out of range")
	ErrInvoiceBalance       = errors.New("insufficient balance for the invoice fee")
	ErrInvoiceFields        = errors.New("invoice fields are incomplete")
	ErrInvoiceNotFound      = errors.New("invoice request not found")
	ErrInvoiceStatus        = errors.New("invoice request is not in a reviewable status")
	ErrInvoiceVersion       = errors.New("invoice request changed, refresh and retry")
	ErrInvoiceInvalidAction = errors.New("invalid review action")
	ErrInvoiceFileUrl       = errors.New("invoice file url must be http or https")
	ErrInvoiceQuotaExceeded = errors.New("invoice amount exceeds the invoiceable balance")
)

type InvoiceRequest struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	UserId      int    `json:"user_id" gorm:"index:idx_invoice_user_time,priority:1"`
	BuyerName   string `json:"buyer_name" gorm:"type:varchar(128)"`
	TaxNo       string `json:"tax_no" gorm:"type:varchar(64)"`
	AmountCny   string `json:"amount_cny" gorm:"type:varchar(32)"`
	FeeRateBps  int    `json:"fee_rate_bps"`
	FeeCny      string `json:"fee_cny" gorm:"type:varchar(32)"`
	FeeQuota    int    `json:"fee_quota"`
	InvoiceType string `json:"invoice_type" gorm:"type:varchar(16)"`
	Category    string `json:"category" gorm:"type:varchar(64)"`
	Item        string `json:"item" gorm:"type:varchar(64)"`
	Email       string `json:"email" gorm:"type:varchar(128)"`
	Details     string `json:"details" gorm:"type:text"`
	Settlement  string `json:"settlement" gorm:"type:varchar(16)"`
	TradeNo     string `json:"trade_no" gorm:"type:varchar(255);index"`
	FeePaidAt   int64  `json:"fee_paid_at" gorm:"type:bigint"`
	Status      string `json:"status" gorm:"type:varchar(16);index"`
	ReviewNote  string `json:"review_note" gorm:"type:varchar(512)"`
	ReviewerId  int    `json:"reviewer_id"`
	ReviewedAt  int64  `json:"reviewed_at" gorm:"type:bigint"`
	FileUrl     string `json:"file_url" gorm:"type:varchar(512)"`
	Version     int    `json:"version" gorm:"default:1"`
	CreatedAt   int64  `json:"created_at" gorm:"type:bigint;index:idx_invoice_user_time,priority:2"`
	UpdatedAt   int64  `json:"updated_at" gorm:"type:bigint"`
}

func (i *InvoiceRequest) BeforeCreate(*gorm.DB) error {
	now := common.GetTimestamp()
	if i.CreatedAt == 0 {
		i.CreatedAt = now
	}
	if i.UpdatedAt == 0 {
		i.UpdatedAt = now
	}
	if i.Version == 0 {
		i.Version = 1
	}
	return nil
}

type CreateInvoiceInput struct {
	BuyerName   string `json:"buyer_name"`
	TaxNo       string `json:"tax_no"`
	AmountCny   string `json:"amount_cny"`
	InvoiceType string `json:"invoice_type"`
	Category    string `json:"category"`
	Item        string `json:"item"`
	Email       string `json:"email"`
	Details     string `json:"details"`
	Settlement  string `json:"settlement"`
}

// prepareInvoice 校验输入并计算手续费，返回未持久化的申请记录。
func prepareInvoice(userId int, input CreateInvoiceInput) (*InvoiceRequest, error) {
	if !operation_setting.InvoiceEnabled {
		return nil, ErrInvoiceDisabled
	}
	buyerName := strings.TrimSpace(input.BuyerName)
	email := strings.TrimSpace(input.Email)
	item := strings.TrimSpace(input.Item)
	category := strings.TrimSpace(input.Category)
	if buyerName == "" || len(buyerName) > 128 || email == "" || len(email) > 128 ||
		!strings.Contains(email, "@") || item == "" || len(item) > 64 || len(category) > 64 ||
		len(input.TaxNo) > 64 || len(input.Details) > 2000 {
		return nil, ErrInvoiceFields
	}
	if !operation_setting.InvoiceChoiceAllowed(operation_setting.InvoiceItems(), item) ||
		(category != "" && !operation_setting.InvoiceChoiceAllowed(operation_setting.InvoiceCategories(), category)) {
		return nil, ErrInvoiceFields
	}
	rateBps, ok := operation_setting.InvoiceFeeRateBps(input.InvoiceType)
	if !ok {
		return nil, ErrInvoiceFields
	}
	amount, err := operation_setting.ParseInvoiceAmountCny(input.AmountCny)
	if err != nil {
		return nil, ErrInvoiceAmountRange
	}
	min, max := operation_setting.InvoiceBounds()
	if amount.LessThan(min) || amount.GreaterThan(max) {
		return nil, ErrInvoiceAmountRange
	}
	feeCny, feeQuota, err := operation_setting.InvoiceFee(amount, rateBps)
	if err != nil {
		return nil, err
	}
	return &InvoiceRequest{
		UserId: userId, BuyerName: buyerName, TaxNo: strings.TrimSpace(input.TaxNo),
		AmountCny: amount.StringFixed(2), FeeRateBps: rateBps, FeeCny: feeCny.StringFixed(2),
		FeeQuota: feeQuota, InvoiceType: input.InvoiceType, Category: category, Item: item,
		Email: email, Details: strings.TrimSpace(input.Details),
	}, nil
}

// invoiceableReceivedCNYTx B3.5：可开票到账合计 = A + B + C。
//
//	A：写过快照的 CNY 充值按 credited_money（不含手续费）；
//	B：升级前的老充值订单（currency=''）为 epay 人民币单，按 money；
//	C：CNY 在线订阅按 credited_money（余额购买不计入），
//	   老订阅订单（currency=''）为 epay 人民币单，按 money。
//
// 求和结果用 decimal.NullDecimal 扫描，不经过 float64。
func invoiceableReceivedCNYTx(tx *gorm.DB, userId int) (decimal.Decimal, error) {
	var topupNew decimal.NullDecimal
	if err := tx.Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND currency = ? AND payment_method <> ?",
			userId, common.TopUpStatusSuccess, "CNY", "invoice_fee").
		Select("COALESCE(SUM(credited_money),0)").Scan(&topupNew).Error; err != nil {
		return decimal.Zero, err
	}
	var topupLegacy decimal.NullDecimal
	if err := tx.Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND currency = ? AND payment_provider = ? AND payment_method <> ?",
			userId, common.TopUpStatusSuccess, "", PaymentProviderEpay, "invoice_fee").
		Select("COALESCE(SUM(money),0)").Scan(&topupLegacy).Error; err != nil {
		return decimal.Zero, err
	}
	var subNew decimal.NullDecimal
	if err := tx.Model(&SubscriptionOrder{}).
		Where("user_id = ? AND status = ? AND currency = ? AND payment_provider <> ?",
			userId, common.TopUpStatusSuccess, "CNY", PaymentProviderBalance).
		Select("COALESCE(SUM(credited_money),0)").Scan(&subNew).Error; err != nil {
		return decimal.Zero, err
	}
	var subLegacy decimal.NullDecimal
	if err := tx.Model(&SubscriptionOrder{}).
		Where("user_id = ? AND status = ? AND currency = ? AND payment_provider = ?",
			userId, common.TopUpStatusSuccess, "", PaymentProviderEpay).
		Select("COALESCE(SUM(money),0)").Scan(&subLegacy).Error; err != nil {
		return decimal.Zero, err
	}
	return topupNew.Decimal.
		Add(topupLegacy.Decimal).
		Add(subNew.Decimal).
		Add(subLegacy.Decimal), nil
}

// invoiceConsumedCNYTx 占用中的发票金额（pending/awaiting_payment/processing/issued；
// rejected 释放额度）。
func invoiceConsumedCNYTx(tx *gorm.DB, userId int) (decimal.Decimal, error) {
	var consumedAmounts []string
	if err := tx.Model(&InvoiceRequest{}).
		Where("user_id = ? AND status IN ?",
			userId, []string{InvoiceStatusPending, InvoiceStatusAwaitingPayment, InvoiceStatusProcessing, InvoiceStatusIssued}).
		Pluck("amount_cny", &consumedAmounts).Error; err != nil {
		return decimal.Zero, err
	}
	consumed := decimal.Zero
	for _, raw := range consumedAmounts {
		d, err := decimal.NewFromString(raw)
		if err != nil {
			return decimal.Zero, err
		}
		consumed = consumed.Add(d)
	}
	return consumed, nil
}

// invoiceableCNYTx 可开票金额 = 到账合计 − 已占用。
func invoiceableCNYTx(tx *gorm.DB, userId int) (decimal.Decimal, error) {
	received, err := invoiceableReceivedCNYTx(tx, userId)
	if err != nil {
		return decimal.Zero, err
	}
	consumed, err := invoiceConsumedCNYTx(tx, userId)
	if err != nil {
		return decimal.Zero, err
	}
	return received.Sub(consumed), nil
}

// checkInvoiceableQuotaTx 用户行锁内校验申请金额不超可开票额度，
// 使同一用户的并发申请串行化，不会超开。
func checkInvoiceableQuotaTx(tx *gorm.DB, userId int, amountCny string) error {
	var user User
	if err := lockForUpdate(tx).Where("id = ?", userId).Take(&user).Error; err != nil {
		return err
	}
	available, err := invoiceableCNYTx(tx, userId)
	if err != nil {
		return err
	}
	amount, err := decimal.NewFromString(amountCny)
	if err != nil {
		return ErrInvoiceAmountRange
	}
	if amount.GreaterThan(available) {
		return ErrInvoiceQuotaExceeded
	}
	return nil
}

// InvoiceSummary 可开票摘要（F3.5 页头）：人民币到账 / 已开票+处理中 / 可开票。
// 与 invoiceableCNYTx 共用同一套汇总，不维护第二份查询。
func InvoiceSummary(userId int) (received decimal.Decimal, consumed decimal.Decimal, available decimal.Decimal, err error) {
	received, err = invoiceableReceivedCNYTx(DB, userId)
	if err != nil {
		return
	}
	consumed, err = invoiceConsumedCNYTx(DB, userId)
	if err != nil {
		return
	}
	available = received.Sub(consumed)
	return
}

// CreateInvoiceRequest 校验字段、计算手续费并在同一事务里扣额度、写申请。
// 扣额度失败（余额不足）时整个申请不成立。
func CreateInvoiceRequest(userId int, input CreateInvoiceInput) (*InvoiceRequest, error) {
	invoice, err := prepareInvoice(userId, input)
	if err != nil {
		return nil, err
	}
	invoice.Settlement = InvoiceSettlementBalance
	invoice.FeePaidAt = common.GetTimestamp()
	invoice.Status = InvoiceStatusPending
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := checkInvoiceableQuotaTx(tx, userId, invoice.AmountCny); err != nil {
			return err
		}
		res := tx.Model(&User{}).
			Where("id = ? AND quota >= ?", userId, invoice.FeeQuota).
			Update("quota", gorm.Expr("quota - ?", invoice.FeeQuota))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrInvoiceBalance
		}
		return tx.Create(invoice).Error
	})
	if err != nil {
		return nil, err
	}
	RecordLog(userId, LogTypeConsume, fmt.Sprintf("发票申请 #%d 手续费 %s", invoice.Id, logger.LogQuota(invoice.FeeQuota)))
	return invoice, nil
}

// PrepareDirectInvoice 校验输入并生成 awaiting_payment 申请；控制器随后为它
// 创建收银台订单，再以 PersistDirectInvoiceOrder 同事务落库。
func PrepareDirectInvoice(userId int, input CreateInvoiceInput, tradeNo string) (*InvoiceRequest, error) {
	invoice, err := prepareInvoice(userId, input)
	if err != nil {
		return nil, err
	}
	invoice.Settlement = InvoiceSettlementDirect
	invoice.TradeNo = tradeNo
	invoice.Status = InvoiceStatusAwaitingPayment
	return invoice, nil
}

// PersistDirectInvoiceOrder 在同一事务里写收银台订单与发票申请，
// 避免只创建订单没留下发票（或相反）的孤儿状态。
func PersistDirectInvoiceOrder(invoice *InvoiceRequest, topUp *TopUp) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := checkInvoiceableQuotaTx(tx, invoice.UserId, invoice.AmountCny); err != nil {
			return err
		}
		if err := tx.Create(topUp).Error; err != nil {
			return err
		}
		return tx.Create(invoice).Error
	})
}

// SettleInvoiceEpay 收银台回调核销：订单行锁 + 状态校验 + 订单完成 + 申请转
// 待开票在同一事务内完成，重复/并发回调最多核销一次。
// paidMoney 为回调实付金额（VerifyRes.Money），与其他通道一致在入账前核对。
func SettleInvoiceEpay(tradeNo string, actualPaymentMethod string, paidMoney string) (alreadyDone bool, err error) {
	if tradeNo == "" {
		return false, errors.New("未提供支付单号")
	}
	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderEpay {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess {
			alreadyDone = true
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}
		if err := verifyPaidMoney(PaymentProviderEpay, tradeNo, topUp.Currency, "",
			expectedPaidMoney(topUp.CreditedMoney, topUp.FeeMoney, topUp.Money, topUp.Currency), paidMoney); err != nil {
			return err
		}
		if actualPaymentMethod != "" && topUp.PaymentMethod != actualPaymentMethod {
			topUp.PaymentMethod = actualPaymentMethod
		}
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}
		var invoice InvoiceRequest
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(&invoice).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvoiceNotFound
			}
			return err
		}
		if invoice.Status != InvoiceStatusAwaitingPayment {
			return nil
		}
		now := common.GetTimestamp()
		return tx.Model(&InvoiceRequest{}).Where("id = ?", invoice.Id).Updates(map[string]any{
			"status":      InvoiceStatusPending,
			"fee_paid_at": now,
			"updated_at":  now,
			"version":     invoice.Version + 1,
		}).Error
	})
	return alreadyDone, noteAmountMismatch(err)
}

func ListInvoices(userId int, status string, start int, size int) ([]InvoiceRequest, int64, error) {
	var rows []InvoiceRequest
	var total int64
	q := DB.Model(&InvoiceRequest{})
	if userId > 0 {
		q = q.Where("user_id = ?", userId)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := q.Order("id DESC").Offset(start).Limit(size).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

var invoiceTransitions = map[string][]string{
	InvoiceStatusPending:    {InvoiceStatusProcessing, InvoiceStatusIssued, InvoiceStatusRejected},
	InvoiceStatusProcessing: {InvoiceStatusIssued, InvoiceStatusRejected},
}

// ReviewInvoiceRequest 管理员推进发票申请状态；驳回时在同一事务内退回手续费。
// file_url 只允许 http/https（B1.14），其他协议拒绝写入（XSS 防护）。
func ReviewInvoiceRequest(id int, adminId int, action string, note string, fileUrl string, expectedVersion int) (*InvoiceRequest, error) {
	trimmedUrl := strings.TrimSpace(fileUrl)
	if action == InvoiceStatusIssued && trimmedUrl != "" &&
		!strings.HasPrefix(trimmedUrl, "http://") && !strings.HasPrefix(trimmedUrl, "https://") {
		return nil, ErrInvoiceFileUrl
	}
	var invoice InvoiceRequest
	refunded := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("id = ?", id).Take(&invoice).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvoiceNotFound
			}
			return err
		}
		if invoice.Version != expectedVersion {
			return ErrInvoiceVersion
		}
		allowed := false
		for _, s := range invoiceTransitions[invoice.Status] {
			if s == action {
				allowed = true
				break
			}
		}
		if !allowed {
			return ErrInvoiceStatus
		}
		if action == InvoiceStatusRejected {
			feePaid := invoice.Settlement != InvoiceSettlementDirect || invoice.FeePaidAt != 0
			if feePaid {
				if err := tx.Model(&User{}).
					Where("id = ?", invoice.UserId).
					Update("quota", gorm.Expr("quota + ?", invoice.FeeQuota)).Error; err != nil {
					return err
				}
				refunded = true
			}
		}
		now := common.GetTimestamp()
		updates := map[string]any{
			"status":      action,
			"review_note": strings.TrimSpace(note),
			"reviewer_id": adminId,
			"reviewed_at": now,
			"updated_at":  now,
			"version":     invoice.Version + 1,
		}
		if action == InvoiceStatusIssued && trimmedUrl != "" {
			updates["file_url"] = trimmedUrl
		}
		return tx.Model(&InvoiceRequest{}).Where("id = ?", id).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	if refunded {
		RecordLog(invoice.UserId, LogTypeRefund, fmt.Sprintf("发票申请 #%d 被驳回，手续费 %s 已退回", invoice.Id, logger.LogQuota(invoice.FeeQuota)))
	}
	invoice.Status = action
	invoice.Version++
	return &invoice, nil
}

// NotifyInvoiceIssued 开票完成后给接收邮箱发一封通知；失败只记日志，不回滚状态。
func NotifyInvoiceIssued(invoice *InvoiceRequest, username string) {
	subject := fmt.Sprintf("Your invoice #%d has been issued", invoice.Id)
	content := fmt.Sprintf(
		"Hello %s,<br/><br/>Your invoice request #%d (%s, CNY %s) has been issued.<br/>File: %s<br/><br/>— %s",
		username, invoice.Id, invoice.Item, invoice.AmountCny, invoice.FileUrl, common.SystemName,
	)
	if err := common.SendEmail(subject, invoice.Email, content); err != nil {
		common.SysError(fmt.Sprintf("failed to send invoice email to %s: %s", invoice.Email, err.Error()))
	}
}

func GetInvoiceById(id int) (*InvoiceRequest, error) {
	var invoice InvoiceRequest
	if err := DB.Where("id = ?", id).Take(&invoice).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}
	return &invoice, nil
}
