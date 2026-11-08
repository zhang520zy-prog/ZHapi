package model

import (
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

var riskLadderTestDialects = []struct {
	name   string
	dsnEnv string
	open   func(string) gorm.Dialector
}{
	{name: "sqlite"},
	{name: "mysql", dsnEnv: "TEST_MYSQL_DSN", open: func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
	{name: "postgres", dsnEnv: "TEST_POSTGRES_DSN", open: func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
}

// applyHitAt 在事务里按固定时间推进一次阶梯，模拟单实例调用路径。
func applyHitAt(t *testing.T, db *gorm.DB, userId int, now int64, immediate bool) *RiskHitResult {
	t.Helper()
	var result *RiskHitResult
	err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = ApplyRiskHit(tx, userId, now, immediate)
		return err
	})
	require.NoError(t, err)
	return result
}

func TestRiskLadderAndCategoriesDatabaseMatrix(t *testing.T) {
	previousSetting := *operation_setting.GetRiskSetting()
	t.Cleanup(func() { *operation_setting.GetRiskSetting() = previousSetting })
	setting := operation_setting.GetRiskSetting()
	setting.HitThreshold = 3
	setting.FirstWindowSeconds = 3600
	setting.EscalationWindowSeconds = 86400
	setting.ResetAfterSeconds = 86400
	setting.LevelDurationsSeconds = []int64{600, 3600, 86400}
	setting.NotifyLevels = []int{3, 4}

	for _, dialect := range riskLadderTestDialects {
		t.Run(dialect.name, func(t *testing.T) {
			var driver gorm.Dialector
			if dialect.name == "sqlite" {
				driver = sqlite.Open(":memory:")
			} else {
				dsn := os.Getenv(dialect.dsnEnv)
				if dsn == "" {
					t.Skip(dialect.dsnEnv + " not configured")
				}
				driver = dialect.open(dsn)
			}
			prefix := fmt.Sprintf("ladder_%d_", time.Now().UnixNano())
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect.name == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			previous := DB
			previousType := common.MainDatabaseType()
			previousKeyCol := commonKeyCol
			DB = db
			dbType := common.DatabaseTypeSQLite
			if dialect.name == "mysql" {
				dbType = common.DatabaseTypeMySQL
			} else if dialect.name == "postgres" {
				dbType = common.DatabaseTypePostgreSQL
			}
			common.SetMainDatabaseType(dbType)
			// initCol 只在进程启动时跑一次，测试按方言手动对齐引用列名。
			if dbType == common.DatabaseTypePostgreSQL {
				commonKeyCol = `"key"`
			} else {
				commonKeyCol = "`key`"
			}
			t.Cleanup(func() {
				DB = previous
				common.SetMainDatabaseType(previousType)
				commonKeyCol = previousKeyCol
				_ = db.Migrator().DropTable(&RiskWordCategory{}, &RiskUserState{}, &RiskEventChange{}, &RiskAppeal{}, &RiskEvent{}, &Option{}, &User{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&User{}, &Option{}, &RiskEvent{}, &RiskAppeal{}, &RiskEventChange{}, &RiskWordCategory{}, &RiskUserState{}))
			// 二次 AutoMigrate 幂等，不重建列。
			require.NoError(t, db.AutoMigrate(&RiskWordCategory{}, &RiskUserState{}))
			owner := User{Username: "ladder-owner", Password: "unchanged", Role: common.RoleCommonUser, AffCode: "ladder-owner", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&owner).Error)

			// —— 词库类别 ——
			words, invalid := NormalizeRiskWords("  ZzBlockedZz \n\nzzotherzz\r\n ZzBlockedZz \n bad\x00word \n")
			require.Equal(t, 1, invalid)
			require.Equal(t, []string{"zzblockedzz", "zzotherzz"}, words)

			// 首次迁移：空表 + 存量 SensitiveWords → general(block)。
			require.NoError(t, db.Create(&Option{Key: "SensitiveWords", Value: "zzlegacyzz\nzzlegacytwozz"}).Error)
			require.NoError(t, migrateLegacySensitiveWords())
			require.NoError(t, migrateLegacySensitiveWords()) // 幂等
			var general RiskWordCategory
			require.NoError(t, db.Where(commonKeyCol+" = ?", RiskGeneralCategoryKey).Take(&general).Error)
			assert.Equal(t, RiskWordActionBlock, general.Action)
			assert.Equal(t, 2, general.WordCount)
			require.ErrorIs(t, DeleteRiskWordCategory(general.Id, general.Version, 1), ErrRiskInvalid) // general 不可删

			cat, err := CreateRiskWordCategory("fraud", "欺诈", RiskWordActionRecord, 1)
			require.NoError(t, err)
			_, err = CreateRiskWordCategory("fraud", "重复", RiskWordActionRecord, 1)
			require.ErrorIs(t, err, ErrRiskConflict) // 键唯一
			_, err = CreateRiskWordCategory("bad key!", "x", RiskWordActionRecord, 1)
			require.ErrorIs(t, err, ErrRiskInvalid)

			added, dup, err := ImportRiskWords(cat.Id, []string{"zzfraudzz", "zzfraudzz", "zzotherfraudzz"}, false, cat.Version, 1)
			require.NoError(t, err)
			assert.Equal(t, 2, added)
			assert.Equal(t, 1, dup)
			fresh, err := GetRiskWordCategory(cat.Id)
			require.NoError(t, err)
			assert.Equal(t, 2, fresh.Version)
			_, _, err = ImportRiskWords(cat.Id, []string{"zzotherfraudzz"}, false, 1, 1)
			require.ErrorIs(t, err, ErrRiskConflict) // 版本 CAS
			added, dup, err = ImportRiskWords(cat.Id, []string{"zzreplacezz"}, true, fresh.Version, 1)
			require.NoError(t, err)
			assert.Equal(t, 1, added)
			exported, count, err := GetRiskCategoryWords(cat.Id)
			require.NoError(t, err)
			assert.Equal(t, 1, count)
			assert.Equal(t, []string{"zzreplacezz"}, exported)

			_, err = UpdateRiskWordCategory(cat.Id, "欺诈改名", RiskWordActionBlockRestrict, RiskWordCategoryStatusEnabled, 3, 1)
			require.NoError(t, err)
			_, err = UpdateRiskWordCategory(cat.Id, "再次", RiskWordActionBlock, RiskWordCategoryStatusEnabled, 3, 1)
			require.ErrorIs(t, err, ErrRiskConflict)

			versions, err := ListEnabledRiskCategoryVersions()
			require.NoError(t, err)
			assert.Len(t, versions, 2)

			// —— 四级阶梯 ——
			base := int64(1_700_000_000)
			// 头两次计数不升级。
			for i := 1; i <= 2; i++ {
				result := applyHitAt(t, db, owner.Id, base+int64(i), false)
				assert.False(t, result.Escalated)
				assert.Equal(t, 0, result.Level)
			}
			// 第三次命中升到第 1 级，限制 600 秒。
			result := applyHitAt(t, db, owner.Id, base+3, false)
			assert.True(t, result.Escalated)
			assert.Equal(t, 1, result.Level)
			assert.Equal(t, base+3+600, result.RestrictedUntil)
			assert.False(t, result.Notify)

			until, err := RiskRestrictionUntil(owner.Id, base+10)
			require.NoError(t, err)
			assert.Equal(t, result.RestrictedUntil, until)
			until, err = RiskRestrictionUntil(owner.Id, result.RestrictedUntil+1)
			require.NoError(t, err)
			assert.Zero(t, until)

			// 限制结束后在升级窗口内再积 3 次 → 第 2 级。
			level2Base := result.RestrictedUntil + 10
			for i := 1; i <= 2; i++ {
				applyHitAt(t, db, owner.Id, level2Base+int64(i), false)
			}
			result = applyHitAt(t, db, owner.Id, level2Base+3, false)
			assert.Equal(t, 2, result.Level)
			assert.Equal(t, level2Base+3+3600, result.RestrictedUntil)

			// 第 3 级，触发管理员通知标记。
			level3Base := result.RestrictedUntil + 10
			for i := 1; i <= 2; i++ {
				applyHitAt(t, db, owner.Id, level3Base+int64(i), false)
			}
			result = applyHitAt(t, db, owner.Id, level3Base+3, false)
			assert.Equal(t, 3, result.Level)
			assert.Equal(t, level3Base+3+86400, result.RestrictedUntil)
			assert.True(t, result.Notify)

			// 长时间未命中 → 回落第 0 级重新计数。
			coldBase := result.RestrictedUntil + setting.ResetAfterSeconds + 100
			cold := applyHitAt(t, db, owner.Id, coldBase, false)
			assert.False(t, cold.Escalated)
			assert.Equal(t, 0, cold.Level)
			state, err := GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, 0, state.Level)
			assert.Equal(t, 1, state.Hits)

			// block_restrict 立即升一级。
			imm := applyHitAt(t, db, owner.Id, coldBase+10, true)
			assert.True(t, imm.Escalated)
			assert.Equal(t, 1, imm.Level)

			// 撤销：级别归零、生效中的人工 restriction_until 截断。
			require.NoError(t, db.Create(&RiskEvent{EventID: "evt-manual", UserID: owner.Id, Category: "manual", Action: "restrict", ReviewStatus: "confirmed", RestrictionUntil: coldBase + 99999, Version: 1, CreatedAt: coldBase}).Error)
			require.NoError(t, RevokeRiskRestriction(owner.Id, 1, "ops revoke"))
			state, err = GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, 0, state.Level)
			until, err = RiskRestrictionUntil(owner.Id, common.GetTimestamp()+1)
			require.NoError(t, err)
			assert.Zero(t, until)

			// 并发 20 次命中：3/6/9/12 次升级，第 12 次停用。
			parallelUser := User{Username: "ladder-parallel", Password: "x", Role: common.RoleCommonUser, AffCode: "ladder-parallel", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&parallelUser).Error)
			fixed := base + 10_000
			var wg sync.WaitGroup
			errs := make(chan error, 20)
			for range 20 {
				wg.Go(func() {
					errs <- db.Transaction(func(tx *gorm.DB) error {
						_, err := ApplyRiskHit(tx, parallelUser.Id, fixed, false)
						return err
					})
				})
			}
			wg.Wait()
			close(errs)
			for err := range errs {
				require.NoError(t, err)
			}
			state, err = GetRiskUserState(parallelUser.Id)
			require.NoError(t, err)
			assert.Equal(t, RiskMaxLevel, state.Level)
			assert.True(t, state.Disabled)
			var locked User
			require.NoError(t, db.Take(&locked, parallelUser.Id).Error)
			assert.Equal(t, common.UserStatusDisabled, locked.Status)

			// 恢复：风控停用可恢复；非风控停用拒绝。
			require.NoError(t, ReenableRiskUser(parallelUser.Id, 1, "ops reenable"))
			require.NoError(t, db.Take(&locked, parallelUser.Id).Error)
			assert.Equal(t, common.UserStatusEnabled, locked.Status)
			state, err = GetRiskUserState(parallelUser.Id)
			require.NoError(t, err)
			assert.Equal(t, 0, state.Level)

			manualUser := User{Username: "ladder-manual", Password: "x", Role: common.RoleCommonUser, AffCode: "ladder-manual", Status: common.UserStatusDisabled}
			require.NoError(t, db.Create(&manualUser).Error)
			require.ErrorIs(t, ReenableRiskUser(manualUser.Id, 1, "should fail"), ErrRiskInvalid)

			// record 事件不推进阶梯：写 record 事件后状态不变。
			before, err := GetRiskUserState(owner.Id)
			require.NoError(t, err)
			_, err = RecordRiskEvent(RiskEventInput{UserID: owner.Id, Category: "fraud", Action: "record", Stage: "input", Model: "m"})
			require.NoError(t, err)
			after, err := GetRiskUserState(owner.Id)
			require.NoError(t, err)
			assert.Equal(t, before.Level, after.Level)
			assert.Equal(t, before.Hits, after.Hits)
		})
	}
}
