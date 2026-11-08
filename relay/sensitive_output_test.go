package relay

import (
	"fmt"
	"io"
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
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A-1/A-4：OpenAI 渠道下各客户端格式的流式输出检查。
// 假上游 5 个内容 chunk，违禁词切在第 3、4 个之间。
func sensitiveStreamBody() string {
	deltas := []string{"hello ", "world ", "zzbloc", "kedzz and ", "tail end"}
	var body strings.Builder
	for i, delta := range deltas {
		body.WriteString("data: ")
		body.WriteString(fmt.Sprintf(`{"id":"chat_1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":%q}}]}`, delta))
		body.WriteString("\n\n")
		_ = i
	}
	body.WriteString("data: {\"id\":\"chat_1\",\"model\":\"gpt-4o\",\"choices\":[],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":9,\"total_tokens\":12}}\n\n")
	body.WriteString("data: [DONE]\n\n")
	return body.String()
}

func setupSensitiveOutputTest(t *testing.T) *model.User {
	gin.SetMode(gin.TestMode)
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	database := setupRelayChannelDB(t)
	previousLogDB := model.LOG_DB
	model.LOG_DB = database
	t.Cleanup(func() { model.LOG_DB = previousLogDB })
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}, &model.RiskAppeal{}))
	user := &model.User{Username: "sensitive-stream-user", Password: "x", Status: 1}
	require.NoError(t, database.Create(user).Error)
	require.NoError(t, database.Create(&model.RiskWordCategory{
		Key: "auditdeny", Name: "auditdeny", Action: model.RiskWordActionBlock,
		Words: "zzblockedzz", WordCount: 1, Status: model.RiskWordCategoryStatusEnabled, Version: 1,
	}).Error)
	previousCompletion := setting.CheckSensitiveOnCompletionEnabled
	previousRedis := common.RedisEnabled
	setting.CheckSensitiveOnCompletionEnabled = true
	common.RedisEnabled = false
	service.InvalidateRiskMatcher()
	t.Cleanup(func() {
		setting.CheckSensitiveOnCompletionEnabled = previousCompletion
		common.RedisEnabled = previousRedis
		service.InvalidateRiskMatcher()
	})
	return user
}

func runOaiStream(t *testing.T, user *model.User, format types.RelayFormat, relayMode int, includeUsage bool) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName:     "gpt-4o",
		RelayFormat:         format,
		RelayMode:           relayMode,
		IsStream:            true,
		DisablePing:         true,
		StartTime:           time.Now(),
		UserId:              user.Id,
		ShouldIncludeUsage:  includeUsage,
		ChannelMeta:         &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o"},
		ThinkingContentInfo: relaycommon.ThinkingContentInfo{IsFirstThinkingContent: true},
	}
	resp := &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(sensitiveStreamBody()))}
	_, apiErr := openai.OaiStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	return recorder
}

func countOutputStageEvents(t *testing.T, userId int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, model.DB.Model(&model.RiskEvent{}).
		Where("user_id = ? AND stage = ?", userId, "output").Count(&count).Error)
	return count
}

// A-1：OpenAI 渠道 + Claude 客户端格式（/v1/messages 的 RelayMode 不是
// ChatCompletions）。客户端只收到前 3 个 chunk 的转换内容与 error 事件。
func TestOaiStreamSensitiveOutputClaudeFormat(t *testing.T) {
	user := setupSensitiveOutputTest(t)
	body := runOaiStream(t, user, types.RelayFormatClaude, relayconstant.RelayModeUnknown, false).Body.String()

	assert.Contains(t, body, "hello ")
	assert.Contains(t, body, "zzbloc")
	assert.Contains(t, body, "event: error")
	assert.Contains(t, body, "sensitive_words_detected")
	assert.NotContains(t, body, "kedzz")
	assert.NotContains(t, body, "tail end")
	assert.EqualValues(t, 1, countOutputStageEvents(t, user.Id))
}

// A-1：OpenAI 渠道 + Gemini 客户端格式（RelayModeGemini）。
func TestOaiStreamSensitiveOutputGeminiFormat(t *testing.T) {
	user := setupSensitiveOutputTest(t)
	body := runOaiStream(t, user, types.RelayFormatGemini, relayconstant.RelayModeGemini, false).Body.String()

	assert.Contains(t, body, "hello ")
	assert.Contains(t, body, "zzbloc")
	assert.Contains(t, body, "SAFETY")
	assert.NotContains(t, body, "kedzz")
	assert.NotContains(t, body, "tail end")
	assert.EqualValues(t, 1, countOutputStageEvents(t, user.Id))
}

// A-4：OpenAI 格式流式命中后只有一个 [DONE]，且是最后一条；
// include_usage 时用量 chunk 排在 [DONE] 之前。
func TestOaiStreamSensitiveOutputSingleDone(t *testing.T) {
	user := setupSensitiveOutputTest(t)

	body := runOaiStream(t, user, types.RelayFormatOpenAI, relayconstant.RelayModeChatCompletions, false).Body.String()
	assert.Equal(t, 1, strings.Count(body, "[DONE]"), "should emit exactly one [DONE]: %s", body)
	assert.True(t, strings.HasSuffix(strings.TrimSpace(body), "data: [DONE]"))
	assert.Contains(t, body, "content_filter")
	assert.NotContains(t, body, "kedzz")

	bodyWithUsage := runOaiStream(t, user, types.RelayFormatOpenAI, relayconstant.RelayModeChatCompletions, true).Body.String()
	assert.Equal(t, 1, strings.Count(bodyWithUsage, "[DONE]"), "should emit exactly one [DONE]: %s", bodyWithUsage)
	assert.True(t, strings.HasSuffix(strings.TrimSpace(bodyWithUsage), "data: [DONE]"))
	usageIdx := strings.LastIndex(bodyWithUsage, `"usage"`)
	doneIdx := strings.LastIndex(bodyWithUsage, "[DONE]")
	require.Greater(t, usageIdx, -1)
	assert.Less(t, usageIdx, doneIdx, "usage chunk must precede [DONE]: %s", bodyWithUsage)
	assert.EqualValues(t, 2, countOutputStageEvents(t, user.Id))
}

// A-1 补充：Responses 客户端打到 chat 上游时走 OaiChatToResponsesStreamHandler，
// 同样要在转换发送前截断并发 type=error 事件。
func TestOaiChatToResponsesStreamSensitiveOutput(t *testing.T) {
	user := setupSensitiveOutputTest(t)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName:     "gpt-4o",
		RelayFormat:         types.RelayFormatOpenAIResponses,
		RelayMode:           relayconstant.RelayModeResponses,
		IsStream:            true,
		DisablePing:         true,
		StartTime:           time.Now(),
		UserId:              user.Id,
		ChannelMeta:         &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o"},
		ThinkingContentInfo: relaycommon.ThinkingContentInfo{IsFirstThinkingContent: true},
	}
	resp := &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(sensitiveStreamBody()))}
	usage, apiErr := openai.OaiChatToResponsesStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	body := recorder.Body.String()
	assert.Contains(t, body, "hello ")
	assert.Contains(t, body, "zzbloc")
	assert.Contains(t, body, `"type":"error"`)
	assert.Contains(t, body, "sensitive_words_detected")
	assert.NotContains(t, body, "kedzz")
	assert.NotContains(t, body, "tail end")
	assert.EqualValues(t, 1, countOutputStageEvents(t, user.Id))
}

// A-1 补充：responses 上游转 chat 客户端的流式路径同样截断。
func TestOaiResponsesToChatStreamSensitiveOutput(t *testing.T) {
	user := setupSensitiveOutputTest(t)
	deltas := []string{"hello ", "world ", "zzbloc", "kedzz and ", "tail end"}
	var upstream strings.Builder
	for _, delta := range deltas {
		upstream.WriteString("data: ")
		upstream.WriteString(fmt.Sprintf(`{"type":"response.output_text.delta","delta":%q}`, delta))
		upstream.WriteString("\n\n")
	}
	upstream.WriteString("data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":3,\"output_tokens\":9,\"total_tokens\":12}}}\n\n")

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName:     "gpt-4o",
		RelayFormat:         types.RelayFormatOpenAI,
		RelayMode:           relayconstant.RelayModeChatCompletions,
		IsStream:            true,
		DisablePing:         true,
		StartTime:           time.Now(),
		UserId:              user.Id,
		ChannelMeta:         &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o"},
		ThinkingContentInfo: relaycommon.ThinkingContentInfo{IsFirstThinkingContent: true},
	}
	resp := &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(upstream.String()))}
	usage, apiErr := openai.OaiResponsesToChatStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	body := recorder.Body.String()
	assert.Contains(t, body, "hello ")
	assert.Contains(t, body, "zzbloc")
	assert.Contains(t, body, "content_filter")
	assert.Equal(t, 1, strings.Count(body, "[DONE]"), "should emit exactly one [DONE]: %s", body)
	assert.True(t, strings.HasSuffix(strings.TrimSpace(body), "data: [DONE]"))
	assert.NotContains(t, body, "kedzz")
	assert.EqualValues(t, 1, countOutputStageEvents(t, user.Id))
}

// A-5：非流式输出命中时同一请求只写一条 "request blocked by content policy" 日志。
func TestOaiNonStreamSensitiveOutputSingleErrorLog(t *testing.T) {
	user := setupSensitiveOutputTest(t)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		RelayFormat:     types.RelayFormatOpenAI,
		RelayMode:       relayconstant.RelayModeChatCompletions,
		StartTime:       time.Now(),
		UserId:          user.Id,
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o"},
	}
	upstreamBody := `{"id":"chat_1","model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"safe zzblockedzz reply"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}`
	resp := &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(upstreamBody))}
	_, apiErr := openai.OpenaiHandler(c, info, resp)
	require.NotNil(t, apiErr)
	assert.Empty(t, recorder.Body.String(), "blocked response must not be written back")

	var logCount int64
	require.NoError(t, model.DB.Model(&model.Log{}).
		Where("user_id = ? AND content = ?", user.Id, "request blocked by content policy").Count(&logCount).Error)
	assert.EqualValues(t, 1, logCount)
	assert.EqualValues(t, 1, countOutputStageEvents(t, user.Id))
}
