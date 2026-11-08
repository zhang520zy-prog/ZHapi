package relay

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPrepareRequestBillingSensitiveRejection(t *testing.T) {
	for _, protocol := range []string{"chat", "chat_tools", "responses_tools", "gemini_system"} {
		for _, streaming := range []bool{false, true} {
			name := "nonstream"
			if streaming {
				name = "stream"
			}
			name = protocol + "/" + name
			t.Run(name, func(t *testing.T) {
				db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
				require.NoError(t, err)
				logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
				require.NoError(t, err)
				for _, database := range []*gorm.DB{db, logDB} {
					sqlDB, err := database.DB()
					require.NoError(t, err)
					sqlDB.SetMaxOpenConns(1)
					t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
				}
				previousDB, previousLogDB := model.DB, model.LOG_DB
				previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
				previousRedis, previousDisable := common.RedisEnabled, common.AutomaticDisableChannelEnabled
				previousCheck, previousPrompt, previousWords := setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled, setting.SensitiveWords
				model.DB, model.LOG_DB = db, logDB
				common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
				common.RedisEnabled, common.AutomaticDisableChannelEnabled = false, true
				setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled = true, true
				setting.SensitiveWords = []string{"blocked_fixture", "another_fixture"}
				t.Cleanup(func() {
					model.DB, model.LOG_DB = previousDB, previousLogDB
					common.SetDatabaseTypes(previousMainType, previousLogType)
					common.RedisEnabled, common.AutomaticDisableChannelEnabled = previousRedis, previousDisable
					setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled, setting.SensitiveWords = previousCheck, previousPrompt, previousWords
				})
				require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.RiskEvent{}, &model.RiskEventChange{}))
				require.NoError(t, logDB.AutoMigrate(&model.Log{}))
				var sqliteVersion string
				require.NoError(t, db.Raw("select sqlite_version()").Scan(&sqliteVersion).Error)
				t.Logf("SQLite %s, isolated primary and log databases", sqliteVersion)

				user := model.User{Username: "policy-user", Quota: 1000000}
				require.NoError(t, db.Create(&user).Error)
				token := model.Token{UserId: user.Id, Key: "sk-policy-secret-fixture", Name: "policy-token", RemainQuota: 500000}
				require.NoError(t, db.Create(&token).Error)
				const prompt = "private request BLOCKED_FIXTURE another_fixture"
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions?api_key="+token.Key, strings.NewReader(prompt))
				ctx.Request.Header.Set("Authorization", "Bearer "+token.Key)
				ctx.Set("id", user.Id)
				ctx.Set("username", user.Username)
				ctx.Set("token_id", token.Id)
				ctx.Set("token_name", token.Name)
				ctx.Set("group", "default")
				ctx.Set(common.RequestIdKey, "req-policy-"+name)
				common.SetContextKey(ctx, constant.ContextKeyIsStream, streaming)
				common.SetContextKey(ctx, constant.ContextKeyTokenKey, token.Key)
				var request dto.Request = &dto.GeneralOpenAIRequest{
					Model: "gpt-policy-test", Stream: &streaming,
					Messages: []dto.Message{{Role: "user", Content: prompt}},
				}
				switch protocol {
				case "chat_tools":
					request = &dto.GeneralOpenAIRequest{}
					require.NoError(t, common.Unmarshal([]byte(`{"model":"gpt-policy-test","messages":[{"role":"assistant","tool_calls":[{"id":"call-1","type":"function","function":{"name":"search","arguments":"{\"query\":\"blocked_fixture\"}"}}]}]}`), request))
				case "responses_tools":
					request = &dto.OpenAIResponsesRequest{}
					require.NoError(t, common.Unmarshal([]byte(`{"model":"gpt-policy-test","input":[{"type":"function_call_output","call_id":"call-1","output":"blocked_fixture"}]}`), request))
				case "gemini_system":
					request = &dto.GeminiChatRequest{}
					require.NoError(t, common.Unmarshal([]byte(`{"system_instruction":{"parts":[{"text":"blocked_fixture"}]},"contents":[{"role":"user","parts":[{"text":"hello"}]}]}`), request))
				}
				info := &relaycommon.RelayInfo{
					UserId: user.Id, TokenId: token.Id, TokenKey: token.Key,
					OriginModelName: "gpt-policy-test", UsingGroup: "default", IsStream: streaming,
					Request: request,
				}

				apiErr := PrepareRequestBilling(ctx, info)
				require.NotNil(t, apiErr)
				assert.Equal(t, http.StatusUnprocessableEntity, apiErr.StatusCode)
				assert.Equal(t, types.ErrorCodeSensitiveWordsDetected, apiErr.GetErrorCode())
				assert.Equal(t, "request blocked by content policy", apiErr.ToOpenAIError().Message)
				assert.True(t, types.IsSkipRetryError(apiErr))
				assert.False(t, types.IsRecordErrorLog(apiErr), "the rejection already has its own log")
				assert.False(t, service.ShouldDisableChannel(apiErr))
				assert.Nil(t, info.Billing, "rejection must precede quota reservation")
				var risks []model.RiskEvent
				require.NoError(t, db.Find(&risks).Error)
				require.Len(t, risks, 1)
				assert.Equal(t, ctx.GetString(common.RequestIdKey), risks[0].RequestID)
				assert.Len(t, risks[0].RuleVersion, 64)
				assert.Equal(t, "pending", risks[0].ReviewStatus)
				require.NoError(t, db.First(&user, user.Id).Error)
				require.NoError(t, db.First(&token, token.Id).Error)
				assert.Equal(t, 1000000, user.Quota)
				assert.Equal(t, 500000, token.RemainQuota)
				assert.Zero(t, user.UsedQuota)
				assert.Zero(t, token.UsedQuota)

				var logs []*model.Log
				require.NoError(t, logDB.Find(&logs).Error)
				require.Len(t, logs, 1)
				entry := logs[0]
				assert.Equal(t, model.LogTypeError, entry.Type)
				assert.Equal(t, "req-policy-"+name, entry.RequestId)
				assert.Equal(t, "gpt-policy-test", entry.ModelName)
				assert.Equal(t, user.Id, entry.UserId)
				assert.Equal(t, token.Id, entry.TokenId)
				assert.Equal(t, streaming, entry.IsStream)
				assert.Zero(t, entry.ChannelId)
				assert.Zero(t, entry.Quota)
				assert.Zero(t, entry.PromptTokens)
				assert.Zero(t, entry.CompletionTokens)
				serialized, err := common.Marshal(entry)
				require.NoError(t, err)
				for _, secret := range []string{prompt, "blocked_fixture", "another_fixture", token.Key, "api_key"} {
					assert.NotContains(t, strings.ToLower(string(serialized)), strings.ToLower(secret))
					assert.NotContains(t, strings.ToLower(apiErr.Error()), strings.ToLower(secret))
				}
				var other map[string]any
				require.NoError(t, common.UnmarshalJsonStr(entry.Other, &other))
				assert.Equal(t, "request_blocked", other["policy_event"])
				assert.Equal(t, false, other["policy_upstream_called"])
				assert.Equal(t, false, other["policy_retryable"])
				assert.Equal(t, "/v1/chat/completions", other["request_path"])
				events := service.RequestPolicy(ctx).Events()
				require.Len(t, events, 1)
				assert.Equal(t, "stop", events[0].Decision.Action)
				assert.Equal(t, "unchanged", events[0].Health)
				assert.Zero(t, events[0].ChannelID)

				model.FormatAdminLogs(logs)
				assert.Contains(t, logs[0].Other, "request_policy")
				assert.Contains(t, logs[0].Other, "policy_rule_count")
				userLogs, total, err := model.GetUserLogs(user.Id, model.LogTypeError, 0, 0, "", "", 0, 10, "", entry.RequestId, "")
				require.NoError(t, err)
				require.EqualValues(t, 1, total)
				require.Len(t, userLogs, 1)
				assert.Contains(t, userLogs[0].Other, "request_blocked")
				assert.NotContains(t, userLogs[0].Other, "admin_info")
				assert.NotContains(t, userLogs[0].Other, "policy_rule_count")
				tokenLogs, err := model.GetLogByTokenId(token.Id)
				require.NoError(t, err)
				require.Len(t, tokenLogs, 1)
				assert.NotContains(t, tokenLogs[0].Other, "admin_info")
			})
		}
	}
}

func TestConfirmedRiskRestrictionPrecedesBillingEvenWhenKeywordCheckDisabled(t *testing.T) {
	db := setupRelayChannelDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.RiskEvent{}, &model.RiskEventChange{}))
	previous := setting.CheckSensitiveEnabled
	setting.CheckSensitiveEnabled = false
	t.Cleanup(func() { setting.CheckSensitiveEnabled = previous })
	user := model.User{Username: "restricted-user", Quota: 1000000, Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)
	event, err := model.RecordRiskEvent(model.RiskEventInput{UserID: user.Id, Model: "risk-test"})
	require.NoError(t, err)
	event, err = model.ReviewRiskEvent(model.RiskReviewInput{EventID: event.EventID, ExpectedVersion: 1, Status: "confirmed", Reason: "confirmed temporary decision", ReviewerID: 10, RestrictionSeconds: 60})
	require.NoError(t, err)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set("id", user.Id)
	info := &relaycommon.RelayInfo{UserId: user.Id, OriginModelName: "risk-test", Request: &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "ordinary message"}}}}
	apiErr := PrepareRequestBilling(ctx, info)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCode("risk_restricted"), apiErr.GetErrorCode())
	assert.True(t, types.IsSkipRetryError(apiErr))
	assert.False(t, service.ShouldDisableChannel(apiErr))
	assert.Nil(t, info.Billing)
	require.NoError(t, db.First(&user, user.Id).Error)
	assert.Equal(t, 1000000, user.Quota)
	_, err = model.ReviewRiskEvent(model.RiskReviewInput{EventID: event.EventID, ExpectedVersion: 2, Status: "false_positive", Reason: "appeal accepted", ReviewerID: 10})
	require.NoError(t, err)
	apiErr = PrepareRequestBilling(ctx, info)
	if apiErr != nil {
		assert.NotEqual(t, types.ErrorCode("risk_restricted"), apiErr.GetErrorCode())
	}
	require.NoError(t, db.First(&user, user.Id).Error)
	assert.Equal(t, common.UserStatusEnabled, user.Status)
}

func TestRealtimeSensitiveFramesAreRejectedWithoutForwarding(t *testing.T) {
	database := setupRelayChannelDB(t)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}))
	user := model.User{Username: "realtime-policy-user"}
	require.NoError(t, database.Create(&user).Error)
	previousLogDB := model.LOG_DB
	previousRedis := common.RedisEnabled
	common.RedisEnabled = false
	previousCheck, previousPrompt, previousWords := setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled, setting.SensitiveWords
	model.LOG_DB = database
	setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled = true, true
	setting.SensitiveWords = []string{"blocked_fixture"}
	t.Cleanup(func() {
		common.RedisEnabled = previousRedis
		model.LOG_DB = previousLogDB
		setting.CheckSensitiveEnabled, setting.CheckSensitiveOnPromptEnabled, setting.SensitiveWords = previousCheck, previousPrompt, previousWords
	})
	upgrader := websocket.Upgrader{}
	forwarded := make(chan string, 8)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			_, frame, err := conn.ReadMessage()
			if err != nil {
				return
			}
			forwarded <- string(frame)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.updated","session":{}}`)); err != nil {
				return
			}
		}
	}))
	defer upstream.Close()
	finished := make(chan struct{})
	engine := gin.New()
	engine.GET("/realtime", func(c *gin.Context) {
		defer close(finished)
		client, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer client.Close()
		target, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(upstream.URL, "http"), nil)
		if err != nil {
			return
		}
		defer target.Close()
		c.Set("id", user.Id)
		c.Set("username", user.Username)
		c.Set(common.RequestIdKey, "realtime-policy-request")
		common.SetContextKey(c, constant.ContextKeyIsStream, true)
		info := &relaycommon.RelayInfo{UserId: user.Id, OriginModelName: "gpt-realtime", ClientWs: client, TargetWs: target, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-realtime"}}
		_, _ = openai.OpenaiRealtimeHandler(c, info)
	})
	gateway := httptest.NewServer(engine)
	defer gateway.Close()
	client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(gateway.URL, "http")+"/realtime", nil)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = client.Close()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Error("realtime handler did not exit")
		}
	})
	require.NoError(t, client.SetReadDeadline(time.Now().Add(5*time.Second)))
	for _, frame := range []string{
		`{"type":"conversation.item.create","item":{"type":"message","role":"user","content":[{"type":"input_text","text":"blocked_fixture"}]}}`,
		`{"type":"response.create","response":{"instructions":"blocked_fixture"}}`,
		`{"type":"session.update","session":{"instructions":"blocked_fixture"}}`,
	} {
		require.NoError(t, client.WriteMessage(websocket.TextMessage, []byte(frame)))
		_, reply, err := client.ReadMessage()
		require.NoError(t, err)
		var event dto.RealtimeEvent
		require.NoError(t, common.Unmarshal(reply, &event))
		require.Equal(t, "error", event.Type, "blocked frame must not reach upstream")
		require.NotNil(t, event.Error)
		assert.Equal(t, "sensitive_words_detected", event.Error.Code)
		assert.NotContains(t, string(reply), "blocked_fixture")
	}
	const allowed = `{"type":"response.cancel","event_id":"allowed-after-rejections"}`
	require.NoError(t, client.WriteMessage(websocket.TextMessage, []byte(allowed)))
	_, reply, err := client.ReadMessage()
	require.NoError(t, err)
	assert.Contains(t, string(reply), "session.updated")
	select {
	case frame := <-forwarded:
		assert.Equal(t, allowed, frame)
	case <-time.After(5 * time.Second):
		t.Fatal("allowed frame was not forwarded")
	}
	assert.Empty(t, forwarded)
	var logs []model.Log
	require.NoError(t, database.Find(&logs).Error)
	assert.Len(t, logs, 3)
	for _, entry := range logs {
		assert.Zero(t, entry.Quota)
		assert.NotContains(t, entry.Other, "blocked_fixture")
	}
}
