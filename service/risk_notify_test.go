package service

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRiskNotifyTestDB(t *testing.T) {
	t.Helper()
	previousDB, previousRedis := model.DB, common.RedisEnabled
	previousEnabled := setting.CheckSensitiveEnabled
	previousPrompt := setting.CheckSensitiveOnPromptEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserNotification{}, &model.RiskUserState{}, &model.RiskEvent{}, &model.RiskEventChange{}, &model.RiskWordCategory{}, &model.AuditLog{}))
	model.DB = db
	common.RedisEnabled = false
	setting.CheckSensitiveEnabled = true
	setting.CheckSensitiveOnPromptEnabled = true
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		setting.CheckSensitiveEnabled = previousEnabled
		setting.CheckSensitiveOnPromptEnabled = previousPrompt
		_ = sqlDB.Close()
	})
}

func testRelayInfo(userID int) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{UserId: userID, TokenId: 1, OriginModelName: "risk-test-model", RequestId: "risk-test-req"}
}

func riskGinContext(userID int) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	if userID > 0 {
		c.Set("id", userID)
	}
	return c
}

func TestNotifyRiskReviewAdminsFiltersByPermission(t *testing.T) {
	setupRiskNotifyTestDB(t)
	// root 是超级管理员（有全部权限）；普通管理员无 risk.review 时不收通知。
	root := model.User{Username: "risk-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "risk-root"}
	admin := model.User{Username: "risk-admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "risk-admin"}
	plain := model.User{Username: "risk-plain", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "risk-plain"}
	require.NoError(t, model.DB.Create(&root).Error)
	require.NoError(t, model.DB.Create(&admin).Error)
	require.NoError(t, model.DB.Create(&plain).Error)

	NotifyRiskReviewAdmins("Risk level 3 reached", "user_id=1 level=3 category=severe outcome=restricted")

	var rows []model.UserNotification
	require.NoError(t, model.DB.Find(&rows).Error)
	require.Len(t, rows, 1)
	assert.Equal(t, root.Id, rows[0].UserId)
	assert.Equal(t, "Risk level 3 reached", rows[0].Title)
	assert.Contains(t, rows[0].Content, "category=severe")
	// 通知内容不得包含任何命中词（测试词只在事件侧，通知只带类别 Key）。
	assert.NotContains(t, rows[0].Content, "zz")
}

func TestCheckSensitiveInputRestrictedUserGets403(t *testing.T) {
	setupRiskNotifyTestDB(t)
	user := model.User{Username: "restricted-user", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(&user).Error)
	until := common.GetTimestamp() + 3600
	require.NoError(t, model.DB.Create(&model.RiskUserState{UserId: user.Id, Level: 2, RestrictedUntil: until, Version: 1}).Error)

	c := riskGinContext(user.Id)
	apiErr := CheckSensitiveInput(c, nil, []string{"any text"})
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
	assert.Equal(t, "risk_restricted", string(apiErr.GetErrorCode()))
	assert.Contains(t, apiErr.Error(), time.Unix(until, 0).UTC().Format(time.RFC3339))

	// 受限返回先于词检查：不应写入任何风险事件。
	var events int64
	require.NoError(t, model.DB.Model(&model.RiskEvent{}).Count(&events).Error)
	assert.Zero(t, events)
}

func TestCheckSensitiveInputBlockWritesSafeEvent(t *testing.T) {
	setupRiskNotifyTestDB(t)
	user := model.User{Username: "blocked-user", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.RiskWordCategory{
		Key: "deny", Name: "deny", Action: model.RiskWordActionBlock,
		Words: "zzblockedzz", WordCount: 1, Status: model.RiskWordCategoryStatusEnabled, Version: 1,
	}).Error)
	InvalidateRiskMatcher()
	t.Cleanup(InvalidateRiskMatcher)

	c := riskGinContext(user.Id)
	apiErr := CheckSensitiveInput(c, testRelayInfo(user.Id), []string{"request contains zzblockedzz token"})
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusUnprocessableEntity, apiErr.StatusCode)
	assert.NotContains(t, apiErr.Error(), "zzblockedzz")

	var event model.RiskEvent
	require.NoError(t, model.DB.Take(&event).Error)
	assert.Equal(t, "deny", event.Category)
	assert.Equal(t, "block", event.Action)
	assert.Equal(t, "input", event.Stage)
	// 事件只存类别与摘要，不存命中词或原文。
	assert.NotContains(t, event.RuleID, "zzblockedzz")
	assert.NotContains(t, event.Model+event.RequestID+event.Category, "zzblockedzz")
}

func TestCheckSensitiveInputRecordOnly(t *testing.T) {
	setupRiskNotifyTestDB(t)
	user := model.User{Username: "record-user", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.RiskWordCategory{
		Key: "watch", Name: "watch", Action: model.RiskWordActionRecord,
		Words: "zzwatchedzz", WordCount: 1, Status: model.RiskWordCategoryStatusEnabled, Version: 1,
	}).Error)
	InvalidateRiskMatcher()
	t.Cleanup(InvalidateRiskMatcher)

	c := riskGinContext(user.Id)
	// record 类别放行请求，只写事件不计阶梯。
	assert.Nil(t, CheckSensitiveInput(c, testRelayInfo(user.Id), []string{"mention zzwatchedzz"}))
	var event model.RiskEvent
	require.NoError(t, model.DB.Take(&event).Error)
	assert.Equal(t, "record", event.Action)
	state, err := model.GetRiskUserState(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 0, state.Level)
}
