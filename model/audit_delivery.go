package model

import (
	"context"
	"errors"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var auditWriteFailures atomic.Uint64

// The main database holds only audit metadata already safe for the audit log.
// Completed deliveries are removed; failed records never disappear with usage
// log retention. Payloads have no public read endpoint.
type AuditDelivery struct {
	EventID       string `gorm:"type:varchar(64);primaryKey"`
	Payload       string `gorm:"type:text"`
	CreatedAt     int64  `gorm:"type:bigint"`
	Attempts      int
	State         string `gorm:"type:varchar(24);index"`
	NextAttemptAt int64  `gorm:"type:bigint;index"`
	LeaseUntil    int64  `gorm:"type:bigint"`
	LeaseToken    string `gorm:"type:varchar(64)"`
	LastErrorCode string `gorm:"type:varchar(40)"`
}

func MigrateAuditDelivery() error { return DB.AutoMigrate(&AuditDelivery{}) }

func persistAuditDelivery(ctx context.Context, entry AuditLog) (*AuditDelivery, bool, error) {
	if DB == nil {
		return nil, false, errors.New("audit recovery database unavailable")
	}
	payload, err := common.Marshal(entry)
	if err != nil {
		return nil, false, err
	}
	if len(payload) > 64*1024 {
		return nil, false, errors.New("audit metadata exceeds recovery limit")
	}
	now := common.GetTimestamp()
	delivery := &AuditDelivery{EventID: entry.EventId, Payload: string(payload), CreatedAt: now, State: "pending", NextAttemptAt: now, Attempts: 1, LeaseToken: common.NewRequestId(), LeaseUntil: now + 30}
	result := DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(delivery)
	return delivery, result.RowsAffected == 1, result.Error
}

func RetryAuditDelivery(ctx context.Context, now int64, limit int) error {
	if now <= 0 || limit < 1 || limit > 100 {
		return errors.New("invalid audit retry batch")
	}
	if DB == nil {
		return errors.New("audit recovery database unavailable")
	}
	if err := DB.WithContext(ctx).Model(&AuditDelivery{}).Where("state IN ? AND attempts >= ? AND lease_until <= ?", []string{"pending", "retry"}, 8, now).Updates(map[string]any{"state": "needs_review", "last_error_code": "retry_exhausted", "lease_until": 0, "lease_token": "", "next_attempt_at": 0}).Error; err != nil {
		return err
	}
	var rows []AuditDelivery
	if err := DB.WithContext(ctx).Where("state IN ? AND attempts < ? AND next_attempt_at <= ? AND lease_until <= ?", []string{"pending", "retry"}, 8, now, now).Order("created_at").Limit(limit).Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		if err := ctx.Err(); err != nil {
			return err
		}
		token := common.NewRequestId()
		result := DB.WithContext(ctx).Model(&AuditDelivery{}).Where("event_id = ? AND attempts = ? AND attempts < ? AND next_attempt_at <= ? AND lease_until <= ? AND state IN ?", row.EventID, row.Attempts, 8, now, now, []string{"pending", "retry"}).Updates(map[string]any{"lease_token": token, "lease_until": now + 30, "attempts": gorm.Expr("attempts + 1")})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		var entry AuditLog
		err := common.UnmarshalJsonStr(row.Payload, &entry)
		if err == nil && entry.EventId != row.EventID {
			err = errors.New("audit recovery identity mismatch")
		}
		if err == nil {
			writeContext, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = writeAuditEntry(writeContext, entry)
			cancel()
		}
		query := DB.WithContext(ctx).Where("event_id = ? AND lease_token = ?", row.EventID, token)
		if err == nil {
			if err := query.Delete(&AuditDelivery{}).Error; err != nil {
				return err
			}
			continue
		}
		auditWriteFailures.Add(1)
		state, next := "retry", now+int64(15*(1<<min(row.Attempts+1, 8)))
		if row.Attempts+1 >= 8 {
			state, next = "needs_review", 0
		}
		if err := query.Model(&AuditDelivery{}).Updates(map[string]any{"state": state, "next_attempt_at": next, "lease_until": 0, "lease_token": "", "last_error_code": "log_write_unavailable"}).Error; err != nil {
			return err
		}
	}
	return nil
}

func HasDueAuditDeliveries(now int64) bool {
	if DB == nil {
		return false
	}
	var delivery AuditDelivery
	result := DB.Select("event_id").Where("state IN ? AND next_attempt_at <= ? AND lease_until <= ?", []string{"pending", "retry"}, now, now).Limit(1).Find(&delivery)
	// Persistence failures still schedule a task whose outcome exposes the error.
	return result.Error != nil || result.RowsAffected > 0
}

type DatabaseHealth struct {
	MainHealthy        bool                `json:"main_healthy"`
	LogHealthy         bool                `json:"log_healthy"`
	IndependentLog     bool                `json:"independent_log"`
	MainEngine         common.DatabaseType `json:"main_engine"`
	LogEngine          common.DatabaseType `json:"log_engine"`
	AuditPending       int64               `json:"audit_pending"`
	AuditNeedsReview   int64               `json:"audit_needs_review"`
	RecoveryHealthy    bool                `json:"recovery_healthy"`
	AuditWriteFailures uint64              `json:"audit_write_failures"`
}

func CheckDatabaseHealth(ctx context.Context) DatabaseHealth {
	health := DatabaseHealth{IndependentLog: DB != LOG_DB, MainEngine: common.MainDatabaseType(), LogEngine: common.LogDatabaseType(), AuditWriteFailures: auditWriteFailures.Load()}
	for index, db := range []*gorm.DB{DB, LOG_DB} {
		if db == nil {
			continue
		}
		connection, err := db.DB()
		if err != nil {
			continue
		}
		pingContext, cancel := context.WithTimeout(ctx, 2*time.Second)
		err = connection.PingContext(pingContext)
		cancel()
		if index == 0 {
			health.MainHealthy = err == nil
		} else {
			health.LogHealthy = err == nil
		}
	}
	if health.MainHealthy {
		pendingErr := DB.WithContext(ctx).Model(&AuditDelivery{}).Where("state IN ?", []string{"pending", "retry"}).Count(&health.AuditPending).Error
		reviewErr := DB.WithContext(ctx).Model(&AuditDelivery{}).Where("state = ?", "needs_review").Count(&health.AuditNeedsReview).Error
		health.RecoveryHealthy = pendingErr == nil && reviewErr == nil
	}
	return health
}
