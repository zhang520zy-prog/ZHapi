package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// B3.8-2：管理端创建/修改套餐后 currency 固定为 CNY；余额试算返回 quota。
func TestSubscriptionCnyAdminAndQuote(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
	require.NoError(t, db.AutoMigrate(&model.SubscriptionPlan{}, &model.SubscriptionOrder{}, &model.UserSubscription{}, &model.User{}))

	oldPrice := operation_setting.Price
	oldConfirmed := operation_setting.GetPaymentSetting().ComplianceConfirmed
	oldTerms := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	operation_setting.Price = 7.3
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	t.Cleanup(func() {
		operation_setting.Price = oldPrice
		operation_setting.GetPaymentSetting().ComplianceConfirmed = oldConfirmed
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = oldTerms
	})

	router := gin.New()
	router.POST("/admin/plan", AdminCreateSubscriptionPlan)
	router.PUT("/admin/plan/:id", AdminUpdateSubscriptionPlan)
	router.POST("/subscription/quote", SubscriptionRequestQuote)

	// 创建：传入 USD 仍落库 CNY
	out := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/admin/plan",
		strings.NewReader(`{"plan":{"title":"p","price_amount":29,"currency":"USD","duration_unit":"month","duration_value":1,"enabled":true}}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	require.Equal(t, http.StatusOK, out.Code, out.Body.String())
	var plan model.SubscriptionPlan
	require.NoError(t, db.First(&plan).Error)
	assert.Equal(t, "CNY", plan.Currency)
	// GetSubscriptionPlanById 有跨测试的进程内缓存：本测试的 plan id 会
	// 与其他用例冲突，用后主动失效，避免污染后续测试。
	t.Cleanup(func() { model.InvalidateSubscriptionPlanCache(plan.Id) })

	// 修改：传入 USD 仍落库 CNY
	out = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, fmt.Sprintf("/admin/plan/%d", plan.Id),
		strings.NewReader(`{"plan":{"title":"p2","price_amount":39,"currency":"USD","duration_unit":"month","duration_value":1,"enabled":true}}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	require.Equal(t, http.StatusOK, out.Code, out.Body.String())
	require.NoError(t, db.First(&plan, plan.Id).Error)
	assert.Equal(t, "CNY", plan.Currency)
	assert.Equal(t, "p2", plan.Title)

	// 余额试算：返回 quota，且与统一换算一致
	out = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/subscription/quote",
		strings.NewReader(fmt.Sprintf(`{"plan_id":%d,"payment_method":"balance"}`, plan.Id)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	require.Equal(t, http.StatusOK, out.Code, out.Body.String())
	expectedQuota, err := model.SubscriptionCnyToBalanceQuota(39)
	require.NoError(t, err)
	assert.Contains(t, out.Body.String(), fmt.Sprintf(`"quota":%d`, expectedQuota))
	assert.Contains(t, out.Body.String(), `"currency":"CNY"`)

	// Waffo Pancake 试算：快照为换算后的 USD
	out = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/subscription/quote",
		strings.NewReader(fmt.Sprintf(`{"plan_id":%d,"payment_method":"waffo_pancake"}`, plan.Id)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	require.Equal(t, http.StatusOK, out.Code, out.Body.String())
	assert.Contains(t, out.Body.String(), `"currency":"USD"`)

	// Price<=0 时余额试算报错
	operation_setting.Price = 0
	out = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/subscription/quote",
		strings.NewReader(fmt.Sprintf(`{"plan_id":%d,"payment_method":"balance"}`, plan.Id)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	assert.Contains(t, out.Body.String(), `"success":false`)
	operation_setting.Price = 7.3
}
