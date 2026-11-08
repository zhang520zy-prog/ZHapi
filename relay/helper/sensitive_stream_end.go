package helper

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// EmitSensitiveStreamEnd B2.2：输出命中后按客户端格式发结束标记。
// 错误信息只带类别；不写词、不写原文。
//   - OpenAI：finish_reason=content_filter 的 chunk + [DONE]
//   - Claude：event: error，error.type=sensitive_words_detected
//   - Gemini：finishReason=SAFETY
//   - Responses：type=error 事件
func EmitSensitiveStreamEnd(c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) {
	message := apiErr.Error()
	switch info.RelayFormat {
	case types.RelayFormatClaude:
		payload, err := common.Marshal(map[string]any{
			"type":  "error",
			"error": types.ClaudeError{Type: string(types.ErrorCodeSensitiveWordsDetected), Message: message},
		})
		if err != nil {
			return
		}
		c.Render(-1, common.CustomEvent{Data: "event: error\ndata: " + string(payload)})
		_ = FlushWriter(c)
	case types.RelayFormatGemini:
		finishReason := "SAFETY"
		resp := &dto.GeminiChatResponse{
			Candidates: []dto.GeminiChatCandidate{{
				FinishReason: &finishReason,
				Content:      dto.GeminiChatContent{Role: "model", Parts: []dto.GeminiPart{}},
			}},
		}
		data, err := common.Marshal(resp)
		if err != nil {
			return
		}
		c.Render(-1, common.CustomEvent{Data: "data: " + string(data)})
		_ = FlushWriter(c)
	case types.RelayFormatOpenAIResponses:
		payload, err := common.Marshal(map[string]any{
			"type":    "error",
			"code":    string(types.ErrorCodeSensitiveWordsDetected),
			"message": message,
		})
		if err != nil {
			return
		}
		c.Render(-1, common.CustomEvent{Data: "data: " + string(payload)})
		_ = FlushWriter(c)
	default:
		finishReason := constant.FinishReasonContentFilter
		response := &dto.ChatCompletionsStreamResponse{
			Choices: []dto.ChatCompletionsStreamResponseChoice{{
				Index:        0,
				Delta:        dto.ChatCompletionsStreamResponseChoiceDelta{},
				FinishReason: &finishReason,
			}},
		}
		if err := ObjectData(c, response); err != nil {
			return
		}
		Done(c)
	}
}
