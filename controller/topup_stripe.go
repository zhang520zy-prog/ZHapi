package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"
	"github.com/thanhpk/randstr"
)

var stripeAdaptor = &StripeAdaptor{}

// StripePayRequest represents a payment request for Stripe checkout.
type StripePayRequest struct {
	// Amount is the quantity of units to purchase.
	Amount int64 `json:"amount"`
	// PaymentMethod specifies the payment method (e.g., "stripe").
	PaymentMethod string `json:"payment_method"`
	// SuccessURL is the optional custom URL to redirect after successful payment.
	// If empty, defaults to the server's console log page.
	SuccessURL string `json:"success_url,omitempty"`
	// CancelURL is the optional custom URL to redirect when payment is canceled.
	// If empty, defaults to the server's console topup page.
	CancelURL string `json:"cancel_url,omitempty"`
}

type StripeAdaptor struct {
}

func (*StripeAdaptor) RequestAmount(c *gin.Context, req *StripePayRequest) {
	if req.Amount < getStripeMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getStripeMinTopup())})
		return
	}
	if req.Amount > 10000 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值数量不能大于 10000"})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	if rejectInvalidCreditedQuota(c, id, getStripeCreditedQuota(req.Amount, group)) {
		return
	}
	payMoney := getStripePayMoney(float64(req.Amount), group)
	if payMoney <= 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func (*StripeAdaptor) RequestPay(c *gin.Context, req *StripePayRequest) {
	if req.PaymentMethod != model.PaymentMethodStripe {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "不支持的支付渠道"})
		return
	}
	if req.Amount < getStripeMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("充值数量不能小于 %d", getStripeMinTopup()), "data": 10})
		return
	}
	if req.Amount > 10000 {
		c.JSON(http.StatusOK, gin.H{"message": "充值数量不能大于 10000", "data": 10})
		return
	}

	if req.SuccessURL != "" && common.ValidateRedirectURL(req.SuccessURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付成功重定向URL不在可信任域名列表中", "data": ""})
		return
	}

	if req.CancelURL != "" && common.ValidateRedirectURL(req.CancelURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付取消重定向URL不在可信任域名列表中", "data": ""})
		return
	}

	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil || user == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "用户不存在"})
		return
	}
	chargedMoney := GetChargedAmount(float64(req.Amount), *user)
	if rejectInvalidCreditedQuota(c, id,
		decimal.NewFromFloat(chargedMoney).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
	) {
		return
	}

	reference := fmt.Sprintf("new-api-ref-%d-%d-%s", user.Id, time.Now().UnixMilli(), randstr.String(4))
	referenceId := "ref_" + common.Sha1([]byte(reference))

	payLink, err := genStripeLink(referenceId, user.StripeCustomer, user.Email, req.Amount, req.SuccessURL, req.CancelURL)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Stripe 创建 Checkout Session 失败 user_id=%d trade_no=%s amount=%d error=%q", id, referenceId, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	topUp := &model.TopUp{
		UserId:          id,
		Amount:          req.Amount,
		Money:           chargedMoney,
		TradeNo:         referenceId,
		PaymentMethod:   model.PaymentMethodStripe,
		PaymentProvider: model.PaymentProviderStripe,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Stripe 创建充值订单失败 user_id=%d trade_no=%s amount=%d error=%q", id, referenceId, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Stripe 充值订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f", id, referenceId, req.Amount, chargedMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_link": payLink,
		},
	})
}

func RequestStripeAmount(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	stripeAdaptor.RequestAmount(c, &req)
}

func RequestStripePay(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	stripeAdaptor.RequestPay(c, &req)
}

func StripeWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	if !isStripeWebhookEnabled() {
		logger.LogWarn(ctx, fmt.Sprintf("Stripe webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.AbortWithStatus(http.StatusForbidden)
		return
	}

	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("Stripe webhook 读取请求体失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	event, err := webhook.ConstructEventWithOptions(payload, signature, setting.StripeWebhookSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})

	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("Stripe webhook 验签失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted, stripe.EventTypeCheckoutSessionExpired,
		stripe.EventTypeCheckoutSessionAsyncPaymentSucceeded, stripe.EventTypeCheckoutSessionAsyncPaymentFailed:
	case stripe.EventTypeChargeRefunded, stripe.EventTypeChargeDisputeCreated, stripe.EventTypeChargeDisputeClosed:
	case stripe.EventTypeInvoicePaid:
	default:
		c.Status(http.StatusOK)
		return
	}
	if event.Livemode != !strings.Contains(setting.StripeApiSecret, "_test_") {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	var paidMinor int64
	amountField := "amount_total"
	if strings.HasPrefix(string(event.Type), "charge.") {
		amountField = "amount"
	}
	if event.Type == stripe.EventTypeInvoicePaid {
		amountField = "amount_paid"
	}
	if raw := event.GetObjectValue(amountField); raw != "" {
		paidMinor, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || paidMinor < 0 {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
	}
	var refundedMinor int64
	if event.Type == stripe.EventTypeChargeRefunded {
		refundedMinor, err = strconv.ParseInt(event.GetObjectValue("amount_refunded"), 10, 64)
		if err != nil || refundedMinor < 0 || refundedMinor > paidMinor {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
	}
	chargeID, disputeID, disputeStatus := "", "", ""
	invoiceID := event.GetObjectValue("invoice")
	if event.Type == stripe.EventTypeInvoicePaid {
		invoiceID = event.GetObjectValue("id")
	}
	if event.Type == stripe.EventTypeChargeRefunded {
		chargeID = event.GetObjectValue("id")
	}
	if event.Type == stripe.EventTypeChargeDisputeCreated || event.Type == stripe.EventTypeChargeDisputeClosed {
		chargeID, disputeID, disputeStatus = event.GetObjectValue("charge"), event.GetObjectValue("id"), event.GetObjectValue("status")
	}
	stored, err := model.RecordPaymentEvent(model.PaymentEventInput{
		Provider: model.PaymentProviderStripe, EventID: event.ID, EventType: string(event.Type),
		TradeNo: event.GetObjectValue("client_reference_id"), SessionID: event.GetObjectValue("id"),
		PaymentIntent: event.GetObjectValue("payment_intent"), CustomerID: event.GetObjectValue("customer"),
		PaidMinor: paidMinor, Currency: event.GetObjectValue("currency"),
		SessionStatus: event.GetObjectValue("status"), PaymentStatus: event.GetObjectValue("payment_status"),
		RefundedMinor: refundedMinor, ChargeID: chargeID, DisputeID: disputeID, DisputeStatus: disputeStatus,
		InvoiceID: invoiceID,
	})
	if err != nil {
		logger.LogError(ctx, "Stripe verified event persistence failed")
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	// ACK is safe only after evidence is durable. A failed fulfillment remains
	// discoverable by the scheduled retry worker and the exception-order UI.
	if err := processStoredPaymentEvent(stored.ID); err != nil {
		logger.LogWarn(ctx, "Stripe event awaits fulfillment retry or financial review")
	}
	c.Status(http.StatusOK)
}

func processStoredPaymentEvent(id int) error {
	event, claimed, err := model.ClaimPaymentEvent(id, common.GetTimestamp())
	if err != nil || !claimed {
		return err
	}
	processErr := fulfillStoredStripeEvent(*event)
	if err := model.FinishPaymentEvent(*event, processErr, false, common.GetTimestamp()); err != nil {
		return err
	}
	// Business failures are durable retry/review outcomes. Only infrastructure
	// failures escape to the worker's system-task failure result.
	return nil
}

func fulfillStoredStripeEvent(event model.PaymentEvent) error {
	if event.EventType == "invoice.paid" {
		return model.AttachVerifiedInvoicePayment(event)
	}
	if strings.HasPrefix(event.EventType, "charge.") {
		return model.ApplyVerifiedPaymentAdjustment(event)
	}
	if event.Provider != model.PaymentProviderStripe || event.TradeNo == "" || event.SessionID == "" {
		return model.ErrPaymentEventInvalid
	}
	LockOrder(event.TradeNo)
	defer UnlockOrder(event.TradeNo)
	switch event.EventType {
	case "checkout.session.completed":
		if event.SessionStatus != "complete" {
			return model.ErrPaymentEventInvalid
		}
		if event.PaymentStatus != "paid" {
			return nil
		} // async confirmation is a distinct event
	case "checkout.session.async_payment_succeeded":
		if event.PaymentStatus != "paid" {
			return model.ErrPaymentEventInvalid
		}
	case "checkout.session.expired", "checkout.session.async_payment_failed":
		status := common.TopUpStatusFailed
		if event.EventType == "checkout.session.expired" {
			if event.SessionStatus != "expired" {
				return model.ErrPaymentEventInvalid
			}
			status = common.TopUpStatusExpired
		}
		err := model.UpdatePendingSubscriptionOrderStatus(event.TradeNo, model.PaymentProviderStripe, status)
		if !errors.Is(err, model.ErrSubscriptionOrderNotFound) {
			return err
		}
		err = model.UpdatePendingTopUpStatus(event.TradeNo, model.PaymentProviderStripe, status)
		if errors.Is(err, model.ErrTopUpStatusInvalid) {
			return nil
		} // late failure cannot regress success
		return err
	default:
		return model.ErrPaymentEventInvalid
	}
	payload, err := common.Marshal(map[string]any{"session_id": event.SessionID, "payment_intent": event.PaymentIntent, "amount_total": event.PaidMinor, "currency": event.Currency, "event_type": event.EventType})
	if err != nil {
		return err
	}
	err = model.CompleteSubscriptionOrder(event.TradeNo, string(payload), model.PaymentProviderStripe, "", "", "", event)
	if !errors.Is(err, model.ErrSubscriptionOrderNotFound) {
		return err
	}
	return model.Recharge(event.TradeNo, event.CustomerID, "", event)
}

// genStripeLink generates a Stripe Checkout session URL for payment.
// It creates a new checkout session with the specified parameters and returns the payment URL.
//
// Parameters:
//   - referenceId: unique reference identifier for the transaction
//   - customerId: existing Stripe customer ID (empty string if new customer)
//   - email: customer email address for new customer creation
//   - amount: quantity of units to purchase
//   - successURL: custom URL to redirect after successful payment (empty for default)
//   - cancelURL: custom URL to redirect when payment is canceled (empty for default)
//
// Returns the checkout session URL or an error if the session creation fails.
func genStripeLink(referenceId string, customerId string, email string, amount int64, successURL string, cancelURL string) (string, error) {
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return "", fmt.Errorf("无效的Stripe API密钥")
	}

	stripe.Key = setting.StripeApiSecret

	// Use custom URLs if provided, otherwise use defaults
	if successURL == "" {
		successURL = paymentReturnPath("/usage-logs")
	}
	if cancelURL == "" {
		cancelURL = paymentReturnPath("/wallet")
	}

	params := &stripe.CheckoutSessionParams{
		ClientReferenceID: stripe.String(referenceId),
		SuccessURL:        stripe.String(successURL),
		CancelURL:         stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(setting.StripePriceId),
				Quantity: stripe.Int64(amount),
			},
		},
		Mode:                stripe.String(string(stripe.CheckoutSessionModePayment)),
		AllowPromotionCodes: stripe.Bool(setting.StripePromotionCodesEnabled),
	}

	if "" == customerId {
		if "" != email {
			params.CustomerEmail = stripe.String(email)
		}

		params.CustomerCreation = stripe.String(string(stripe.CheckoutSessionCustomerCreationAlways))
	} else {
		params.Customer = stripe.String(customerId)
	}

	result, err := session.New(params)
	if err != nil {
		return "", err
	}

	return result.URL, nil
}

func GetChargedAmount(count float64, user model.User) float64 {
	topUpGroupRatio := common.GetTopupGroupRatio(user.Group)
	if topUpGroupRatio == 0 {
		topUpGroupRatio = 1
	}

	return count * topUpGroupRatio
}

func getStripeCreditedQuota(amount int64, group string) decimal.Decimal {
	topUpGroupRatio := common.GetTopupGroupRatio(group)
	if topUpGroupRatio == 0 {
		topUpGroupRatio = 1
	}
	return decimal.NewFromInt(amount).
		Mul(decimal.NewFromFloat(topUpGroupRatio)).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit))
}

func getStripePayMoney(amount float64, group string) float64 {
	originalAmount := amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = amount / common.QuotaPerUnit
	}
	// Using float64 for monetary calculations is acceptable here due to the small amounts involved
	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	// apply optional preset discount by the original request amount (if configured), default 1.0
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(originalAmount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}
	payMoney := amount * setting.StripeUnitPrice * topupGroupRatio * discount
	return payMoney
}

func getStripeMinTopup() int64 {
	minTopup := setting.StripeMinTopUp
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minTopup = minTopup * int(common.QuotaPerUnit)
	}
	return int64(minTopup)
}
