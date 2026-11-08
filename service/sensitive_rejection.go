package service

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

func sensitiveUserID(c *gin.Context, info *relaycommon.RelayInfo) int {
	userID := c.GetInt("id")
	if userID == 0 && info != nil {
		userID = info.UserId
	}
	return userID
}

func sensitiveRequestID(c *gin.Context, info *relaycommon.RelayInfo) string {
	requestID := c.GetString(common.RequestIdKey)
	if requestID == "" && info != nil {
		requestID = info.RequestId
	}
	return requestID
}

func riskEventInputFor(c *gin.Context, info *relaycommon.RelayInfo, userID int, category *RiskMatchCategory, stage string) model.RiskEventInput {
	input := model.RiskEventInput{
		UserID:      userID,
		Category:    category.Key,
		Stage:       stage,
		RequestID:   sensitiveRequestID(c, info),
		RuleID:      "sensitive_words",
		RuleVersion: riskMatcherSignatureNow(),
	}
	if info != nil {
		input.TokenID = info.TokenId
		input.Model = info.OriginModelName
	}
	return input
}

func riskMatcherSignatureNow() string {
	if m := currentRiskMatcher(); m != nil {
		return m.signature
	}
	return ""
}

func sensitiveBlockedError(category *RiskMatchCategory) *types.NewAPIError {
	return types.NewErrorWithStatusCode(
		fmt.Errorf("request blocked by content policy (category: %s); view risk events or submit an appeal", category.Key),
		types.ErrorCodeSensitiveWordsDetected,
		http.StatusUnprocessableEntity,
		types.ErrOptionWithSkipRetry(),
		types.ErrOptionWithNoRecordErrorLog(),
	)
}

// applySensitiveHit 对 block / block_restrict 命中：同一事务里计数、升级、写
// 事件；事务提交后再发管理员通知与停用清理，失败只记日志。
func applySensitiveHit(c *gin.Context, info *relaycommon.RelayInfo, userID int, category *RiskMatchCategory, stage string) {
	if info == nil || userID <= 0 {
		return
	}
	input := riskEventInputFor(c, info, userID, category, stage)
	input.Action = "block"
	event, result, err := model.RecordRiskHit(input, category.Action == model.RiskWordActionBlockRestrict)
	if err != nil {
		logger.LogError(c, "risk hit persistence failed")
		return
	}
	if result.Disabled {
		model.FinishRiskDisable(userID)
	}
	if result.Notify {
		NotifyRiskEscalation(userID, result, category, event)
	}
}

// checkSensitiveStage 输入/输出共用的命中处理：record 只写事件放行；
// block / block_restrict 返回 422 并计入阶梯。
func checkSensitiveStage(c *gin.Context, info *relaycommon.RelayInfo, userID int, texts []string, stage string) *types.NewAPIError {
	recordLogged := false
	for _, text := range texts {
		category := MatchRisk(text)
		if category == nil {
			continue
		}
		if category.Action == model.RiskWordActionRecord {
			if recordLogged || info == nil || userID <= 0 {
				continue
			}
			recordLogged = true
			input := riskEventInputFor(c, info, userID, category, stage)
			input.Action = "record"
			if state, err := model.GetRiskUserState(userID); err == nil {
				input.Level = state.Level
			}
			if _, err := model.RecordRiskEvent(input); err != nil {
				logger.LogError(c, "risk event persistence failed")
			}
			continue
		}
		RecordSensitiveWordRejection(c, info, 1)
		applySensitiveHit(c, info, userID, category, stage)
		return sensitiveBlockedError(category)
	}
	return nil
}

// CheckSensitiveInput applies the same automatic input policy to HTTP requests,
// task submissions and individual Realtime frames, before forwarding their text.
// It does not estimate usage or reserve quota.
func CheckSensitiveInput(c *gin.Context, info *relaycommon.RelayInfo, texts []string) *types.NewAPIError {
	userID := sensitiveUserID(c, info)
	if userID > 0 {
		until, err := model.RiskRestrictionUntil(userID, common.GetTimestamp())
		if err != nil {
			logger.LogError(c, "risk access check unavailable")
			return types.NewErrorWithStatusCode(errors.New("risk access check unavailable; retry later"), types.ErrorCode("risk_unavailable"), http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		if until > 0 {
			message := fmt.Sprintf("API access restricted until %s; view risk events or submit an appeal", time.Unix(until, 0).UTC().Format(time.RFC3339))
			return types.NewErrorWithStatusCode(errors.New(message), types.ErrorCode("risk_restricted"), http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
	}
	if !setting.ShouldCheckPromptSensitive() {
		return nil
	}
	return checkSensitiveStage(c, info, userID, texts, "input")
}

// CheckSensitiveOutput 对一次完整回复文本做输出检查（非流式写回前调用）。
// 命中时写风险事件（Stage=output）、计入阶梯，返回与输入检查同格式的 422。
func CheckSensitiveOutput(c *gin.Context, info *relaycommon.RelayInfo, text string) *types.NewAPIError {
	if !setting.ShouldCheckCompletionSensitive() {
		return nil
	}
	return checkSensitiveStage(c, info, sensitiveUserID(c, info), []string{text}, "output")
}

// CheckSensitiveOutputHit 流式 StreamGuard 命中后调用：写事件、计阶梯、发通知。
// 返回错误供结束标记复用同一条目。
func CheckSensitiveOutputHit(c *gin.Context, info *relaycommon.RelayInfo, category *RiskMatchCategory) *types.NewAPIError {
	userID := sensitiveUserID(c, info)
	applySensitiveHit(c, info, userID, category, "output")
	return sensitiveBlockedError(category)
}

// RecordSensitiveWordRejection stores a safe, queryable error log for a local
// policy rejection. The blocked content is not forwarded or billed. A Realtime
// connection may already have earlier accepted turns; rejecting a new frame
// does not undo their usage. No prompt, matched keyword or channel health
// details are stored here.
func RecordSensitiveWordRejection(c *gin.Context, relayInfo *relaycommon.RelayInfo, ruleCount int) {
	if c == nil {
		return
	}

	state := RequestPolicy(c)
	state.AddEvent(PolicyEvent{
		Status:      http.StatusUnprocessableEntity,
		ErrorCode:   string(types.ErrorCodeSensitiveWordsDetected),
		ErrorSource: "local",
		Rule:        "sensitive_words",
		Decision: PolicyDecision{
			Action: "stop",
			Reason: "sensitive_keyword",
			Source: "local",
		},
		Health: "unchanged",
	})

	other := model.NewLogOther()
	other.SetPublic("policy_event", "request_blocked")
	other.SetPublic("policy_reason", "sensitive_keyword")
	other.SetPublic("policy_action", "block")
	other.SetPublic("policy_upstream_called", false)
	other.SetPublic("policy_retryable", false)
	other.SetPublic("error_type", types.ErrorTypeNewAPIError)
	other.SetPublic("error_code", types.ErrorCodeSensitiveWordsDetected)
	other.SetPublic("status_code", http.StatusUnprocessableEntity)
	// The detector stops at its first match; this is not an exhaustive rule count.
	other.SetAdmin("policy_rule_count", ruleCount)
	AppendRelayLogAdminInfo(c, relayInfo, other)
	AppendResponseModelLogInfo(relayInfo, other)
	appendRequestPath(c, relayInfo, other)

	modelName := c.GetString("original_model")
	userID := c.GetInt("id")
	tokenID := c.GetInt("token_id")
	tokenName := c.GetString("token_name")
	group := c.GetString("group")
	if relayInfo != nil {
		if userID == 0 {
			userID = relayInfo.UserId
		}
		if tokenID == 0 {
			tokenID = relayInfo.TokenId
		}
		modelName = relayInfo.OriginModelName
		if modelName == "" {
			modelName = relayInfo.GetBillingModelName()
		}
		if group == "" {
			group = relayInfo.UsingGroup
			if group == "" {
				group = relayInfo.TokenGroup
			}
		}
	}
	startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
	if startTime.IsZero() {
		startTime = state.StartedAt
	}
	useTimeSeconds := int(time.Since(startTime).Seconds())
	if useTimeSeconds < 0 {
		useTimeSeconds = 0
	}

	model.RecordErrorLog(
		c,
		userID,
		0,
		modelName,
		tokenName,
		"request blocked by content policy",
		tokenID,
		useTimeSeconds,
		common.GetContextKeyBool(c, constant.ContextKeyIsStream),
		group,
		other,
	)
	logger.LogInfo(c, fmt.Sprintf("recorded content policy rejection (rule_count=%d)", ruleCount))
}
