package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// B3.8-2：套餐价按人民币理解后的统一换算。汇率用 operation_setting.Price。
func TestSubscriptionCnyConversions(t *testing.T) {
	oldPrice := operation_setting.Price
	oldQuotaPerUnit := common.QuotaPerUnit
	oldUnit := setting.WaffoPancakeUnitPrice
	operation_setting.Price = 7.3
	common.QuotaPerUnit = 500000
	setting.WaffoPancakeUnitPrice = 1.0
	t.Cleanup(func() {
		operation_setting.Price = oldPrice
		common.QuotaPerUnit = oldQuotaPerUnit
		setting.WaffoPancakeUnitPrice = oldUnit
	})

	// 29 元 ÷ 7.3 × 500000 = 1986301.369… → ceil 1986302
	quota, err := SubscriptionCnyToBalanceQuota(29)
	require.NoError(t, err)
	assert.Equal(t, 1986302, quota)

	// 29 元 ÷ 7.3 × 1.0 = 3.9726… → round 3.97 美元
	usd, err := SubscriptionCnyToWaffoUsd(29)
	require.NoError(t, err)
	assert.Equal(t, "3.97", usd.StringFixed(2))

	// Price <= 0 报错，不下单
	operation_setting.Price = 0
	_, err = SubscriptionCnyToBalanceQuota(29)
	assert.Error(t, err)
	_, err = SubscriptionCnyToWaffoUsd(29)
	assert.Error(t, err)
	operation_setting.Price = -1
	_, err = SubscriptionCnyToBalanceQuota(29)
	assert.Error(t, err)
	operation_setting.Price = 7.3

	// 免费套餐不报错
	quota, err = SubscriptionCnyToBalanceQuota(0)
	require.NoError(t, err)
	assert.Equal(t, 0, quota)
	usd, err = SubscriptionCnyToWaffoUsd(0)
	require.NoError(t, err)
	assert.True(t, usd.IsZero())
}

// subscriptionCnyScenario 余额购买实际扣费 = 换算结果；订单快照 CNY、fee=0。
func subscriptionCnyScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	require.NoError(t, DB.AutoMigrate(&UserSubscription{}))
	oldPrice := operation_setting.Price
	operation_setting.Price = 7.3
	t.Cleanup(func() { operation_setting.Price = oldPrice })

	u := f.makeUser("cny_user", 0)
	plan := &SubscriptionPlan{Title: "CNY plan", PriceAmount: 29, Currency: "CNY",
		DurationUnit: SubscriptionDurationMonth, DurationValue: 1,
		Enabled: true, TotalAmount: 100, AllowBalancePay: common.GetPointer(true)}
	require.NoError(t, f.db.Create(plan).Error)
	// GetSubscriptionPlanById 有进程内缓存且各用例 plan id 会撞车：先失效
	// 再购买，保证读到本夹具的套餐。
	InvalidateSubscriptionPlanCache(plan.Id)
	t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })

	expectedQuota, err := SubscriptionCnyToBalanceQuota(29)
	require.NoError(t, err)
	require.Greater(t, expectedQuota, 0)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).
		Update("quota", int64(expectedQuota)).Error)

	require.NoError(t, PurchaseSubscriptionWithBalance(u.Id, plan.Id))

	var user User
	require.NoError(t, f.db.First(&user, u.Id).Error)
	assert.Equal(t, 0, user.Quota, "实际扣除额度须等于试算 quota")

	var order SubscriptionOrder
	require.NoError(t, f.db.First(&order, "user_id = ?", u.Id).Error)
	assert.Equal(t, "CNY", order.Currency)
	assert.Equal(t, "29", order.CreditedMoney.String())
	assert.True(t, order.FeeMoney.IsZero())
	assert.Equal(t, 0, order.FeeRateBps)

	// 余额不足拒绝且不改订单数
	assert.Error(t, PurchaseSubscriptionWithBalance(u.Id, plan.Id))

	// Price<=0：有钱也下不了单
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).
		Update("quota", int64(1_000_000_000)).Error)
	operation_setting.Price = 0
	assert.Error(t, PurchaseSubscriptionWithBalance(u.Id, plan.Id))
	operation_setting.Price = 7.3
	count := int64(0)
	require.NoError(t, f.db.Model(&SubscriptionOrder{}).Where("user_id = ?", u.Id).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

// subscriptionCnyInvoiceScenario 开票额度口径：epay CNY 订阅计入；
// Waffo USD 与余额订阅不计入（沿用线 B 规则）。
func subscriptionCnyInvoiceScenario(f *commissionFixture, t *testing.T) {
	withInvoiceTables(t)
	u := f.makeUser("cny_inv", 0)
	now := common.GetTimestamp()

	mkSub := func(provider, method, currency, trade string, credited float64) {
		require.NoError(t, f.db.Create(&SubscriptionOrder{
			UserId: u.Id, PlanId: 1, Money: credited, TradeNo: trade,
			PaymentProvider: provider, PaymentMethod: method,
			Status: common.TopUpStatusSuccess, Currency: currency,
			CreditedMoney: decimal.NewFromFloat(credited),
			CreateTime:    now, CompleteTime: now,
		}).Error)
	}
	mkSub(PaymentProviderEpay, "alipay", "CNY", "epay_cny", 29)
	mkSub(PaymentProviderWaffoPancake, "waffo_pancake", "USD", "waffo_usd", 3.97)
	mkSub(PaymentProviderBalance, PaymentMethodBalance, "CNY", "bal_cny", 29)

	received, _, available, err := InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.Equal(t, "29.00", received.StringFixed(2))
	assert.Equal(t, "29.00", available.StringFixed(2))
}

// subscriptionCnyLegacyUsdScenario 现站迁移套餐 currency=USD：余额购买
// 的快照仍固定 CNY（W-1），不读 plan.Currency。
func subscriptionCnyLegacyUsdScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	require.NoError(t, DB.AutoMigrate(&UserSubscription{}))
	oldPrice := operation_setting.Price
	operation_setting.Price = 7.3
	t.Cleanup(func() { operation_setting.Price = oldPrice })

	u := f.makeUser("legacy_usd", 0)
	plan := &SubscriptionPlan{Title: "legacy USD plan", PriceAmount: 9.99, Currency: "USD",
		DurationUnit: SubscriptionDurationMonth, DurationValue: 1,
		Enabled: true, TotalAmount: 100, AllowBalancePay: common.GetPointer(true)}
	require.NoError(t, f.db.Create(plan).Error)
	InvalidateSubscriptionPlanCache(plan.Id)
	t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })

	expectedQuota, err := SubscriptionCnyToBalanceQuota(9.99)
	require.NoError(t, err)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).
		Update("quota", int64(expectedQuota)).Error)

	require.NoError(t, PurchaseSubscriptionWithBalance(u.Id, plan.Id))

	var order SubscriptionOrder
	require.NoError(t, f.db.First(&order, "user_id = ?", u.Id).Error)
	assert.Equal(t, "CNY", order.Currency)
	assert.Equal(t, "9.99", order.CreditedMoney.String())
}

func TestSubscriptionCnyDatabaseMatrix(t *testing.T) {
	// PurchaseSubscriptionWithBalance 内的 getDBTimestampTx 按主库方言分支，
	// commissionFixture 不设置该值，这里补齐并复原。
	prevMain, prevLog := common.MainDatabaseType(), common.LogDatabaseType()
	t.Cleanup(func() { common.SetDatabaseTypes(prevMain, prevLog) })
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect+"/balance_charge", func(t *testing.T) {
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			f := newCommissionFixture(t, dialect)
			subscriptionCnyScenario(f, t)
		})
		t.Run(dialect+"/legacy_usd_snapshot", func(t *testing.T) {
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			f := newCommissionFixture(t, dialect)
			subscriptionCnyLegacyUsdScenario(f, t)
		})
		t.Run(dialect+"/invoiceable", func(t *testing.T) {
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			f := newCommissionFixture(t, dialect)
			subscriptionCnyInvoiceScenario(f, t)
		})
	}
}
