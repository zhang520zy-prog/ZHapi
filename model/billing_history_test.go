package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withBillingTables 补建账单合并视图需要的订阅/发票表。
func withBillingTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&SubscriptionPlan{}, &SubscriptionOrder{}, &InvoiceRequest{}))
}

func billingPage(page, size int) *common.PageInfo {
	return &common.PageInfo{Page: page, PageSize: size}
}

// billingScenario 覆盖来源合并、排序、分页、kind/keyword 过滤、用户隔离。
func billingScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_user", 0)
	other := f.makeUser("bill_other", 0)
	now := common.GetTimestamp()

	mkTopUp := func(userId int, provider, method, status, trade string, createTime int64) *TopUp {
		tu := &TopUp{UserId: userId, Amount: 10, Money: 10.0, TradeNo: trade,
			PaymentProvider: provider, PaymentMethod: method, Status: status,
			Currency: "CNY", CreditedMoney: decimal.NewFromFloat(9.9), FeeMoney: decimal.NewFromFloat(0.1),
			CreateTime: createTime, CompleteTime: createTime}
		require.NoError(t, f.db.Create(tu).Error)
		return tu
	}
	mkSub := func(userId int, provider, method, status, trade string, createTime int64) *SubscriptionOrder {
		o := &SubscriptionOrder{UserId: userId, PlanId: 0, Money: 20.0, TradeNo: trade,
			PaymentProvider: provider, PaymentMethod: method, Status: status,
			Currency: "CNY", CreateTime: createTime, CompleteTime: createTime}
		require.NoError(t, f.db.Create(o).Error)
		return o
	}

	// 三个来源交错时间：sub(now-1) > topup(now-2) > fee(now-3)
	mkSub(u.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, "sub_a", now-1)
	mkTopUp(u.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, "tu_a", now-2)
	mkTopUp(u.Id, PaymentProviderBalance, "invoice_fee", common.TopUpStatusSuccess, "fee_a", now-3)
	// 订阅镜像 top_up 行：trade_no 相同，必须被排除
	mkTopUp(u.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, "sub_a", now-1)
	// 他人订单不出现
	mkTopUp(other.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, "tu_x", now-1)
	mkSub(other.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, "sub_x", now-1)

	// kind=all：3 条（镜像行排除），顺序按 create_time DESC
	entries, total, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	require.Len(t, entries, 3)
	assert.Equal(t, BillingKindSubscription, entries[0].Kind)
	assert.Equal(t, "sub_a", entries[0].TradeNo)
	assert.Equal(t, BillingKindTopup, entries[1].Kind)
	assert.Equal(t, "tu_a", entries[1].TradeNo)
	assert.Equal(t, BillingKindInvoiceFee, entries[2].Kind)
	assert.Equal(t, "fee_a", entries[2].TradeNo)

	// kind=topup：只 tu_a；invoice_fee 行与镜像行都不出现
	entries, total, err = GetUserBillingEntries(u.Id, BillingKindTopup, "", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, entries, 1)
	assert.Equal(t, "tu_a", entries[0].TradeNo)

	// kind=subscription
	entries, total, err = GetUserBillingEntries(u.Id, BillingKindSubscription, "", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "sub_a", entries[0].TradeNo)

	// kind=invoice_fee：top_ups 里的 invoice_fee 行
	entries, total, err = GetUserBillingEntries(u.Id, BillingKindInvoiceFee, "", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "fee_a", entries[0].TradeNo)

	// keyword 精确匹配 trade_no（与 SearchUserTopUps 同一约定）
	entries, total, err = GetUserBillingEntries(u.Id, BillingKindAll, "tu_a", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "tu_a", entries[0].TradeNo)

	// % 模糊匹配
	entries, total, err = GetUserBillingEntries(u.Id, BillingKindAll, "sub%", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "sub_a", entries[0].TradeNo)

	// 非法 kind 报错
	_, _, err = GetUserBillingEntries(u.Id, "bogus", "", billingPage(1, 10))
	assert.Error(t, err)
}

// billingPaginationScenario 跨来源合并后的分页窗口与 tie-break。
func billingPaginationScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_pg", 0)
	now := common.GetTimestamp()

	// 6 条：3 topup + 3 sub，同一 create_time → id DESC
	for i := range 3 {
		require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 1, Money: 1.0,
			TradeNo: fmt.Sprintf("tu_pg_%d", i), PaymentProvider: PaymentProviderEpay,
			Status: common.TopUpStatusSuccess, Currency: "CNY",
			CreateTime: now, CompleteTime: now}).Error)
		require.NoError(t, f.db.Create(&SubscriptionOrder{UserId: u.Id, PlanId: 0, Money: 1.0,
			TradeNo: fmt.Sprintf("sub_pg_%d", i), PaymentProvider: PaymentProviderEpay,
			Status: common.TopUpStatusSuccess, Currency: "CNY",
			CreateTime: now, CompleteTime: now}).Error)
	}

	page1, total, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(1, 4))
	require.NoError(t, err)
	assert.Equal(t, int64(6), total)
	require.Len(t, page1, 4)

	page2, _, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(2, 4))
	require.NoError(t, err)
	require.Len(t, page2, 2)

	// 无重叠：合计 6 个 trade_no 互不重复
	seen := map[string]bool{}
	for _, e := range append(page1, page2...) {
		assert.False(t, seen[e.TradeNo], "duplicate %s", e.TradeNo)
		seen[e.TradeNo] = true
	}
	assert.Len(t, seen, 6)

	// 越界页返回空列表
	page3, total, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(3, 4))
	require.NoError(t, err)
	assert.Equal(t, int64(6), total)
	assert.Empty(t, page3)
}

// billingMoneyScenario 金额映射：快照金额、老订单（currency=”）fee=null、JPY 零小数位。
func billingMoneyScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_money", 0)
	now := common.GetTimestamp()

	// CNY 快照：credited 9.90 + fee 0.10 = total 10.00
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 10, Money: 10.0,
		TradeNo: "snap_cny", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreditedMoney: decimal.NewFromFloat(9.9), FeeMoney: decimal.NewFromFloat(0.1),
		FeeRateBps: 100, CreateTime: now, CompleteTime: now}).Error)
	// 老订单：currency 空、无快照 → fee=null，credited/total 用 money
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 5, Money: 5.0,
		TradeNo: "legacy", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		CreateTime: now - 1, CompleteTime: now - 1}).Error)
	// JPY 零小数位：credited 1000 + fee 30 → "1030"
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 1030, Money: 1030.0,
		TradeNo: "jpy", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess,
		Currency: "JPY", CreditedMoney: decimal.NewFromInt(1000), FeeMoney: decimal.NewFromInt(30),
		CreateTime: now - 2, CompleteTime: now - 2}).Error)

	entries, _, err := GetUserBillingEntries(u.Id, BillingKindTopup, "", billingPage(1, 10))
	require.NoError(t, err)
	require.Len(t, entries, 3)

	assert.Equal(t, "snap_cny", entries[0].TradeNo)
	assert.Equal(t, "9.90", entries[0].CreditedMoney)
	require.NotNil(t, entries[0].FeeMoney)
	assert.Equal(t, "0.10", *entries[0].FeeMoney)
	assert.Equal(t, "10.00", entries[0].TotalMoney)
	assert.Equal(t, 100, entries[0].FeeRateBps)
	assert.Equal(t, "CNY", entries[0].Currency)

	assert.Equal(t, "legacy", entries[1].TradeNo)
	assert.Nil(t, entries[1].FeeMoney)
	assert.Equal(t, "5.00", entries[1].CreditedMoney)
	assert.Equal(t, "5.00", entries[1].TotalMoney)

	assert.Equal(t, "jpy", entries[2].TradeNo)
	assert.Equal(t, "1000", entries[2].CreditedMoney)
	require.NotNil(t, entries[2].FeeMoney)
	assert.Equal(t, "30", *entries[2].FeeMoney)
	assert.Equal(t, "1030", entries[2].TotalMoney)
}

// billingQuotaScenario quota 映射：epay=Amount×QuotaPerUnit、stripe=Money×QuotaPerUnit、
// 余额订阅=charged_quota、invoice_fee=null。
func billingQuotaScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_quota", 0)
	now := common.GetTimestamp()
	// fixture 已设 common.QuotaPerUnit = 500000

	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 10, Money: 10.0,
		TradeNo: "q_epay", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: now, CompleteTime: now}).Error)
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 0, Money: 7.0,
		TradeNo: "q_stripe", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess,
		Currency: "USD", CreateTime: now - 1, CompleteTime: now - 1}).Error)
	require.NoError(t, f.db.Create(&SubscriptionOrder{UserId: u.Id, PlanId: 0, Money: 0,
		TradeNo: "q_bal", PaymentProvider: PaymentProviderBalance, PaymentMethod: PaymentMethodBalance,
		ProviderPayload: "charged_quota=7500000", Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: now - 2, CompleteTime: now - 2}).Error)
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 1, Money: 1.0,
		TradeNo: "q_fee", PaymentProvider: PaymentProviderBalance, PaymentMethod: "invoice_fee",
		Status: common.TopUpStatusSuccess, Currency: "CNY", CreateTime: now - 3, CompleteTime: now - 3}).Error)

	entries, _, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(1, 10))
	require.NoError(t, err)
	require.Len(t, entries, 4)

	// epay: 10 × 500000 = 5000000
	require.NotNil(t, entries[0].Quota)
	assert.Equal(t, int64(5000000), *entries[0].Quota)
	// stripe: 7.0 × 500000 = 3500000
	require.NotNil(t, entries[1].Quota)
	assert.Equal(t, int64(3500000), *entries[1].Quota)
	// balance subscription: charged_quota payload 原值
	require.NotNil(t, entries[2].Quota)
	assert.Equal(t, int64(7500000), *entries[2].Quota)
	// invoice_fee：不产生 quota
	assert.Nil(t, entries[3].Quota)
}

// billingInvoiceFeeScenario 发票手续费并集：top_ups invoice_fee 行 +
// invoice_requests 余额结算已扣费行；直连结算与未扣费不出现。
func billingInvoiceFeeScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_inv", 0)
	now := common.GetTimestamp()

	mkInv := func(settlement, trade string, feePaidAt int64, createTime int64) {
		require.NoError(t, f.db.Create(&InvoiceRequest{
			UserId: u.Id, Settlement: settlement, TradeNo: trade,
			FeeCny: "3.00", FeeRateBps: 300, FeePaidAt: feePaidAt,
			Status: InvoiceStatusIssued, CreatedAt: createTime, UpdatedAt: createTime,
		}).Error)
	}
	mkInv(InvoiceSettlementBalance, "inv_paid", now-10, now-10)
	mkInv(InvoiceSettlementBalance, "inv_unpaid", 0, now-11) // 未扣费
	mkInv(InvoiceSettlementDirect, "inv_direct", now-12, now-12)
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 3, Money: 3.0,
		TradeNo: "fee_row", PaymentProvider: PaymentProviderBalance, PaymentMethod: "invoice_fee",
		Status: common.TopUpStatusSuccess, Currency: "CNY", CreateTime: now - 9, CompleteTime: now - 9}).Error)

	entries, total, err := GetUserBillingEntries(u.Id, BillingKindInvoiceFee, "", billingPage(1, 10))
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, entries, 2)
	assert.Equal(t, "fee_row", entries[0].TradeNo)
	assert.Equal(t, "inv_paid", entries[1].TradeNo)

	// invoice_requests 行：币种 CNY、provider/method=balance、fee=FeeCny、quota=null
	e := entries[1]
	assert.Equal(t, "CNY", e.Currency)
	assert.Equal(t, PaymentProviderBalance, e.PaymentProvider)
	assert.Equal(t, PaymentMethodBalance, e.PaymentMethod)
	require.NotNil(t, e.FeeMoney)
	assert.Equal(t, "3.00", *e.FeeMoney)
	assert.Equal(t, "3.00", e.TotalMoney)
	assert.Equal(t, "0.00", e.CreditedMoney)
	assert.Nil(t, e.Quota)
	assert.Equal(t, now-10, e.CompleteTime)
}

// billingCutoffAndTitleScenario top_ups/invoice_requests 30 天窗口、
// 订阅订单不受窗口限制、套餐被删 title 为空、套餐名批量解析。
func billingCutoffAndTitleScenario(f *commissionFixture, t *testing.T) {
	withBillingTables(t)
	u := f.makeUser("bill_cut", 0)
	now := common.GetTimestamp()
	old := now - 31*24*3600

	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 1, Money: 1.0,
		TradeNo: "tu_old", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: old, CompleteTime: old}).Error)
	require.NoError(t, f.db.Create(&TopUp{UserId: u.Id, Amount: 1, Money: 1.0,
		TradeNo: "tu_new", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: now, CompleteTime: now}).Error)
	require.NoError(t, f.db.Create(&InvoiceRequest{UserId: u.Id, Settlement: InvoiceSettlementBalance,
		TradeNo: "inv_old", FeeCny: "1.00", FeePaidAt: old, Status: InvoiceStatusIssued,
		CreatedAt: old, UpdatedAt: old}).Error)

	plan := &SubscriptionPlan{Title: "月度套餐", PriceAmount: 20, Currency: "CNY", DurationUnit: "month", DurationValue: 1}
	require.NoError(t, f.db.Create(plan).Error)
	require.NoError(t, f.db.Create(&SubscriptionOrder{UserId: u.Id, PlanId: plan.Id, Money: 20.0,
		TradeNo: "sub_old", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: old, CompleteTime: old}).Error)
	require.NoError(t, f.db.Create(&SubscriptionOrder{UserId: u.Id, PlanId: 99999, Money: 20.0,
		TradeNo: "sub_deleted", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		Currency: "CNY", CreateTime: now + 1, CompleteTime: now + 1}).Error)

	entries, total, err := GetUserBillingEntries(u.Id, BillingKindAll, "", billingPage(1, 10))
	require.NoError(t, err)
	// 3 条：tu_new + 两条 sub（sub_old 不受窗口限制；tu_old/inv_old 被窗口排除）
	assert.Equal(t, int64(3), total)
	require.Len(t, entries, 3)
	assert.Equal(t, "sub_deleted", entries[0].TradeNo)
	assert.Equal(t, "", entries[0].Title) // 套餐已删 → 空
	assert.Equal(t, "tu_new", entries[1].TradeNo)
	assert.Equal(t, "sub_old", entries[2].TradeNo)
	assert.Equal(t, "月度套餐", entries[2].Title)
}

func TestBillingHistoryMatrix(t *testing.T) {
	scenarios := map[string]func(*commissionFixture, *testing.T){
		"merge":            billingScenario,
		"pagination":       billingPaginationScenario,
		"money":            billingMoneyScenario,
		"quota":            billingQuotaScenario,
		"invoice_fee":      billingInvoiceFeeScenario,
		"cutoff_and_title": billingCutoffAndTitleScenario,
	}
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		for name, scenario := range scenarios {
			t.Run(dialect+"/"+name, func(t *testing.T) {
				f := newCommissionFixture(t, dialect)
				scenario(f, t)
			})
		}
	}
}
