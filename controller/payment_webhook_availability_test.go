package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestPaymentRetryRequiresPermissionAndQueuesImmutableEvidence(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousMaster := model.DB, common.IsMasterNode
	model.DB, common.IsMasterNode = db, true
	t.Cleanup(func() { model.DB, common.IsMasterNode = previousDB, previousMaster; _ = sqlDB.Close() })
	require.NoError(t, model.MigratePaymentEvents())
	require.NoError(t, db.AutoMigrate(&model.CasbinRule{}, &model.AuthzRole{}))
	require.NoError(t, authz.Init(db))
	event, err := model.RecordPaymentEvent(model.PaymentEventInput{Provider: model.PaymentProviderStripe, EventID: "evt_permission", EventType: "checkout.session.completed", TradeNo: "missing-order", SessionID: "cs_verified", PaidMinor: 200, Currency: "usd", PaymentStatus: "paid", SessionStatus: "complete"})
	require.NoError(t, err)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", 9); c.Set("role", common.RoleAdminUser) })
	router.GET("/payment-events/", middleware.RequirePermission(authz.PaymentRead), GetPaymentEvents)
	router.GET("/payment-events/:id", middleware.RequirePermission(authz.PaymentRead), GetPaymentEventDetail)
	router.POST("/payment-events/:id/retry", middleware.RequirePermission(authz.PaymentOperate), RetryPaymentEvent)
	router.POST("/payment-events/:id/review", middleware.RequirePermission(authz.PaymentReview), ReviewPaymentFinancialEvent)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	path := fmt.Sprintf("/payment-events/%d/retry", event.ID)
	body := fmt.Sprintf(`{"expected_version":%d,"reason":"Verified evidence","paid_minor":1,"actor_id":666}`, event.Version)
	assert.Equal(t, 403, request("GET", "/payment-events/", "").Code)
	assert.Equal(t, 403, request("POST", path, body).Code)
	reviewPath := fmt.Sprintf("/payment-events/%d/review", event.ID)
	assert.Equal(t, 403, request("POST", reviewPath, `{"expected_version":1,"reason":"review","action":"waive_recovery"}`).Code)
	require.NoError(t, authz.SetUserPermissions(9, authz.PermissionsMap{authz.ResourcePayment: {"read": true}}))
	assert.Equal(t, 200, request("GET", "/payment-events/", "").Code)
	assert.Equal(t, 200, request("GET", fmt.Sprintf("/payment-events/%d", event.ID), "").Code)
	assert.Equal(t, 403, request("POST", path, body).Code)
	require.NoError(t, authz.SetUserPermissions(9, authz.PermissionsMap{authz.ResourcePayment: {"read": true, "operate": true}}))
	assert.Equal(t, 400, request("POST", path, `{"expected_version":1,"reason":" "}`).Code)
	assert.Equal(t, 202, request("POST", path, body).Code)
	assert.Equal(t, 409, request("POST", path, body).Code)
	require.NoError(t, db.First(event, event.ID).Error)
	assert.Equal(t, "retry", event.Status)
	assert.Zero(t, event.Attempts)
	assert.EqualValues(t, 200, event.PaidMinor)
	var action model.PaymentEventAction
	require.NoError(t, db.First(&action).Error)
	assert.Equal(t, 9, action.ActorID)
	assert.Equal(t, 403, request("POST", reviewPath, `{"expected_version":1,"reason":"review","action":"waive_recovery"}`).Code)
	require.NoError(t, authz.SetUserPermissions(9, authz.PermissionsMap{authz.ResourcePayment: {"read": true, "operate": true, "review": true}}))
	assert.Equal(t, 400, request("POST", reviewPath, `{"expected_version":1,"reason":"","action":"waive_recovery"}`).Code)
	refund, err := model.RecordPaymentEvent(model.PaymentEventInput{Provider: model.PaymentProviderStripe, EventID: "evt_api_refund", EventType: "charge.refunded", PaymentIntent: "pi_api", PaidMinor: 200, RefundedMinor: 100, Currency: "usd"})
	require.NoError(t, err)
	receipt := model.PaymentReceipt{TransactionKey: "api-receipt", Provider: model.PaymentProviderStripe, PaymentIntent: "pi_api", TradeNo: "trade_api", UserID: 123, PaidMinor: 200, Currency: "USD", CreditedQuota: 1000, Version: 1}
	require.NoError(t, db.Create(&receipt).Error)
	require.NoError(t, db.Model(refund).Updates(map[string]any{"status": "needs_review", "payment_receipt_id": receipt.ID}).Error)
	refundPath := fmt.Sprintf("/payment-events/%d/review", refund.ID)
	assert.Equal(t, 409, request("POST", refundPath, `{"expected_version":2,"reason":"stale","action":"waive_recovery"}`).Code)
	assert.Equal(t, 200, request("POST", refundPath, `{"expected_version":1,"reason":"Verified partial refund and waived collection","action":"waive_recovery","actor_id":666,"credited_quota":999999}`).Code)
	assert.Equal(t, 409, request("POST", refundPath, `{"expected_version":1,"reason":"replay","action":"waive_recovery"}`).Code)
	require.NoError(t, db.First(&receipt, receipt.ID).Error)
	assert.Equal(t, 1000, receipt.CreditedQuota)
	assert.Equal(t, 500, receipt.WaivedQuota)
	detail := request("GET", fmt.Sprintf("/payment-events/%d", refund.ID), "")
	assert.Equal(t, 200, detail.Code)
	assert.Contains(t, detail.Body.String(), `"actor_id":9`)
	assert.Contains(t, detail.Body.String(), `"status":"resolved"`)
	for _, hidden := range []string{"event_key", "fingerprint", "transaction_key", "lease_token"} {
		assert.NotContains(t, detail.Body.String(), hidden)
	}
	require.NoError(t, authz.SetUserPermissions(9, authz.PermissionsMap{authz.ResourcePayment: {"read": false, "operate": false, "review": false}}))
	assert.Equal(t, 403, request("GET", fmt.Sprintf("/payment-events/%d", refund.ID), "").Code)
	require.NoError(t, authz.SetUserPermissions(9, authz.PermissionsMap{authz.ResourcePayment: {"read": true, "operate": true, "review": true}}))
	require.NoError(t, db.Migrator().DropTable(&model.PaymentEvent{}))
	assert.Equal(t, 503, request("POST", path, body).Code)
	assert.True(t, (paymentEventRetryHandler{}).Enabled(), "database outages must produce an observable failed worker run")
}

func confirmPaymentComplianceForTest(t *testing.T) {
	t.Helper()
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed := paymentSetting.ComplianceConfirmed
	originalTermsVersion := paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalTermsVersion
	})
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
}

func TestStripeWebhookPersistsVerifiedFailureAndReplaysWithoutDoubleCredit(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousLog, previousRedis := model.DB, model.LOG_DB, common.RedisEnabled
	previousAPI, previousSecret, previousPrice := setting.StripeApiSecret, setting.StripeWebhookSecret, setting.StripePriceId
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	setting.StripeApiSecret, setting.StripeWebhookSecret, setting.StripePriceId = "sk_test_fixture", "whsec_fixture", "price_fixture"
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = previousDB, previousLog, previousRedis
		setting.StripeApiSecret, setting.StripeWebhookSecret, setting.StripePriceId = previousAPI, previousSecret, previousPrice
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}, &model.SubscriptionOrder{}, &model.SubscriptionPlan{}, &model.UserSubscription{},
		&model.DistributorProfile{}, &model.DistributorApplication{}, &model.CommissionRecord{}, &model.CommissionSettlement{}, &model.CommissionDebt{}, &model.DistributorWithdrawal{}, &model.CommissionCampaign{}))
	require.NoError(t, model.MigratePaymentEvents())
	body := `{"id":"evt_fixture","type":"checkout.session.completed","livemode":false,"data":{"object":{"id":"cs_fixture","client_reference_id":"paid-late","status":"complete","payment_status":"paid","amount_total":200,"currency":"usd","payment_intent":"pi_fixture"}}}`
	timestamp := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(setting.StripeWebhookSecret))
	_, err = fmt.Fprintf(mac, "%d.%s", timestamp, body)
	require.NoError(t, err)
	signature := fmt.Sprintf("t=%d,v1=%x", timestamp, mac.Sum(nil))
	call := func(header string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/stripe/webhook", strings.NewReader(body))
		ctx.Request.Header.Set("Stripe-Signature", header)
		StripeWebhook(ctx)
		return recorder
	}
	assert.Equal(t, http.StatusBadRequest, call("invalid").Code)
	assert.Equal(t, http.StatusOK, call(signature).Code)
	rows, total, err := model.ListPaymentEvents("", "paid-late", 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, rows, 1)
	assert.Equal(t, "retry", rows[0].Status)
	user := model.User{Username: "paid-user", Quota: 7}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&model.TopUp{UserId: user.Id, TradeNo: "paid-late", Money: 2, Amount: 2, PaymentProvider: model.PaymentProviderStripe, PaymentMethod: model.PaymentMethodStripe, Status: common.TopUpStatusPending}).Error)
	require.NoError(t, db.Model(&model.PaymentEvent{}).Where("id = ?", rows[0].ID).Update("next_attempt_at", 0).Error)
	require.NoError(t, processStoredPaymentEvent(rows[0].ID))
	assert.Equal(t, http.StatusOK, call(signature).Code)
	require.NoError(t, db.First(&user, user.Id).Error)
	assert.Equal(t, 7+int(2*common.QuotaPerUnit), user.Quota)
	rows, _, err = model.ListPaymentEvents("", "paid-late", 0, 20)
	require.NoError(t, err)
	assert.Equal(t, "succeeded", rows[0].Status)
	// Stripe reports the cumulative refunded minor units. A duplicate event or
	// an older cumulative signal must never reverse wallet credit twice.
	body = `{"id":"evt_refund_half","type":"charge.refunded","livemode":false,"data":{"object":{"id":"ch_fixture","payment_intent":"pi_fixture","amount":200,"amount_refunded":100,"currency":"usd"}}}`
	mac = hmac.New(sha256.New, []byte(setting.StripeWebhookSecret))
	_, err = fmt.Fprintf(mac, "%d.%s", timestamp, body)
	require.NoError(t, err)
	signature = fmt.Sprintf("t=%d,v1=%x", timestamp, mac.Sum(nil))
	assert.Equal(t, http.StatusOK, call(signature).Code)
	assert.Equal(t, http.StatusOK, call(signature).Code)
	require.NoError(t, db.First(&user, user.Id).Error)
	assert.Equal(t, 7+int(common.QuotaPerUnit), user.Quota, "a verified partial refund reverses the corresponding original credit exactly once")
	require.NoError(t, db.Migrator().DropTable(&model.PaymentEvent{}))
	assert.Equal(t, http.StatusServiceUnavailable, call(signature).Code, "a failure to persist verified evidence must not be ACKed")
}

func TestStripeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPISecret := setting.StripeApiSecret
	originalWebhookSecret := setting.StripeWebhookSecret
	originalPriceID := setting.StripePriceId
	t.Cleanup(func() {
		setting.StripeApiSecret = originalAPISecret
		setting.StripeWebhookSecret = originalWebhookSecret
		setting.StripePriceId = originalPriceID
	})

	setting.StripeWebhookSecret = ""
	setting.StripeApiSecret = "sk_test_123"
	setting.StripePriceId = "price_123"
	require.False(t, isStripeWebhookEnabled())

	setting.StripeWebhookSecret = "whsec_test"
	require.True(t, isStripeWebhookEnabled())

	setting.StripePriceId = ""
	require.False(t, isStripeWebhookEnabled())
}

func TestCreemWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPIKey := setting.CreemApiKey
	originalProducts := setting.CreemProducts
	originalWebhookSecret := setting.CreemWebhookSecret
	t.Cleanup(func() {
		setting.CreemApiKey = originalAPIKey
		setting.CreemProducts = originalProducts
		setting.CreemWebhookSecret = originalWebhookSecret
	})

	setting.CreemWebhookSecret = ""
	setting.CreemApiKey = "creem_api_key"
	setting.CreemProducts = `[{"productId":"prod_123"}]`
	require.False(t, isCreemWebhookEnabled())

	setting.CreemWebhookSecret = "creem_secret"
	require.True(t, isCreemWebhookEnabled())

	setting.CreemProducts = "[]"
	require.False(t, isCreemWebhookEnabled())
}

func TestWaffoWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalEnabled := setting.WaffoEnabled
	originalSandbox := setting.WaffoSandbox
	originalAPIKey := setting.WaffoApiKey
	originalPrivateKey := setting.WaffoPrivateKey
	originalPublicCert := setting.WaffoPublicCert
	originalSandboxAPIKey := setting.WaffoSandboxApiKey
	originalSandboxPrivateKey := setting.WaffoSandboxPrivateKey
	originalSandboxPublicCert := setting.WaffoSandboxPublicCert
	t.Cleanup(func() {
		setting.WaffoEnabled = originalEnabled
		setting.WaffoSandbox = originalSandbox
		setting.WaffoApiKey = originalAPIKey
		setting.WaffoPrivateKey = originalPrivateKey
		setting.WaffoPublicCert = originalPublicCert
		setting.WaffoSandboxApiKey = originalSandboxAPIKey
		setting.WaffoSandboxPrivateKey = originalSandboxPrivateKey
		setting.WaffoSandboxPublicCert = originalSandboxPublicCert
	})

	setting.WaffoEnabled = true
	setting.WaffoSandbox = false
	setting.WaffoApiKey = ""
	setting.WaffoPrivateKey = "private"
	setting.WaffoPublicCert = "public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoApiKey = "api"
	require.True(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = false
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = true
	setting.WaffoSandbox = true
	setting.WaffoSandboxApiKey = ""
	setting.WaffoSandboxPrivateKey = "sandbox_private"
	setting.WaffoSandboxPublicCert = "sandbox_public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoSandboxApiKey = "sandbox_api"
	require.True(t, isWaffoWebhookEnabled())
}

func TestWaffoPancakeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalMerchantID := setting.WaffoPancakeMerchantID
	originalPrivateKey := setting.WaffoPancakePrivateKey
	originalProductID := setting.WaffoPancakeProductID
	t.Cleanup(func() {
		setting.WaffoPancakeMerchantID = originalMerchantID
		setting.WaffoPancakePrivateKey = originalPrivateKey
		setting.WaffoPancakeProductID = originalProductID
	})

	// Presence of all three credentials enables the gateway. Webhook public
	// keys are bundled in the SDK and there is no separate Enabled toggle —
	// clear any of the three fields to disable.
	setting.WaffoPancakeMerchantID = ""
	setting.WaffoPancakePrivateKey = "private"
	setting.WaffoPancakeProductID = "product"
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeMerchantID = "merchant"
	require.True(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = ""
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = "product"
	setting.WaffoPancakePrivateKey = ""
	require.False(t, isWaffoPancakeWebhookEnabled())
}

func TestEpayWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
	})

	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay_id"
	operation_setting.EpayKey = ""
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
	require.False(t, isEpayWebhookEnabled())

	operation_setting.EpayKey = "epay_key"
	require.True(t, isEpayWebhookEnabled())

	operation_setting.PayMethods = nil
	require.False(t, isEpayWebhookEnabled())
}
