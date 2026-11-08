package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrPaymentFinancialReview     = errors.New("payment requires financial review")
	ErrPaymentInsufficientBalance = errors.New("refunded payment credit exceeds remaining wallet balance")
	ErrPaymentEntitlementReview   = errors.New("subscription entitlement requires financial review")
)

// A receipt freezes what was actually granted in the fulfillment transaction.
// Monetary amounts remain gateway minor units; quota is never inferred from
// an administrator-supplied refund amount or from today's price configuration.
type PaymentReceipt struct {
	ID                 int    `json:"id"`
	TransactionKey     string `json:"-" gorm:"type:varchar(64);uniqueIndex"`
	Provider           string `json:"provider" gorm:"type:varchar(32)"`
	PaymentIntent      string `json:"payment_intent" gorm:"type:varchar(200)"`
	SessionID          string `json:"session_id" gorm:"type:varchar(200)"`
	InvoiceID          string `json:"invoice_id" gorm:"type:varchar(200);index:,length:191"`
	TradeNo            string `json:"trade_no" gorm:"type:varchar(255);index:,length:191"`
	UserID             int    `json:"user_id" gorm:"index"`
	TopUpID            int    `json:"top_up_id"`
	UserSubscriptionID int    `json:"user_subscription_id"`
	PaidMinor          int64  `json:"paid_minor" gorm:"type:bigint"`
	Currency           string `json:"currency" gorm:"type:varchar(3)"`
	CreditedQuota      int    `json:"credited_quota" gorm:"type:bigint"`
	RefundedMinor      int64  `json:"refunded_minor" gorm:"type:bigint"`
	DisputeLossMinor   int64  `json:"dispute_loss_minor" gorm:"type:bigint"`
	WaivedQuota        int    `json:"waived_quota" gorm:"type:bigint"`
	ReversedQuota      int    `json:"reversed_quota" gorm:"type:bigint"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt          int64  `json:"updated_at" gorm:"type:bigint"`
	Version            int    `json:"version"`
}

func recordPaymentReceiptTx(tx *gorm.DB, event *PaymentEvent, userID, topUpID, subscriptionID, creditedQuota int) error {
	if event == nil {
		return nil
	}
	if event.Provider != PaymentProviderStripe || event.PaidMinor < 0 || len(event.Currency) != 3 || event.TradeNo == "" || event.SessionID == "" || userID <= 0 || creditedQuota < 0 || creditedQuota > common.MaxWalletQuota {
		return ErrPaymentEventInvalid
	}
	reference := event.PaymentIntent
	if reference == "" {
		reference = "session:" + event.SessionID
	}
	key := fmt.Sprintf("%x", sha256.Sum256([]byte(event.Provider+"\x00"+reference)))
	now := common.GetTimestamp()
	receipt := PaymentReceipt{TransactionKey: key, Provider: event.Provider, PaymentIntent: event.PaymentIntent, SessionID: event.SessionID, InvoiceID: event.InvoiceID, TradeNo: event.TradeNo, UserID: userID, TopUpID: topUpID, UserSubscriptionID: subscriptionID, PaidMinor: event.PaidMinor, Currency: event.Currency, CreditedQuota: creditedQuota, CreatedAt: now, UpdatedAt: now, Version: 1}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&receipt).Error; err != nil {
		return err
	}
	var stored PaymentReceipt
	if err := tx.Where("transaction_key = ?", key).Take(&stored).Error; err != nil {
		return err
	}
	if stored.TradeNo != receipt.TradeNo || stored.UserID != userID || stored.PaidMinor != receipt.PaidMinor || stored.Currency != receipt.Currency || stored.CreditedQuota != creditedQuota || stored.UserSubscriptionID != subscriptionID {
		return ErrPaymentFinancialReview
	}
	if event.ID > 0 {
		return tx.Model(&PaymentEvent{}).Where("id = ?", event.ID).Update("payment_receipt_id", stored.ID).Error
	}
	return nil
}

// Replay can verify an existing linkage, but cannot invent historic grants
// for an order that was completed before the receipt ledger existed.
func verifyPaymentReceiptTx(tx *gorm.DB, event *PaymentEvent) error {
	if event == nil {
		return nil
	}
	var receipt PaymentReceipt
	if err := tx.Where("provider = ? AND trade_no = ?", event.Provider, event.TradeNo).Take(&receipt).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPaymentFinancialReview
		}
		return err
	}
	if receipt.SessionID != event.SessionID || (event.PaymentIntent != "" && receipt.PaymentIntent != event.PaymentIntent) || receipt.PaidMinor != event.PaidMinor || receipt.Currency != event.Currency {
		return ErrPaymentFinancialReview
	}
	return tx.Model(&PaymentEvent{}).Where("id = ?", event.ID).Update("payment_receipt_id", receipt.ID).Error
}

func GetPaymentReceipt(id int) (*PaymentReceipt, error) {
	if id <= 0 {
		return nil, nil
	}
	var receipt PaymentReceipt
	if err := DB.First(&receipt, id).Error; err != nil {
		return nil, err
	}
	return &receipt, nil
}

// Subscription Checkout sessions often carry an invoice rather than a payment
// intent. Only the exact invoice stored at initial fulfillment may complete
// that linkage; later recurring invoices need a separate renewal policy.
func AttachVerifiedInvoicePayment(event PaymentEvent) error {
	if event.Provider != PaymentProviderStripe || event.EventType != "invoice.paid" || event.InvoiceID == "" || event.PaymentIntent == "" {
		return ErrPaymentFinancialReview
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var receipt PaymentReceipt
		if err := lockForUpdate(tx).Where("provider = ? AND invoice_id = ?", event.Provider, event.InvoiceID).Take(&receipt).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTopUpNotFound
			}
			return err
		}
		if receipt.Currency != event.Currency || receipt.PaidMinor != event.PaidMinor || (receipt.PaymentIntent != "" && receipt.PaymentIntent != event.PaymentIntent) {
			return ErrPaymentFinancialReview
		}
		key := fmt.Sprintf("%x", sha256.Sum256([]byte(event.Provider+"\x00"+event.PaymentIntent)))
		if err := tx.Model(&receipt).Updates(map[string]any{"payment_intent": event.PaymentIntent, "transaction_key": key, "version": gorm.Expr("version + 1"), "updated_at": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Model(&PaymentEvent{}).Where("id = ?", event.ID).Updates(map[string]any{"payment_receipt_id": receipt.ID, "related_trade_no": receipt.TradeNo}).Error
	})
}

func ResolvePaymentFinancialEvent(id, expectedVersion, actorID int, reason, action string) error {
	reason = strings.TrimSpace(reason)
	if id <= 0 || expectedVersion <= 0 || actorID <= 0 || reason == "" || len([]rune(reason)) > 1000 {
		return ErrPaymentEventInvalid
	}
	if action != "recover_credit" && action != "waive_recovery" && action != "cancel_entitlement" && action != "keep_entitlement" {
		return ErrPaymentEventInvalid
	}
	groupUserID := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var event PaymentEvent
		if err := lockForUpdate(tx).Where("id = ?", id).Take(&event).Error; err != nil {
			return err
		}
		if event.Version != expectedVersion || event.Status != "needs_review" {
			return ErrPaymentEventConflict
		}
		if event.PaymentReceiptID <= 0 {
			return ErrPaymentFinancialReview
		}
		var receipt PaymentReceipt
		if err := lockForUpdate(tx).Where("id = ?", event.PaymentReceiptID).Take(&receipt).Error; err != nil {
			return err
		}
		if event.Provider != receipt.Provider || event.PaymentIntent != receipt.PaymentIntent || event.Currency != receipt.Currency || receipt.PaidMinor <= 0 {
			return ErrPaymentFinancialReview
		}
		refunded, disputed := receipt.RefundedMinor, receipt.DisputeLossMinor
		switch event.EventType {
		case "charge.refunded":
			if event.PaidMinor != receipt.PaidMinor || event.RefundedMinor < 0 || event.RefundedMinor > receipt.PaidMinor {
				return ErrPaymentFinancialReview
			}
			refunded = max(refunded, event.RefundedMinor)
		case "charge.dispute.closed":
			if event.DisputeStatus != "lost" || event.PaidMinor <= 0 || event.PaidMinor > receipt.PaidMinor-refunded {
				return ErrPaymentFinancialReview
			}
			disputed = max(disputed, event.PaidMinor)
		default:
			return ErrPaymentFinancialReview
		}
		if disputed > receipt.PaidMinor-refunded {
			return ErrPaymentFinancialReview
		}
		now := common.GetTimestamp()
		updates := map[string]any{"refunded_minor": refunded, "dispute_loss_minor": disputed, "updated_at": now, "version": gorm.Expr("version + 1")}
		delta := 0
		if receipt.UserSubscriptionID > 0 {
			if action != "cancel_entitlement" && action != "keep_entitlement" {
				return ErrPaymentEventInvalid
			}
			if action == "cancel_entitlement" {
				var sub UserSubscription
				if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", receipt.UserSubscriptionID, receipt.UserID).Take(&sub).Error; err != nil {
					return err
				}
				if err := tx.Model(&sub).Updates(map[string]any{"status": "cancelled", "end_time": now, "updated_at": now}).Error; err != nil {
					return err
				}
				if _, err := downgradeUserGroupForSubscriptionTx(tx, &sub, now); err != nil {
					return err
				}
				groupUserID = receipt.UserID
			}
		} else {
			if action != "recover_credit" && action != "waive_recovery" {
				return ErrPaymentEventInvalid
			}
			target, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(int64(receipt.CreditedQuota)).Mul(decimal.NewFromInt(refunded + disputed)).Div(decimal.NewFromInt(receipt.PaidMinor)))
			if err != nil || target < receipt.ReversedQuota+receipt.WaivedQuota || target > receipt.CreditedQuota {
				return ErrInvalidTopUpQuota
			}
			delta = target - receipt.ReversedQuota - receipt.WaivedQuota
			if action == "recover_credit" {
				if common.RedisEnabled || common.BatchUpdateEnabled {
					return ErrPaymentFinancialReview
				}
				if delta > 0 {
					result := tx.Model(&User{}).Where("id = ? AND quota >= ?", receipt.UserID, delta).Update("quota", gorm.Expr("quota - ?", delta))
					if result.Error != nil {
						return result.Error
					}
					if result.RowsAffected != 1 {
						return ErrPaymentInsufficientBalance
					}
				}
				updates["reversed_quota"] = receipt.ReversedQuota + delta
			} else {
				updates["waived_quota"] = receipt.WaivedQuota + delta
				delta = 0
			}
		}
		if err := tx.Model(&receipt).Updates(updates).Error; err != nil {
			return err
		}
		if reversed, ok := updates["reversed_quota"].(int); ok && reversed > 0 && receipt.UserSubscriptionID == 0 && receipt.TopUpID > 0 {
			if err := reverseCommissionsForTopUpTx(tx, receipt.TopUpID, reversed, receipt.CreditedQuota); err != nil {
				return err
			}
		}
		result := tx.Model(&event).Where("version = ? AND status = ?", expectedVersion, "needs_review").Updates(map[string]any{"status": "resolved", "updated_at": now, "version": gorm.Expr("version + 1")})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPaymentEventConflict
		}
		return tx.Create(&PaymentEventAction{PaymentEventID: id, ActorID: actorID, Reason: reason, Action: action, QuotaDelta: -delta, EventVersion: expectedVersion + 1, CreatedAt: now}).Error
	})
	if err != nil {
		return err
	}
	if groupUserID > 0 {
		refreshSubscriptionUserGroupCache(groupUserID, "verified payment financial review")
	}
	return nil
}

// Refund notifications contain cumulative minor units. Round the cumulative
// target once, then subtract the previously reversed quota, so split refunds
// and out-of-order notifications cannot accumulate rounding or replay credits.
func ApplyVerifiedPaymentAdjustment(event PaymentEvent) error {
	if event.Provider != PaymentProviderStripe || event.PaymentIntent == "" {
		return ErrPaymentFinancialReview
	}
	key := fmt.Sprintf("%x", sha256.Sum256([]byte(event.Provider+"\x00"+event.PaymentIntent)))
	var linked PaymentReceipt
	if err := DB.Where("transaction_key = ?", key).Take(&linked).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPaymentFinancialReview
		}
		return err
	}
	if err := DB.Model(&PaymentEvent{}).Where("id = ?", event.ID).Updates(map[string]any{"payment_receipt_id": linked.ID, "related_trade_no": linked.TradeNo}).Error; err != nil {
		return err
	}
	if event.EventType == "charge.dispute.closed" && event.DisputeStatus == "won" {
		return nil
	}
	if event.EventType != "charge.refunded" {
		return ErrPaymentFinancialReview
	}
	if linked.UserSubscriptionID == 0 && (common.BatchUpdateEnabled || common.RedisEnabled) {
		return ErrPaymentFinancialReview
	}
	userID := 0
	debited := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var receipt PaymentReceipt
		if err := lockForUpdate(tx).Where("transaction_key = ?", key).Take(&receipt).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPaymentFinancialReview
			}
			return err
		}
		if event.Currency != receipt.Currency || receipt.PaidMinor <= 0 {
			return ErrPaymentFinancialReview
		}
		if err := tx.Model(&PaymentEvent{}).Where("id = ?", event.ID).Update("payment_receipt_id", receipt.ID).Error; err != nil {
			return err
		}
		if event.EventType != "charge.refunded" {
			return ErrPaymentFinancialReview
		}
		if event.PaidMinor != receipt.PaidMinor || event.RefundedMinor < 0 || event.RefundedMinor > receipt.PaidMinor {
			return ErrPaymentFinancialReview
		}
		userID = receipt.UserID
		if event.RefundedMinor <= receipt.RefundedMinor {
			return nil
		}
		// A prior waiver is a deliberate collection decision. A dispute may
		// overlap the refunded charge; neither can be overwritten by a later
		// notification without reviewing the provider's net settlement.
		if receipt.WaivedQuota > 0 || receipt.DisputeLossMinor > 0 {
			return ErrPaymentFinancialReview
		}
		if receipt.UserSubscriptionID > 0 {
			if event.RefundedMinor != receipt.PaidMinor {
				return ErrPaymentEntitlementReview
			}
			return ErrPaymentEntitlementReview
		}
		target, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(int64(receipt.CreditedQuota)).Mul(decimal.NewFromInt(event.RefundedMinor)).Div(decimal.NewFromInt(receipt.PaidMinor)))
		if err != nil || target < receipt.ReversedQuota || target > receipt.CreditedQuota {
			return ErrInvalidTopUpQuota
		}
		delta := target - receipt.ReversedQuota
		var user User
		if err := lockForUpdate(tx).Select("id", "quota").Where("id = ?", receipt.UserID).Take(&user).Error; err != nil {
			return err
		}
		if user.Quota < delta {
			return ErrPaymentInsufficientBalance
		}
		if delta > 0 {
			result := tx.Model(&User{}).Where("id = ? AND quota >= ?", receipt.UserID, delta).Update("quota", gorm.Expr("quota - ?", delta))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrPaymentInsufficientBalance
			}
		}
		now := common.GetTimestamp()
		if err := tx.Model(&receipt).Updates(map[string]any{"refunded_minor": event.RefundedMinor, "reversed_quota": target, "version": gorm.Expr("version + 1"), "updated_at": now}).Error; err != nil {
			return err
		}
		if target > 0 && receipt.TopUpID > 0 {
			if err := reverseCommissionsForTopUpTx(tx, receipt.TopUpID, target, receipt.CreditedQuota); err != nil {
				return err
			}
		}
		if err := tx.Create(&PaymentEventAction{PaymentEventID: event.ID, Action: "refund_applied", QuotaDelta: -delta, Attempt: event.Attempts, CreatedAt: now, EventVersion: event.Version}).Error; err != nil {
			return err
		}
		debited = delta > 0
		return nil
	})
	if err != nil {
		return err
	}
	if debited || userID > 0 {
		if err := invalidateUserCache(userID); err != nil {
			common.SysError("payment refund quota cache invalidation failed")
			return err
		}
	}
	return nil
}
