package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrPaymentEventConflict = errors.New("payment event changed; refresh and retry")
var ErrPaymentEventInvalid = errors.New("invalid payment event")

// PaymentEvent stores only allowlisted, verified payment evidence. It never
// stores the webhook body, signature, API credentials, or card/customer details.
type PaymentEventInput struct {
	Provider      string `json:"provider" gorm:"type:varchar(32)"`
	EventID       string `json:"event_id" gorm:"type:varchar(200)"`
	EventType     string `json:"event_type" gorm:"type:varchar(100)"`
	TradeNo       string `json:"trade_no" gorm:"type:varchar(255);index:,length:191"`
	SessionID     string `json:"session_id" gorm:"type:varchar(200)"`
	PaymentIntent string `json:"payment_intent" gorm:"type:varchar(200);index:,length:191"`
	CustomerID    string `json:"customer_id" gorm:"type:varchar(200)"`
	PaidMinor     int64  `json:"paid_minor"`
	Currency      string `json:"currency" gorm:"type:varchar(3)"`
	PaymentStatus string `json:"payment_status" gorm:"type:varchar(40)"`
	SessionStatus string `json:"session_status" gorm:"type:varchar(40)"`
	RefundedMinor int64  `json:"refunded_minor" gorm:"type:bigint"`
	ChargeID      string `json:"charge_id" gorm:"type:varchar(200)"`
	DisputeID     string `json:"dispute_id" gorm:"type:varchar(200)"`
	DisputeStatus string `json:"dispute_status" gorm:"type:varchar(40)"`
	InvoiceID     string `json:"invoice_id" gorm:"type:varchar(200)"`
}

type PaymentEvent struct {
	ID                int `json:"id"`
	PaymentEventInput `gorm:"embedded"`
	EventKey          string `json:"-" gorm:"type:varchar(64);uniqueIndex"`
	Fingerprint       string `json:"-" gorm:"type:varchar(64)"`
	Status            string `json:"status" gorm:"type:varchar(24);index"`
	Attempts          int    `json:"attempts"`
	NextAttemptAt     int64  `json:"next_attempt_at" gorm:"type:bigint;index"`
	LeaseUntil        int64  `json:"-" gorm:"type:bigint"`
	LeaseToken        string `json:"-" gorm:"type:varchar(64)"`
	CreatedAt         int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt         int64  `json:"updated_at" gorm:"type:bigint"`
	LastErrorCode     string `json:"last_error_code" gorm:"type:varchar(64)"`
	Version           int    `json:"version"`
	PaymentReceiptID  int    `json:"payment_receipt_id" gorm:"index"`
	RelatedTradeNo    string `json:"related_trade_no" gorm:"type:varchar(255)"`
}

type PaymentEventAction struct {
	ID             int    `json:"id"`
	PaymentEventID int    `json:"payment_event_id" gorm:"index"`
	ActorID        int    `json:"actor_id"`
	Action         string `json:"action" gorm:"type:varchar(24)"`
	Reason         string `json:"reason" gorm:"type:text"`
	Attempt        int    `json:"attempt"`
	ErrorCode      string `json:"error_code" gorm:"type:varchar(64)"`
	EventVersion   int    `json:"event_version"`
	QuotaDelta     int    `json:"quota_delta" gorm:"type:bigint"`
	CreatedAt      int64  `json:"created_at" gorm:"type:bigint"`
}

func MigratePaymentEvents() error {
	return DB.AutoMigrate(&PaymentEvent{}, &PaymentEventAction{}, &PaymentReceipt{})
}

func RecordPaymentEvent(input PaymentEventInput) (*PaymentEvent, error) {
	input.Currency = strings.ToUpper(input.Currency)
	if input.PaidMinor > int64(common.MaxWalletQuota) {
		return nil, ErrPaymentEventInvalid
	}
	if len(input.InvoiceID) > 200 {
		return nil, ErrPaymentEventInvalid
	}
	if input.RefundedMinor < 0 || input.RefundedMinor > input.PaidMinor || len(input.ChargeID) > 200 || len(input.DisputeID) > 200 || len(input.DisputeStatus) > 40 {
		return nil, ErrPaymentEventInvalid
	}
	if input.Provider != PaymentProviderStripe || input.EventID == "" || len(input.EventID) > 200 || len(input.EventType) > 100 || len(input.TradeNo) > 255 || len(input.SessionID) > 200 || len(input.PaymentIntent) > 200 || len(input.CustomerID) > 200 || input.PaidMinor < 0 || len(input.Currency) > 3 || len(input.PaymentStatus) > 40 || len(input.SessionStatus) > 40 {
		return nil, ErrPaymentEventInvalid
	}
	switch input.EventType {
	case "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "checkout.session.async_payment_failed":
	case "charge.refunded", "charge.dispute.created", "charge.dispute.closed":
	case "invoice.paid":
	default:
		return nil, ErrPaymentEventInvalid
	}
	encoded, err := common.Marshal(input)
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	event := &PaymentEvent{PaymentEventInput: input, EventKey: fmt.Sprintf("%x", sha256.Sum256([]byte(input.Provider+"\x00"+input.EventID))), Fingerprint: fmt.Sprintf("%x", sha256.Sum256(encoded)), Status: "pending", NextAttemptAt: now, CreatedAt: now, UpdatedAt: now, Version: 1}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(event).Error; err != nil {
		return nil, err
	}
	var stored PaymentEvent
	if err := DB.Where("event_key = ?", event.EventKey).Take(&stored).Error; err != nil {
		return nil, err
	}
	if stored.Fingerprint != event.Fingerprint {
		return nil, ErrPaymentEventConflict
	}
	return &stored, nil
}

// Claims are atomic across nodes. An expired lease can replay fulfillment;
// the order transaction remains responsible for crediting exactly once.
func ClaimPaymentEvent(id int, now int64) (*PaymentEvent, bool, error) {
	if id <= 0 || now <= 0 {
		return nil, false, ErrPaymentEventInvalid
	}
	token := common.NewRequestId()
	var event PaymentEvent
	claimed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&PaymentEvent{}).Where("id = ? AND attempts < ? AND ((status IN ? AND next_attempt_at <= ?) OR (status = ? AND lease_until <= ?))", id, 8, []string{"pending", "retry"}, now, "processing", now).Updates(map[string]any{"status": "processing", "lease_token": token, "lease_until": now + 60, "attempts": gorm.Expr("attempts + 1"), "version": gorm.Expr("version + 1"), "updated_at": now})
		if result.Error != nil || result.RowsAffected != 1 {
			return result.Error
		}
		if err := tx.Where("id = ? AND lease_token = ?", id, token).Take(&event).Error; err != nil {
			return err
		}
		if err := tx.Create(&PaymentEventAction{PaymentEventID: id, Action: "processing", Attempt: event.Attempts, EventVersion: event.Version, CreatedAt: now}).Error; err != nil {
			return err
		}
		claimed = true
		return nil
	})
	if err != nil || !claimed {
		return nil, false, err
	}
	return &event, claimed, nil
}

func FinishPaymentEvent(event PaymentEvent, processErr error, needsReview bool, now int64) error {
	status, code, next := "succeeded", "", int64(0)
	if processErr != nil {
		code = "fulfillment_retry"
		switch {
		case errors.Is(processErr, ErrPaymentMethodMismatch):
			code, needsReview = "provider_mismatch", true
		case errors.Is(processErr, ErrTopUpStatusInvalid), errors.Is(processErr, ErrSubscriptionOrderStatusInvalid):
			code, needsReview = "order_state_conflict", true
		case errors.Is(processErr, ErrInvalidTopUpQuota), errors.Is(processErr, ErrTopUpQuotaLimitExceeded):
			code, needsReview = "quota_invalid", true
		case errors.Is(processErr, ErrPaymentEventInvalid):
			code, needsReview = "invalid_evidence", true
		case errors.Is(processErr, ErrPaymentFinancialReview):
			code, needsReview = "financial_review", true
		case errors.Is(processErr, ErrPaymentInsufficientBalance):
			code, needsReview = "insufficient_balance", true
		case errors.Is(processErr, ErrPaymentEntitlementReview):
			code, needsReview = "entitlement_review", true
		}
		status = "retry"
		next = now + int64(15*(1<<min(event.Attempts, 8)))
		if needsReview || event.Attempts >= 8 {
			status, next = "needs_review", 0
		}
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&PaymentEvent{}).Where("id = ? AND status = ? AND lease_token = ? AND version = ?", event.ID, "processing", event.LeaseToken, event.Version).Updates(map[string]any{"status": status, "last_error_code": code, "next_attempt_at": next, "lease_until": 0, "lease_token": "", "updated_at": now, "version": gorm.Expr("version + 1")})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPaymentEventConflict
		}
		return tx.Create(&PaymentEventAction{PaymentEventID: event.ID, Action: status, Attempt: event.Attempts, ErrorCode: code, EventVersion: event.Version + 1, CreatedAt: now}).Error
	})
}

// A read-only enablement check still schedules a run on database failure so
// the system-task ledger can surface the outage instead of silently stopping.
func HasDuePaymentEvents(now int64) bool {
	var event PaymentEvent
	result := DB.Select("id").Where("(status IN ? AND next_attempt_at <= ?) OR (status = ? AND lease_until <= ?)", []string{"pending", "retry"}, now, "processing", now).Limit(1).Find(&event)
	return result.Error != nil || result.RowsAffected > 0
}

func DuePaymentEvents(now int64, limit int) ([]PaymentEvent, error) {
	if now <= 0 || limit < 1 || limit > 100 {
		return nil, ErrPaymentEventInvalid
	}
	var expired []PaymentEvent
	if err := DB.Where("status = ? AND lease_until <= ? AND attempts >= ?", "processing", now, 8).Order("id").Limit(limit).Find(&expired).Error; err != nil {
		return nil, err
	}
	for _, event := range expired {
		err := DB.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&PaymentEvent{}).Where("id = ? AND version = ? AND status = ? AND lease_until <= ?", event.ID, event.Version, "processing", now).Updates(map[string]any{"status": "needs_review", "last_error_code": "retry_exhausted", "lease_token": "", "lease_until": 0, "version": gorm.Expr("version + 1"), "updated_at": now})
			if result.Error != nil || result.RowsAffected == 0 {
				return result.Error
			}
			return tx.Create(&PaymentEventAction{PaymentEventID: event.ID, Action: "needs_review", Attempt: event.Attempts, EventVersion: event.Version + 1, ErrorCode: "retry_exhausted", CreatedAt: now}).Error
		})
		if err != nil {
			return nil, err
		}
	}
	events := make([]PaymentEvent, 0)
	err := DB.Where("attempts < ? AND ((status IN ? AND next_attempt_at <= ?) OR (status = ? AND lease_until <= ?))", 8, []string{"pending", "retry"}, now, "processing", now).Order("id").Limit(limit).Find(&events).Error
	return events, err
}

func ListPaymentEvents(status, tradeNo string, start, limit int) ([]PaymentEvent, int64, error) {
	if start < 0 || start > 1000000 || limit < 1 || limit > 100 || len(tradeNo) > 255 {
		return nil, 0, ErrPaymentEventInvalid
	}
	if status != "" && status != "pending" && status != "processing" && status != "retry" && status != "needs_review" && status != "succeeded" && status != "resolved" {
		return nil, 0, ErrPaymentEventInvalid
	}
	query := DB.Model(&PaymentEvent{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if tradeNo != "" {
		query = query.Where("trade_no = ? OR related_trade_no = ?", tradeNo, tradeNo)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	events := make([]PaymentEvent, 0)
	err := query.Order("id DESC").Offset(start).Limit(limit).Find(&events).Error
	return events, total, err
}

func RetryPaymentEvent(id, expectedVersion, actorID int, reason string) error {
	reason = strings.TrimSpace(reason)
	if id <= 0 || expectedVersion <= 0 || actorID <= 0 || reason == "" || len([]rune(reason)) > 1000 {
		return ErrPaymentEventInvalid
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&PaymentEvent{}).Where("id = ? AND version = ? AND status IN ?", id, expectedVersion, []string{"retry", "needs_review", "pending"}).Updates(map[string]any{"status": "retry", "attempts": 0, "next_attempt_at": now, "updated_at": now, "version": gorm.Expr("version + 1")})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPaymentEventConflict
		}
		return tx.Create(&PaymentEventAction{PaymentEventID: id, ActorID: actorID, Action: "retry_requested", Reason: reason, EventVersion: expectedVersion + 1, CreatedAt: now}).Error
	})
}

func GetPaymentEvent(id int) (*PaymentEvent, error) {
	if id <= 0 {
		return nil, ErrPaymentEventInvalid
	}
	var event PaymentEvent
	if err := DB.First(&event, id).Error; err != nil {
		return nil, err
	}
	return &event, nil
}

func ListPaymentEventActions(id, start, limit int) ([]PaymentEventAction, int64, error) {
	if id <= 0 || start < 0 || start > 1000000 || limit < 1 || limit > 100 {
		return nil, 0, ErrPaymentEventInvalid
	}
	query := DB.Model(&PaymentEventAction{}).Where("payment_event_id = ?", id)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	actions := make([]PaymentEventAction, 0)
	err := query.Order("id DESC").Offset(start).Limit(limit).Find(&actions).Error
	return actions, total, err
}
