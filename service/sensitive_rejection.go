package service

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
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

// CheckSensitiveInput applies the same automatic input policy to HTTP requests,
// task submissions and individual Realtime frames, before forwarding their text.
// It does not estimate usage or reserve quota.
func CheckSensitiveInput(c *gin.Context, info *relaycommon.RelayInfo, texts []string) *types.NewAPIError {
	userID := c.GetInt("id")
	if userID == 0 && info != nil {
		userID = info.UserId
	}
	if userID > 0 {
		until, err := model.RiskRestrictionUntil(userID, common.GetTimestamp())
		if err != nil {
			logger.LogError(c, "risk access check unavailable")
			return types.NewErrorWithStatusCode(errors.New("risk access check unavailable; retry later"), types.ErrorCode("risk_unavailable"), http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		if until > 0 {
			return types.NewErrorWithStatusCode(errors.New("API access temporarily restricted; view risk events or submit an appeal"), types.ErrorCode("risk_restricted"), http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
	}
	if !setting.ShouldCheckPromptSensitive() {
		return nil
	}
	for _, text := range texts {
		if contains, words := CheckSensitiveText(text); contains {
			RecordSensitiveWordRejection(c, info, len(words))
			if info != nil && userID > 0 {
				requestID := c.GetString(common.RequestIdKey)
				if requestID == "" {
					requestID = info.RequestId
				}
				wordsSnapshot := slices.Clone(setting.SensitiveWords)
				slices.Sort(wordsSnapshot)
				if _, err := model.RecordRiskEvent(model.RiskEventInput{
					UserID: userID, TokenID: info.TokenId, Model: info.OriginModelName,
					RequestID: requestID, RuleID: "sensitive_words", RuleVersion: strings.Join(wordsSnapshot, "\x00"),
				}); err != nil {
					logger.LogError(c, "risk event persistence failed")
				}
			}
			return types.NewErrorWithStatusCode(
				errors.New("request blocked by content policy"),
				types.ErrorCodeSensitiveWordsDetected,
				http.StatusUnprocessableEntity,
				types.ErrOptionWithSkipRetry(),
				types.ErrOptionWithNoRecordErrorLog(),
			)
		}
	}
	return nil
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
