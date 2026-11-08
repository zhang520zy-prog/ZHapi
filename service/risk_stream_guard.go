package service

// StreamGuard 流式输出检查器：每个 chunk 写给客户端前 Feed 一次。
// 词可能被切在两个 chunk 之间，所以匹配时拼上上一段末尾
// maxWordLen-1 个字符；不缓冲整段回复。
import (
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

const ctxKeyRiskStreamGuard = "risk_stream_guard"

// FeedStreamGuard 懒建并复用存放在请求上下文的 StreamGuard；开关关闭时返回 nil。
func FeedStreamGuard(c *gin.Context, delta string) *RiskMatchCategory {
	if !setting.ShouldCheckCompletionSensitive() || c == nil {
		return nil
	}
	var guard *StreamGuard
	if value, ok := c.Get(ctxKeyRiskStreamGuard); ok {
		guard, _ = value.(*StreamGuard)
	}
	if guard == nil {
		guard = NewStreamGuard()
		c.Set(ctxKeyRiskStreamGuard, guard)
	}
	return guard.Feed(delta)
}

type StreamGuard struct {
	tail    []rune
	maxKeep int
}

// NewStreamGuard 输出检查关闭时返回 nil，调用方按 nil 跳过检查。
func NewStreamGuard() *StreamGuard {
	if !setting.ShouldCheckCompletionSensitive() {
		return nil
	}
	maxKeep := riskMatcherMaxWordLen() - 1
	if maxKeep < 0 {
		maxKeep = 0
	}
	return &StreamGuard{maxKeep: maxKeep}
}

// Feed 检查本 chunk（拼上上一段尾部）是否命中，返回处置最重的类别。
// 命中返回非 nil；调用方据此决定不写出本 chunk 并终止流。
func (g *StreamGuard) Feed(delta string) *RiskMatchCategory {
	if g == nil || delta == "" {
		return nil
	}
	runes := []rune(delta)
	combined := make([]rune, 0, len(g.tail)+len(runes))
	combined = append(combined, g.tail...)
	combined = append(combined, runes...)
	category := matchRiskCategories(currentRiskMatcher(), string(combined))
	if g.maxKeep > 0 {
		start := len(combined) - g.maxKeep
		if start < 0 {
			start = 0
		}
		g.tail = append([]rune(nil), combined[start:]...)
	}
	return category
}
