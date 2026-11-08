package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRiskMatcherTestDB(t *testing.T) {
	t.Helper()
	previousDB := model.DB
	previousEnabled := setting.CheckSensitiveEnabled
	previousCompletion := setting.CheckSensitiveOnCompletionEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.RiskWordCategory{}))
	model.DB = db
	setting.CheckSensitiveEnabled = true
	setting.CheckSensitiveOnCompletionEnabled = true
	InvalidateRiskMatcher()
	t.Cleanup(func() {
		model.DB = previousDB
		setting.CheckSensitiveEnabled = previousEnabled
		setting.CheckSensitiveOnCompletionEnabled = previousCompletion
		InvalidateRiskMatcher()
		_ = sqlDB.Close()
	})
}

func seedRiskCategory(t *testing.T, key, action string, status int, words string) *model.RiskWordCategory {
	t.Helper()
	category := &model.RiskWordCategory{
		Key: key, Name: key, Action: action, Words: words,
		WordCount: 1, Status: status, Version: 1,
	}
	require.NoError(t, model.DB.Create(category).Error)
	InvalidateRiskMatcher()
	return category
}

func TestMatchRiskPicksHeaviestCategory(t *testing.T) {
	setupRiskMatcherTestDB(t)
	// 同一文本命中三个类别：record < block < block_restrict。
	seedRiskCategory(t, "observe", model.RiskWordActionRecord, model.RiskWordCategoryStatusEnabled, "zzblockedzz")
	seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzdenyzz")
	seedRiskCategory(t, "severe", model.RiskWordActionBlockRestrict, model.RiskWordCategoryStatusEnabled, "zzseverelyzz")

	matched := MatchRisk("text contains zzdenyzz and zzblockedzz and zzseverelyzz")
	require.NotNil(t, matched)
	assert.Equal(t, "severe", matched.Key)
	assert.Equal(t, model.RiskWordActionBlockRestrict, matched.Action)

	matched = MatchRisk("only zzblockedzz here")
	require.NotNil(t, matched)
	assert.Equal(t, "observe", matched.Key)

	matched = MatchRisk("only zzdenyzz here")
	require.NotNil(t, matched)
	assert.Equal(t, "deny", matched.Key)

	assert.Nil(t, MatchRisk("clean text with no hits"))
	assert.Nil(t, MatchRisk(""))
}

func TestMatchRiskCaseInsensitive(t *testing.T) {
	setupRiskMatcherTestDB(t)
	seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzblockedzz")
	matched := MatchRisk("SHOUTING ZZBLOCKEDZZ MIXED")
	require.NotNil(t, matched)
	assert.Equal(t, "deny", matched.Key)
}

func TestMatchRiskDisabledCategorySkipped(t *testing.T) {
	setupRiskMatcherTestDB(t)
	category := seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusDisabled, "zzblockedzz")
	assert.Nil(t, MatchRisk("hit zzblockedzz"))

	// 启用后版本变化触发缓存重建，新类别生效。
	require.NoError(t, model.DB.Model(&model.RiskWordCategory{}).Where("id = ?", category.Id).
		Updates(map[string]any{"status": model.RiskWordCategoryStatusEnabled, "version": 2}).Error)
	matched := MatchRisk("hit zzblockedzz")
	require.NotNil(t, matched)
	assert.Equal(t, "deny", matched.Key)
}

func TestMatchRiskCacheInvalidatesOnVersionChange(t *testing.T) {
	setupRiskMatcherTestDB(t)
	category := seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzoldwordzz")
	require.NotNil(t, MatchRisk("hit zzoldwordzz"))
	assert.Nil(t, MatchRisk("hit zznewwordzz"))

	// 模拟后台换词：版本递增，下一轮 MatchRisk 自动重建自动机。
	require.NoError(t, model.DB.Model(&model.RiskWordCategory{}).Where("id = ?", category.Id).
		Updates(map[string]any{"words": "zznewwordzz", "version": 2}).Error)
	assert.Nil(t, MatchRisk("hit zzoldwordzz"))
	require.NotNil(t, MatchRisk("hit zznewwordzz"))
}

func TestStreamGuardCrossChunkMatch(t *testing.T) {
	setupRiskMatcherTestDB(t)
	seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzblockedzz")

	guard := NewStreamGuard()
	require.NotNil(t, guard)
	// 词被切成三段：zzblo / cked / zz。
	assert.Nil(t, guard.Feed("hello zzblo"))
	assert.Nil(t, guard.Feed("cke"))
	matched := guard.Feed("dzz and more")
	require.NotNil(t, matched)
	assert.Equal(t, "deny", matched.Key)

	// 中文词按 rune 拼接。
	seedRiskCategory(t, "deny2", model.RiskWordActionBlockRestrict, model.RiskWordCategoryStatusEnabled, "违禁词组")
	guard2 := NewStreamGuard()
	assert.Nil(t, guard2.Feed("前面是违禁"))
	matched = guard2.Feed("词组尾巴")
	require.NotNil(t, matched)
	assert.Equal(t, "deny2", matched.Key)
	assert.Equal(t, model.RiskWordActionBlockRestrict, matched.Action)
}

func TestStreamGuardDisabledByToggle(t *testing.T) {
	setupRiskMatcherTestDB(t)
	seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzblockedzz")
	// 开关关闭时不建 guard，调用方不 Feed。
	setting.CheckSensitiveOnCompletionEnabled = false
	assert.Nil(t, NewStreamGuard())
	setting.CheckSensitiveOnCompletionEnabled = true
	require.NotNil(t, NewStreamGuard())
}

func TestMatchResultExposesNoWords(t *testing.T) {
	setupRiskMatcherTestDB(t)
	seedRiskCategory(t, "deny", model.RiskWordActionBlock, model.RiskWordCategoryStatusEnabled, "zzblockedzz")
	matched := MatchRisk("contains zzblockedzz secret")
	require.NotNil(t, matched)
	// 返回结构只有类别元数据，不存在词或命中位置字段。
	assert.Equal(t, "deny", matched.Key)
	assert.Equal(t, model.RiskWordActionBlock, matched.Action)
	assert.NotContains(t, []string{matched.Key, matched.Name, matched.Action}, "zzblockedzz")
}
