package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// W-3：Creem 商品币种仅支持 EUR/USD，无法按人民币定价——订阅下单与试算
// 两处入口均拒绝 creem，且不落订单。
func TestCreemSubscriptionRejectedDatabaseMatrix(t *testing.T) {
	originalConfirmed := operation_setting.GetPaymentSetting().ComplianceConfirmed
	originalTermsVersion := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	originalTestMode := setting.CreemTestMode
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	setting.CreemTestMode = true
	t.Cleanup(func() {
		operation_setting.GetPaymentSetting().ComplianceConfirmed = originalConfirmed
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = originalTermsVersion
		setting.CreemTestMode = originalTestMode
	})

	for _, dialect := range []common.DatabaseType{common.DatabaseTypeSQLite, common.DatabaseTypeMySQL, common.DatabaseTypePostgreSQL} {
		t.Run(string(dialect), func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case common.DatabaseTypeSQLite:
				driver = sqlite.Open(":memory:")
			case common.DatabaseTypeMySQL:
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case common.DatabaseTypePostgreSQL:
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("creem_sub_%d_", time.Now().UnixNano())}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == common.DatabaseTypeSQLite {
				sqlDB.SetMaxOpenConns(1)
			}
			previousDB, previousLog, previousRedis := model.DB, model.LOG_DB, common.RedisEnabled
			previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
			common.SetDatabaseTypes(dialect, dialect)
			t.Cleanup(func() {
				model.DB, model.LOG_DB, common.RedisEnabled = previousDB, previousLog, previousRedis
				common.SetDatabaseTypes(previousMainType, previousLogType)
				_ = db.Migrator().DropTable(&model.PaymentEventAction{}, &model.PaymentEvent{}, &model.PaymentReceipt{}, &model.SubscriptionOrder{}, &model.UserSubscription{}, &model.SubscriptionPlan{}, &model.TopUp{}, &model.Log{}, &model.User{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}, &model.SubscriptionOrder{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
			require.NoError(t, model.MigratePaymentEvents())

			user := model.User{Username: "creem-sub-user", Password: "preserved", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&user).Error)
			plan := model.SubscriptionPlan{Title: "CNY plan", PriceAmount: 10, Currency: "CNY", DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 100, CreemProductId: "prod_test"}
			require.NoError(t, db.Create(&plan).Error)

			router := gin.New()
			router.Use(func(c *gin.Context) {
				id, _ := strconv.Atoi(c.GetHeader("X-Test-User"))
				c.Set("id", id)
			})
			router.POST("/subscription/creem", SubscriptionRequestCreemPay)
			router.POST("/subscription/quote", SubscriptionRequestQuote)
			request := func(path, body string) *httptest.ResponseRecorder {
				req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Test-User", strconv.Itoa(user.Id))
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				return out
			}

			out := request("/subscription/creem", fmt.Sprintf(`{"plan_id":%d}`, plan.Id))
			assert.Contains(t, out.Body.String(), "Creem 暂不支持订阅支付")
			count := int64(0)
			require.NoError(t, db.Model(&model.SubscriptionOrder{}).Where("user_id = ?", user.Id).Count(&count).Error)
			assert.Equal(t, int64(0), count)

			out = request("/subscription/quote", fmt.Sprintf(`{"plan_id":%d,"payment_method":"creem"}`, plan.Id))
			assert.Contains(t, out.Body.String(), "Creem 暂不支持订阅支付")
		})
	}
}
