package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrRiskNotFound = errors.New("risk event not found")
	ErrRiskConflict = errors.New("risk record changed; refresh and retry")
	ErrRiskInvalid  = errors.New("invalid risk request")
)

// RiskEvent belongs to the primary database and is independent of usage-log cleanup.
// RuleID and RuleVersion contain digests only; no prompt, matched keyword or token key is retained.
type RiskEvent struct {
	ID               int    `json:"id"`
	EventID          string `json:"event_id" gorm:"type:varchar(64);uniqueIndex"`
	UserID           int    `json:"user_id" gorm:"index"`
	TokenID          int    `json:"token_id"`
	Model            string `json:"model" gorm:"type:varchar(200);index"`
	RequestID        string `json:"request_id" gorm:"type:varchar(64);index"`
	Category         string `json:"category" gorm:"type:varchar(32)"`
	Action           string `json:"action" gorm:"type:varchar(24)"`
	RuleID           string `json:"rule_id" gorm:"type:varchar(64)"`
	RuleVersion      string `json:"rule_version" gorm:"type:varchar(64)"`
	CreatedAt        int64  `json:"created_at" gorm:"type:bigint;index"`
	ReviewStatus     string `json:"review_status" gorm:"type:varchar(24);index"`
	ReviewerID       int    `json:"reviewer_id"`
	ReviewedAt       int64  `json:"reviewed_at" gorm:"type:bigint"`
	ReviewReason     string `json:"review_reason" gorm:"type:text"`
	Version          int    `json:"version"`
	RestrictionUntil int64  `json:"restriction_until" gorm:"type:bigint;index"`
	Stage            string `json:"stage" gorm:"type:varchar(16);not null;default:''"`
	Level            int    `json:"level" gorm:"not null;default:0"`
	// CategoryName 为展示用瞬态字段（gorm:"-"），由查询侧按
	// risk_word_categories 解析填充；类别被删时回退为 Category key 本身。
	CategoryName string `json:"category_name" gorm:"-"`
}

// RiskEventInput 只带分类与处置信息，绝不带命中的词或请求原文。
// Category 为类别 Key；Action 为 record/block/restrict/disable；
// Stage 为 input/output；Level 为命中后用户所在阶梯级别。
type RiskEventInput struct {
	UserID, TokenID                       int
	Model, RequestID, RuleID, RuleVersion string
	Category, Action, Stage               string
	Level                                 int
	RestrictionUntil                      int64
}

type RiskEventDTO struct {
	EventID          string `json:"event_id"`
	Model            string `json:"model"`
	RequestID        string `json:"request_id"`
	Category         string `json:"category"`
	Action           string `json:"action"`
	CreatedAt        int64  `json:"created_at"`
	ReviewStatus     string `json:"review_status"`
	ReviewedAt       int64  `json:"reviewed_at"`
	Version          int    `json:"version"`
	RestrictionUntil int64  `json:"restriction_until"`
	Stage            string `json:"stage"`
	Level            int    `json:"level"`
	CategoryName     string `json:"category_name"`
}

func (event RiskEvent) SafeDTO() RiskEventDTO {
	return RiskEventDTO{EventID: event.EventID, Model: event.Model, RequestID: event.RequestID, Category: event.Category, Action: event.Action, CreatedAt: event.CreatedAt, ReviewStatus: event.ReviewStatus, ReviewedAt: event.ReviewedAt, Version: event.Version, RestrictionUntil: event.RestrictionUntil, Stage: event.Stage, Level: event.Level}
}

type RiskAppeal struct {
	ID           int    `json:"id"`
	EventID      string `json:"event_id" gorm:"type:varchar(64);index"`
	UserID       int    `json:"user_id" gorm:"index"`
	Reason       string `json:"reason" gorm:"type:text"`
	CreatedAt    int64  `json:"created_at" gorm:"type:bigint"`
	Status       string `json:"status" gorm:"type:varchar(24)"`
	ReviewerID   int    `json:"reviewer_id"`
	ReviewedAt   int64  `json:"reviewed_at" gorm:"type:bigint"`
	ReviewReason string `json:"review_reason" gorm:"type:text"`
	Outcome      string `json:"outcome" gorm:"type:varchar(24)"`
	Version      int    `json:"version"`
}

type RiskAppealDTO struct {
	ID         int    `json:"id"`
	EventID    string `json:"event_id"`
	Reason     string `json:"reason"`
	CreatedAt  int64  `json:"created_at"`
	Status     string `json:"status"`
	ReviewedAt int64  `json:"reviewed_at"`
	Outcome    string `json:"outcome"`
	Version    int    `json:"version"`
}

func (appeal RiskAppeal) SafeDTO() RiskAppealDTO {
	return RiskAppealDTO{ID: appeal.ID, EventID: appeal.EventID, Reason: appeal.Reason, CreatedAt: appeal.CreatedAt, Status: appeal.Status, ReviewedAt: appeal.ReviewedAt, Outcome: appeal.Outcome, Version: appeal.Version}
}

// RiskEventChange is an append-only review/appeal audit, committed with the corresponding mutation.
type RiskEventChange struct {
	ID               int    `json:"id"`
	EventID          string `json:"event_id" gorm:"type:varchar(64);index"`
	AppealID         int    `json:"appeal_id"`
	ActorID          int    `json:"actor_id"`
	Action           string `json:"action" gorm:"type:varchar(24)"`
	Status           string `json:"status" gorm:"type:varchar(24)"`
	Reason           string `json:"reason" gorm:"type:text"`
	CreatedAt        int64  `json:"created_at" gorm:"type:bigint"`
	EventVersion     int    `json:"event_version"`
	RestrictionUntil int64  `json:"restriction_until" gorm:"type:bigint"`
}

func MigrateRiskEvents() error {
	return DB.AutoMigrate(&RiskEvent{}, &RiskAppeal{}, &RiskEventChange{}, &RiskWordCategory{}, &RiskUserState{})
}

var validRiskEventActions = map[string]bool{
	"record": true, "block": true, "restrict": true, "disable": true,
}

func recordRiskEventTx(tx *gorm.DB, input RiskEventInput) (*RiskEvent, error) {
	if input.UserID <= 0 || input.TokenID < 0 || utf8.RuneCountInString(input.Model) > 200 || len(input.RequestID) > 64 ||
		utf8.RuneCountInString(input.Category) > 32 || !validRiskEventActions[input.Action] ||
		(input.Stage != "input" && input.Stage != "output") || input.Level < 0 || input.Level > RiskMaxLevel {
		return nil, ErrRiskInvalid
	}
	if input.RequestID == "" {
		input.RequestID = common.NewRequestId()
	}
	event := &RiskEvent{EventID: common.NewRequestId(), UserID: input.UserID, TokenID: input.TokenID, Model: input.Model, RequestID: input.RequestID, Category: input.Category, Action: input.Action, CreatedAt: common.GetTimestamp(), ReviewStatus: "pending", Version: 1, Stage: input.Stage, Level: input.Level, RestrictionUntil: input.RestrictionUntil}
	if input.RuleID != "" {
		event.RuleID = fmt.Sprintf("%x", sha256.Sum256([]byte(input.RuleID)))
	}
	if input.RuleVersion != "" {
		event.RuleVersion = fmt.Sprintf("%x", sha256.Sum256([]byte(input.RuleVersion)))
	}
	if err := tx.Create(event).Error; err != nil {
		return nil, err
	}
	return event, tx.Create(&RiskEventChange{EventID: event.EventID, Action: "record", Status: "pending", Reason: "sensitive keyword request blocked", CreatedAt: event.CreatedAt, EventVersion: 1}).Error
}

// RecordRiskEvent 记录一次只写档的命中（record 类别），不计入阶梯。
func RecordRiskEvent(input RiskEventInput) (*RiskEvent, error) {
	var event *RiskEvent
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		event, err = recordRiskEventTx(tx, input)
		return err
	})
	return event, err
}

// RecordRiskHit 对 block/block_restrict 命中计数并推进阶梯，在同一事务里
// 写风险事件：升级时事件 Action 为 restrict/disable，否则为 block。
// 返回事件、阶梯结果（升级、解除时间、停用、是否需通知管理员）。
func RecordRiskHit(input RiskEventInput, immediate bool) (*RiskEvent, *RiskHitResult, error) {
	var event *RiskEvent
	var result *RiskHitResult
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = ApplyRiskHit(tx, input.UserID, common.GetTimestamp(), immediate)
		if err != nil {
			return err
		}
		input.Level = result.Level
		input.RestrictionUntil = result.RestrictedUntil
		switch {
		case result.Disabled:
			input.Action = "disable"
		case result.Escalated:
			input.Action = "restrict"
		default:
			input.Action = "block"
		}
		event, err = recordRiskEventTx(tx, input)
		return err
	})
	return event, result, err
}

type RiskEventFilter struct {
	UserID                       int
	Model, Status, RequestID     string
	StartTimestamp, EndTimestamp int64
}

func ListRiskEvents(filter RiskEventFilter, start, limit int) ([]RiskEvent, int64, error) {
	if filter.UserID < 0 || start < 0 || start > 1000000 || limit < 1 || limit > 100 || utf8.RuneCountInString(filter.Model) > 200 || len(filter.RequestID) > 64 || filter.StartTimestamp < 0 || filter.EndTimestamp < 0 || (filter.EndTimestamp > 0 && filter.EndTimestamp < filter.StartTimestamp) || (filter.Status != "" && filter.Status != "pending" && filter.Status != "confirmed" && filter.Status != "false_positive") {
		return nil, 0, ErrRiskInvalid
	}
	query := DB.Model(&RiskEvent{})
	if filter.UserID > 0 {
		query = query.Where("user_id = ?", filter.UserID)
	}
	if filter.Model != "" {
		query = query.Where("model = ?", filter.Model)
	}
	if filter.Status != "" {
		query = query.Where("review_status = ?", filter.Status)
	}
	if filter.RequestID != "" {
		query = query.Where("request_id = ?", filter.RequestID)
	}
	if filter.StartTimestamp > 0 {
		query = query.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		query = query.Where("created_at <= ?", filter.EndTimestamp)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]RiskEvent, 0)
	err := query.Order("created_at DESC").Order("id DESC").Offset(start).Limit(limit).Find(&rows).Error
	return rows, total, err
}

// ownerID is server-selected: positive for self APIs; zero only for authorized administrators.
func GetRiskEvent(eventID string, ownerID int) (*RiskEvent, error) {
	if eventID == "" || len(eventID) > 64 || ownerID < 0 {
		return nil, ErrRiskInvalid
	}
	query := DB.Where("event_id = ?", eventID)
	if ownerID > 0 {
		query = query.Where("user_id = ?", ownerID)
	}
	var event RiskEvent
	err := query.Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrRiskNotFound
	}
	return &event, err
}

func SubmitRiskAppeal(eventID string, userID int, reason string) (*RiskAppeal, error) {
	reason = strings.TrimSpace(reason)
	if userID <= 0 || reason == "" || utf8.RuneCountInString(reason) > 1000 {
		return nil, ErrRiskInvalid
	}
	event, err := GetRiskEvent(eventID, userID)
	if err != nil {
		return nil, err
	}
	appeal := &RiskAppeal{EventID: eventID, UserID: userID, Reason: reason, CreatedAt: common.GetTimestamp(), Status: "pending", Version: 1}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(appeal).Error; err != nil {
			return err
		}
		return tx.Create(&RiskEventChange{EventID: eventID, AppealID: appeal.ID, ActorID: userID, Action: "appeal", Status: event.ReviewStatus, Reason: reason, CreatedAt: appeal.CreatedAt, EventVersion: event.Version}).Error
	})
	return appeal, err
}

func ListRiskAppeals(eventID string, ownerID int) ([]RiskAppeal, error) {
	if _, err := GetRiskEvent(eventID, ownerID); err != nil {
		return nil, err
	}
	appeals := make([]RiskAppeal, 0)
	// Bound read payloads; appeals are append-only and never replace prior submissions.
	err := DB.Where("event_id = ?", eventID).Order("id DESC").Limit(100).Find(&appeals).Error
	return appeals, err
}

type RiskReviewInput struct {
	EventID                         string
	ExpectedVersion                 int
	Status, Reason                  string
	ReviewerID                      int
	AppealID, ExpectedAppealVersion int
	RestrictionSeconds              int64
}

func ReviewRiskEvent(input RiskReviewInput) (*RiskEvent, error) {
	input.Reason = strings.TrimSpace(input.Reason)
	if input.EventID == "" || len(input.EventID) > 64 || input.ExpectedVersion <= 0 || input.ReviewerID <= 0 || (input.Status != "confirmed" && input.Status != "false_positive") || input.Reason == "" || utf8.RuneCountInString(input.Reason) > 1000 || input.AppealID < 0 || (input.AppealID > 0 && input.ExpectedAppealVersion <= 0) || input.RestrictionSeconds < 0 || input.RestrictionSeconds > 30*86400 || (input.Status != "confirmed" && input.RestrictionSeconds != 0) {
		return nil, ErrRiskInvalid
	}
	now := common.GetTimestamp()
	var restrictionUntil int64
	if input.RestrictionSeconds > 0 {
		restrictionUntil = now + input.RestrictionSeconds
	}
	var event RiskEvent
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&RiskEvent{}).Where("event_id = ? AND version = ?", input.EventID, input.ExpectedVersion).Updates(map[string]any{"review_status": input.Status, "reviewer_id": input.ReviewerID, "reviewed_at": now, "review_reason": input.Reason, "version": input.ExpectedVersion + 1, "restriction_until": restrictionUntil})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			var count int64
			if err := tx.Model(&RiskEvent{}).Where("event_id = ?", input.EventID).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return ErrRiskNotFound
			}
			return ErrRiskConflict
		}
		if input.AppealID > 0 {
			result = tx.Model(&RiskAppeal{}).Where("id = ? AND event_id = ? AND version = ? AND status = ?", input.AppealID, input.EventID, input.ExpectedAppealVersion, "pending").Updates(map[string]any{"status": "resolved", "outcome": input.Status, "reviewer_id": input.ReviewerID, "reviewed_at": now, "review_reason": input.Reason, "version": input.ExpectedAppealVersion + 1})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrRiskConflict
			}
		}
		if err := tx.Create(&RiskEventChange{EventID: input.EventID, AppealID: input.AppealID, ActorID: input.ReviewerID, Action: "review", Status: input.Status, Reason: input.Reason, CreatedAt: now, EventVersion: input.ExpectedVersion + 1, RestrictionUntil: restrictionUntil}).Error; err != nil {
			return err
		}
		return tx.Where("event_id = ?", input.EventID).Take(&event).Error
	})
	return &event, err
}

// RiskRestrictionUntil 取自动阶梯与人工确认事件两处限制的最大值。
// It does not mutate account status, so expiry/false-positive review cannot
// reactivate an account that was independently disabled by an administrator.
func RiskRestrictionUntil(userID int, now int64) (int64, error) {
	if userID <= 0 || now < 0 {
		return 0, ErrRiskInvalid
	}
	// 未接库的环境（单测）按未受限处理。
	if DB == nil {
		return 0, nil
	}
	var until int64
	var state RiskUserState
	err := DB.Select("restricted_until").Where("user_id = ? AND restricted_until > ?", userID, now).Take(&state).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	if state.RestrictedUntil > now {
		until = state.RestrictedUntil
	}
	var events []RiskEvent
	err = DB.Select("restriction_until").Where("user_id = ? AND review_status = ? AND restriction_until > ?", userID, "confirmed", now).Order("restriction_until DESC").Limit(1).Find(&events).Error
	if err != nil {
		return 0, err
	}
	if len(events) > 0 && events[0].RestrictionUntil > until {
		until = events[0].RestrictionUntil
	}
	return until, nil
}

func ListRiskEventChanges(eventID string) ([]RiskEventChange, error) {
	if _, err := GetRiskEvent(eventID, 0); err != nil {
		return nil, err
	}
	changes := make([]RiskEventChange, 0)
	err := DB.Where("event_id = ?", eventID).Order("id DESC").Limit(100).Find(&changes).Error
	return changes, err
}
