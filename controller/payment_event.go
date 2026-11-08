package controller

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type paymentEventRetryHandler struct{}

func (paymentEventRetryHandler) Type() string { return "payment_event_retry" }
func (paymentEventRetryHandler) Enabled() bool {
	return model.HasDuePaymentEvents(common.GetTimestamp())
}
func (paymentEventRetryHandler) Interval() time.Duration { return 30 * time.Second }
func (paymentEventRetryHandler) NewPayload() any         { return nil }
func (paymentEventRetryHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	events, err := model.DuePaymentEvents(common.GetTimestamp(), 50)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	processed := 0
	for _, event := range events {
		if ctx.Err() != nil {
			finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, ctx.Err())
			return
		}
		if err := processStoredPaymentEvent(event.ID); err != nil {
			finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, map[string]int{"processed": processed}, errors.New("Payment retry persistence unavailable"))
			return
		}
		processed++
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, map[string]int{"processed": processed}, nil)
}

func GetPaymentEvents(c *gin.Context) {
	page := common.GetPageQuery(c)
	events, total, err := model.ListPaymentEvents(c.Query("status"), c.Query("trade_no"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, errors.New("Failed to load payment events"))
		return
	}
	page.SetTotal(int(total))
	page.SetItems(events)
	common.ApiSuccess(c, page)
}

func RetryPaymentEvent(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "Invalid payment event"})
		return
	}
	var input struct {
		ExpectedVersion int    `json:"expected_version"`
		Reason          string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.ExpectedVersion <= 0 || strings.TrimSpace(input.Reason) == "" || len([]rune(input.Reason)) > 1000 {
		c.JSON(400, gin.H{"success": false, "message": "A reason and current record version are required"})
		return
	}
	if err := model.RetryPaymentEvent(id, input.ExpectedVersion, c.GetInt("id"), input.Reason); err != nil {
		if errors.Is(err, model.ErrPaymentEventConflict) {
			c.JSON(409, gin.H{"success": false, "message": "Payment record changed; refresh before retrying"})
			return
		}
		if errors.Is(err, model.ErrPaymentEventInvalid) {
			c.JSON(400, gin.H{"success": false, "message": "Invalid payment event"})
			return
		}
		c.JSON(503, gin.H{"success": false, "message": "Payment retry persistence unavailable"})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "message": "Retry queued", "data": gin.H{"status": "retry"}})
}

func GetPaymentEventDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "Invalid payment event"})
		return
	}
	event, err := model.GetPaymentEvent(id)
	if errors.Is(err, model.ErrPaymentEventInvalid) || errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(404, gin.H{"success": false, "message": "Payment event not found"})
		return
	}
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "Payment history unavailable"})
		return
	}
	page := common.GetPageQuery(c)
	actions, total, err := model.ListPaymentEventActions(id, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "Payment history unavailable"})
		return
	}
	page.SetTotal(int(total))
	page.SetItems(actions)
	receipt, err := model.GetPaymentReceipt(event.PaymentReceiptID)
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "Payment history unavailable"})
		return
	}
	common.ApiSuccess(c, gin.H{"event": event, "history": page, "receipt": receipt})
}

func ReviewPaymentFinancialEvent(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "Invalid payment event"})
		return
	}
	var input struct {
		ExpectedVersion int    `json:"expected_version"`
		Reason          string `json:"reason"`
		Action          string `json:"action"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid financial review"})
		return
	}
	err = model.ResolvePaymentFinancialEvent(id, input.ExpectedVersion, c.GetInt("id"), input.Reason, input.Action)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrPaymentEventConflict):
			c.JSON(409, gin.H{"success": false, "message": "Payment record changed; refresh before retrying"})
		case errors.Is(err, model.ErrPaymentEventInvalid):
			c.JSON(400, gin.H{"success": false, "message": "A reason and valid financial decision are required"})
		case errors.Is(err, model.ErrPaymentFinancialReview), errors.Is(err, model.ErrPaymentInsufficientBalance), errors.Is(err, model.ErrPaymentEntitlementReview):
			c.JSON(422, gin.H{"success": false, "message": "Payment evidence or available balance does not support this decision"})
		default:
			c.JSON(503, gin.H{"success": false, "message": "Payment retry persistence unavailable"})
		}
		return
	}
	common.ApiSuccess(c, nil)
}
