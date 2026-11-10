package model

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestRiskEventLedgerDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(dsn)
			}
			prefix := fmt.Sprintf("risk_%d_", time.Now().UnixNano())
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			previous := DB
			DB = db
			t.Cleanup(func() {
				DB = previous
				_ = db.Migrator().DropTable(&RiskEventChange{}, &RiskAppeal{}, &RiskEvent{}, &User{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&User{}))
			owner := User{Username: "risk-owner", Password: "unchanged", Role: common.RoleCommonUser, AffCode: "risk-owner"}
			require.NoError(t, db.Create(&owner).Error)
			for range 2 {
				require.NoError(t, MigrateRiskEvents())
			}
			var kept User
			require.NoError(t, db.First(&kept, owner.Id).Error)
			assert.Equal(t, "unchanged", kept.Password)
			event, err := RecordRiskEvent(RiskEventInput{UserID: owner.Id, TokenID: 3, Model: "test-model", RequestID: "request-one", Action: "record", Stage: "input", RuleID: "word must not persist", RuleVersion: "version-one"})
			require.NoError(t, err)
			assert.NotEmpty(t, event.EventID)
			assert.Equal(t, "pending", event.ReviewStatus)
			assert.Equal(t, 1, event.Version)
			assert.Len(t, event.RuleID, 64)
			assert.Len(t, event.RuleVersion, 64)
			assert.NotContains(t, event.RuleID, "word")
			_, err = RecordRiskEvent(RiskEventInput{UserID: owner.Id + 1, Model: "other-model", RequestID: "request-two", Action: "record", Stage: "input"})
			require.NoError(t, err)
			rows, total, err := ListRiskEvents(RiskEventFilter{UserID: owner.Id, Model: "test-model", Status: "pending", RequestID: "request-one", StartTimestamp: event.CreatedAt, EndTimestamp: event.CreatedAt}, 0, 20)
			require.NoError(t, err)
			assert.Equal(t, int64(1), total)
			require.Len(t, rows, 1)
			encoded, err := common.Marshal(event.SafeDTO())
			require.NoError(t, err)
			for _, secret := range []string{"rule_id", "rule_version", "review_reason", "reviewer_id", "token_id"} {
				assert.NotContains(t, string(encoded), secret)
			}
			_, err = GetRiskEvent(event.EventID, owner.Id+1)
			assert.ErrorIs(t, err, ErrRiskNotFound)
			_, err = SubmitRiskAppeal(event.EventID, owner.Id+1, "review please")
			assert.ErrorIs(t, err, ErrRiskNotFound)
			_, err = SubmitRiskAppeal(event.EventID, owner.Id, strings.Repeat("x", 1001))
			assert.ErrorIs(t, err, ErrRiskInvalid)
			appeal, err := SubmitRiskAppeal(event.EventID, owner.Id, "review please")
			require.NoError(t, err)
			appeals, err := ListRiskAppeals(event.EventID, owner.Id)
			require.NoError(t, err)
			require.Len(t, appeals, 1)
			assert.Equal(t, appeal.ID, appeals[0].ID)
			_, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 1, Status: "false_positive", Reason: "", ReviewerID: 9})
			assert.ErrorIs(t, err, ErrRiskInvalid)
			var wg sync.WaitGroup
			outcomes := make(chan error, 2)
			for range 2 {
				wg.Go(func() {
					_, err := ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 1, Status: "false_positive", Reason: "reviewed metadata", ReviewerID: 9, AppealID: appeal.ID, ExpectedAppealVersion: 1})
					outcomes <- err
				})
			}
			wg.Wait()
			close(outcomes)
			success, conflicts := 0, 0
			for err := range outcomes {
				if err == nil {
					success++
				} else if errors.Is(err, ErrRiskConflict) {
					conflicts++
				} else {
					require.NoError(t, err)
				}
			}
			assert.Equal(t, 1, success)
			assert.Equal(t, 1, conflicts)
			current, err := GetRiskEvent(event.EventID, owner.Id)
			require.NoError(t, err)
			assert.Equal(t, "false_positive", current.ReviewStatus)
			assert.Equal(t, 2, current.Version)
			appeals, err = ListRiskAppeals(event.EventID, owner.Id)
			require.NoError(t, err)
			assert.Equal(t, "resolved", appeals[0].Status)
			assert.Equal(t, 2, appeals[0].Version)
			_, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 2, Status: "confirmed", Reason: "second review", ReviewerID: 10, AppealID: appeal.ID, ExpectedAppealVersion: 2})
			assert.ErrorIs(t, err, ErrRiskConflict)
			current, err = GetRiskEvent(event.EventID, owner.Id)
			require.NoError(t, err)
			assert.Equal(t, 2, current.Version)
			_, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 2, Status: "confirmed", Reason: "second independent review", ReviewerID: 10})
			require.NoError(t, err)
			var changes []RiskEventChange
			require.NoError(t, db.Where("event_id = ?", event.EventID).Order("id").Find(&changes).Error)
			require.Len(t, changes, 4)
			assert.Equal(t, []string{"record", "appeal", "review", "review"}, []string{changes[0].Action, changes[1].Action, changes[2].Action, changes[3].Action})
			assert.Equal(t, "reviewed metadata", changes[2].Reason)
			assert.Equal(t, 9, changes[2].ActorID)
			for range 2 {
				require.NoError(t, MigrateRiskEvents())
			}
			var count int64
			require.NoError(t, db.Model(&RiskEventChange{}).Where("event_id = ?", event.EventID).Count(&count).Error)
			assert.Equal(t, int64(4), count)
			_, _, err = ListRiskEvents(RiskEventFilter{Status: "punished"}, 0, 20)
			assert.ErrorIs(t, err, ErrRiskInvalid)
			_, _, err = ListRiskEvents(RiskEventFilter{}, 0, 101)
			assert.ErrorIs(t, err, ErrRiskInvalid)

			// A keyword signal alone never restricts a user. Only a versioned
			// confirmed review may impose a bounded restriction.
			until, err := RiskRestrictionUntil(owner.Id, common.GetTimestamp())
			require.NoError(t, err)
			assert.Zero(t, until)
			current, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 3, Status: "confirmed", Reason: "temporary restriction", ReviewerID: 10, RestrictionSeconds: 3600})
			require.NoError(t, err)
			assert.Equal(t, current.ReviewedAt+3600, current.RestrictionUntil)
			until, err = RiskRestrictionUntil(owner.Id, current.ReviewedAt)
			require.NoError(t, err)
			assert.Equal(t, current.RestrictionUntil, until)
			until, err = RiskRestrictionUntil(owner.Id, current.RestrictionUntil)
			require.NoError(t, err)
			assert.Zero(t, until, "expiry must restore access without a scheduled job")
			_, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 4, Status: "false_positive", Reason: "incorrect restriction", ReviewerID: 10, RestrictionSeconds: 60})
			assert.ErrorIs(t, err, ErrRiskInvalid)
			current, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 4, Status: "false_positive", Reason: "incorrect restriction", ReviewerID: 10})
			require.NoError(t, err)
			assert.Zero(t, current.RestrictionUntil)
			until, err = RiskRestrictionUntil(owner.Id, current.ReviewedAt)
			require.NoError(t, err)
			assert.Zero(t, until)
			_, err = ReviewRiskEvent(RiskReviewInput{EventID: event.EventID, ExpectedVersion: 5, Status: "confirmed", Reason: "invalid lifetime", ReviewerID: 10, RestrictionSeconds: 31 * 86400})
			assert.ErrorIs(t, err, ErrRiskInvalid)
		})
	}
}

func TestRiskCategoryNameDatabaseMatrix(t *testing.T) {
	prevMain, prevLog := common.MainDatabaseType(), common.LogDatabaseType()
	t.Cleanup(func() {
		common.SetDatabaseTypes(prevMain, prevLog)
		initCol()
	})
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			initCol()
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(dsn)
			}
			prefix := fmt.Sprintf("riskcat_%d_", time.Now().UnixNano())
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			previous := DB
			DB = db
			t.Cleanup(func() {
				DB = previous
				_ = db.Migrator().DropTable(&RiskEventChange{}, &RiskAppeal{}, &RiskEvent{}, &RiskWordCategory{}, &RiskUserState{}, &User{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&User{}))
			require.NoError(t, MigrateRiskEvents())
			owner := User{Username: "risk-cat-user", Password: "unchanged", Role: common.RoleCommonUser, AffCode: "risk-cat-user"}
			require.NoError(t, db.Create(&owner).Error)
			require.NoError(t, db.Create(&RiskWordCategory{Key: "gambling", Name: "Gambling Words", Action: RiskWordActionBlockRestrict, Words: "placeholder", WordCount: 1, Status: RiskWordCategoryStatusEnabled, Version: 1}).Error)

			// Display-name map resolves existing categories and omits deleted ones.
			names, err := RiskCategoryDisplayNames([]string{"gambling", "gone-cat", ""})
			require.NoError(t, err)
			assert.Equal(t, "Gambling Words", names["gambling"])
			_, ok := names["gone-cat"]
			assert.False(t, ok, "deleted category must fall back to its key at the controller layer")
			_, ok = names[""]
			assert.False(t, ok)

			older, err := RecordRiskEvent(RiskEventInput{UserID: owner.Id, TokenID: 1, Model: "m", Category: "gone-cat", Action: "restrict", Stage: "input", Level: 1})
			require.NoError(t, err)
			// Ensure the newer event sorts after the older one even on second-resolution timestamps.
			newer, err := RecordRiskEvent(RiskEventInput{UserID: owner.Id, TokenID: 1, Model: "m", Category: "gambling", Action: "restrict", Stage: "input", Level: 2})
			require.NoError(t, err)
			require.NoError(t, db.Model(&RiskEvent{}).Where("event_id = ?", newer.EventID).Update("created_at", older.CreatedAt+1).Error)

			// SafeDTO JSON carries category_name but never secret fields or content.
			dto := newer.SafeDTO()
			dto.CategoryName = names[newer.Category]
			encoded, err := common.Marshal(dto)
			require.NoError(t, err)
			assert.Contains(t, string(encoded), `"category_name":"Gambling Words"`)
			for _, secret := range []string{"rule_id", "rule_version", "review_reason", "reviewer_id", "token_id", "word", "content"} {
				assert.NotContains(t, string(encoded), secret)
			}
			assert.Equal(t, "gambling", dto.Category)

			// No state row / unrestricted: state exposes no event fields.
			state, err := GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Empty(t, state.EventID)
			assert.Empty(t, state.CategoryName)

			// Restricted state surfaces the newest restrict/disable event with the
			// resolved category name.
			require.NoError(t, db.Save(&RiskUserState{UserId: owner.Id, Level: 2, Hits: 2, RestrictedUntil: common.GetTimestamp() + 3600}).Error)
			state, err = GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, newer.EventID, state.EventID)
			assert.Equal(t, "Gambling Words", state.CategoryName)
			assert.False(t, state.Disabled)

			// Deleted category falls back to the key itself.
			require.NoError(t, db.Model(&RiskUserState{}).Where("user_id = ?", owner.Id).Updates(map[string]any{"restricted_until": common.GetTimestamp() + 7200}).Error)
			require.NoError(t, db.Model(&RiskEvent{}).Where("event_id = ?", older.EventID).Update("created_at", newer.CreatedAt+2).Error)
			state, err = GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, older.EventID, state.EventID)
			assert.Equal(t, "gone-cat", state.CategoryName)

			// R-1：人工确认限制（review_status=confirmed + 事件行
			// restriction_until）在状态行无截止时间时同样报受限，且
			// event_id 指向产生当前限制的那条事件。
			manual, err := RecordRiskEvent(RiskEventInput{UserID: owner.Id, TokenID: 1, Model: "m", Category: "gambling", Action: "record", Stage: "input"})
			require.NoError(t, err)
			manualDeadline := common.GetTimestamp() + 5400
			require.NoError(t, db.Model(&RiskEvent{}).Where("event_id = ?", manual.EventID).
				Updates(map[string]any{"review_status": "confirmed", "restriction_until": manualDeadline}).Error)
			require.NoError(t, db.Model(&RiskUserState{}).Where("user_id = ?", owner.Id).Update("restricted_until", 0).Error)
			state, err = GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, manualDeadline, state.RestrictedUntil, "manual review restriction must surface like the API gate")
			assert.Equal(t, manual.EventID, state.EventID)
			assert.Equal(t, "Gambling Words", state.CategoryName)
		})
	}
}
