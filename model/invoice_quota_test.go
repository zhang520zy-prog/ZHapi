package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withInvoiceTables 给夹具补建发票与订阅表（commissionTables 不含这两张）。
func withInvoiceTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&InvoiceRequest{}, &SubscriptionOrder{}))
	old := operation_setting.InvoiceEnabled
	operation_setting.InvoiceEnabled = true
	t.Cleanup(func() { operation_setting.InvoiceEnabled = old })
}

func invoiceInput(amount string) CreateInvoiceInput {
	return CreateInvoiceInput{
		BuyerName: "Acme Corp", Email: "billing@acme.example",
		AmountCny: amount, InvoiceType: operation_setting.InvoiceTypeNormal,
		Item: "Software service fee",
	}
}

// invoiceQuotaScenario 覆盖 B3.5 计入/排除规则、状态占用与驳回释放。
func invoiceQuotaScenario(f *commissionFixture, t *testing.T) {
	withInvoiceTables(t)
	u := f.makeUser("inv_user", 0)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).Update("quota", int64(10_000_000)).Error)
	u2 := f.makeUser("other_user", 0)

	now := common.GetTimestamp()
	mkTopUp := func(userId int, provider, method, status string, money float64, trade string) {
		require.NoError(t, f.db.Create(&TopUp{
			UserId: userId, Amount: 1, Money: money, TradeNo: trade,
			PaymentMethod: method, PaymentProvider: provider, Status: status,
			CreateTime: now, CompleteTime: now,
		}).Error)
	}
	mkSub := func(userId int, provider, status string, money float64, trade string) {
		require.NoError(t, f.db.Create(&SubscriptionOrder{
			UserId: userId, PlanId: 1, Money: money, TradeNo: trade,
			PaymentMethod: "epay", PaymentProvider: provider, Status: status,
			CreateTime: now, CompleteTime: now,
		}).Error)
	}

	// 计入：epay 成功充值 100 + epay 成功在线订阅 50 = 150 元
	mkTopUp(u.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, 100.0, "tu_cny")
	mkSub(u.Id, PaymentProviderEpay, common.TopUpStatusSuccess, 50.0, "sub_cny")
	// 排除：外币 stripe 充值、未到账 epay、invoice_fee 订单、余额订阅、他人订单
	mkTopUp(u.Id, PaymentProviderStripe, "card", common.TopUpStatusSuccess, 80.0, "tu_usd")
	mkTopUp(u.Id, PaymentProviderEpay, "alipay", common.TopUpStatusPending, 60.0, "tu_pend")
	mkTopUp(u.Id, PaymentProviderEpay, "invoice_fee", common.TopUpStatusSuccess, 30.0, "tu_fee")
	mkSub(u.Id, "balance", common.TopUpStatusSuccess, 40.0, "sub_bal")
	mkTopUp(u2.Id, PaymentProviderEpay, "alipay", common.TopUpStatusSuccess, 999.0, "tu_other")

	received, consumed, available, err := InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.Equal(t, "150.00", received.StringFixed(2))
	assert.Equal(t, "0.00", consumed.StringFixed(2))
	assert.Equal(t, "150.00", available.StringFixed(2))

	// 超出额度拒绝；足额放行
	_, err = CreateInvoiceRequest(u.Id, invoiceInput("150.01"))
	assert.ErrorIs(t, err, ErrInvoiceQuotaExceeded)
	inv, err := CreateInvoiceRequest(u.Id, invoiceInput("150.00"))
	require.NoError(t, err)
	assert.Equal(t, InvoiceStatusPending, inv.Status)

	// 额度全占用后新申请拒绝（pending 占额）
	_, err = CreateInvoiceRequest(u.Id, invoiceInput("1.00"))
	assert.ErrorIs(t, err, ErrInvoiceQuotaExceeded)

	// 驳回释放额度：退费 + 可再次申请全额
	feeQuota := inv.FeeQuota
	quotaBefore := f.reloadUser(u.Id).Quota
	_, err = ReviewInvoiceRequest(inv.Id, 1, InvoiceStatusRejected, "materials missing", "", inv.Version)
	require.NoError(t, err)
	after := f.reloadUser(u.Id)
	assert.Equal(t, quotaBefore+feeQuota, after.Quota)

	_, _, available, err = InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.Equal(t, "150.00", available.StringFixed(2))
	inv2, err := CreateInvoiceRequest(u.Id, invoiceInput("150.00"))
	require.NoError(t, err)

	// processing/issued 同样占额：推进到 processing 后占用不变
	_, err = ReviewInvoiceRequest(inv2.Id, 1, InvoiceStatusProcessing, "", "", inv2.Version)
	require.NoError(t, err)
	_, consumed, _, err = InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.Equal(t, "150.00", consumed.StringFixed(2))
}

// invoiceQuotaFeeSnapshotScenario B3.5 快照分支：带手续费的 CNY 充值只计
// credited_money；外币快照订单、invoice_fee 订单、余额订阅不计入；
// CNY 在线订阅按 credited_money 计入。
func invoiceQuotaFeeSnapshotScenario(f *commissionFixture, t *testing.T) {
	withInvoiceTables(t)
	u := f.makeUser("inv_fee", 0)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).Update("quota", int64(10_000_000)).Error)
	now := common.GetTimestamp()
	mkTopUp := func(trade, method, currency string, credited, fee float64, status string) {
		require.NoError(t, f.db.Create(&TopUp{
			UserId: u.Id, Amount: 1, Money: credited, TradeNo: trade,
			PaymentMethod: method, PaymentProvider: PaymentProviderEpay, Status: status,
			CreateTime: now, CompleteTime: now,
			FeeRateBps: 300, FeeMoney: decimal.NewFromFloat(fee), CreditedMoney: decimal.NewFromFloat(credited), Currency: currency,
		}).Error)
	}
	mkSub := func(trade, provider, currency string, credited float64) {
		require.NoError(t, f.db.Create(&SubscriptionOrder{
			UserId: u.Id, PlanId: 1, Money: credited, TradeNo: trade,
			PaymentMethod: provider, PaymentProvider: provider, Status: common.TopUpStatusSuccess,
			CreateTime: now, CompleteTime: now,
			FeeRateBps: 300, FeeMoney: decimal.NewFromFloat(credited * 0.03), CreditedMoney: decimal.NewFromFloat(credited), Currency: currency,
		}).Error)
	}

	// 计入 200 + 50 = 250：CNY 快照充值按 credited_money（实付 206 中的
	// 手续费 6 不计入）；CNY 在线订阅（creem）按 credited_money。
	mkTopUp("tu_fee_cny", "alipay", "CNY", 200, 6, common.TopUpStatusSuccess)
	mkSub("sub_cny", PaymentProviderCreem, "CNY", 50)
	// 排除：USD 快照充值、invoice_fee 快照订单、余额订阅、USD 快照订阅、待支付。
	mkTopUp("tu_usd", "alipay", "USD", 80, 2, common.TopUpStatusSuccess)
	mkTopUp("tu_invfee", "invoice_fee", "CNY", 6, 0, common.TopUpStatusSuccess)
	mkSub("sub_bal", PaymentProviderBalance, "CNY", 40)
	mkSub("sub_usd", PaymentProviderWaffoPancake, "USD", 30)
	mkTopUp("tu_pend", "alipay", "CNY", 70, 2, common.TopUpStatusPending)

	received, consumed, available, err := InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.Equal(t, "250.00", received.StringFixed(2))
	assert.Equal(t, "0.00", consumed.StringFixed(2))
	assert.Equal(t, "250.00", available.StringFixed(2))

	_, err = CreateInvoiceRequest(u.Id, invoiceInput("250.01"))
	assert.ErrorIs(t, err, ErrInvoiceQuotaExceeded)
	inv, err := CreateInvoiceRequest(u.Id, invoiceInput("250.00"))
	require.NoError(t, err)
	assert.Equal(t, InvoiceStatusPending, inv.Status)
}

func TestInvoiceQuotaMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			f := newCommissionFixture(t, dialect)
			invoiceQuotaScenario(f, t)
		})
		t.Run(dialect+"/fee_snapshot", func(t *testing.T) {
			f := newCommissionFixture(t, dialect)
			invoiceQuotaFeeSnapshotScenario(f, t)
		})
	}
}

// TestInvoiceQuotaNeverNegative 并发申请后合计开票额绝不超过到账额度。
func TestInvoiceQuotaNeverNegative(t *testing.T) {
	f := newCommissionFixture(t, "sqlite")
	withInvoiceTables(t)
	u := f.makeUser("inv_conc", 0)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", u.Id).Update("quota", int64(10_000_000)).Error)
	now := common.GetTimestamp()
	require.NoError(t, f.db.Create(&TopUp{
		UserId: u.Id, Amount: 1, Money: 100.0, TradeNo: "tu_conc",
		PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess,
		CreateTime: now, CompleteTime: now,
	}).Error)

	errs := make(chan error, 4)
	for i := range 4 {
		go func(i int) {
			_, err := CreateInvoiceRequest(u.Id, invoiceInput(fmt.Sprintf("%d.00", 25+i)))
			errs <- err
		}(i)
	}
	for range 4 {
		<-errs
	}

	_, _, available, err := InvoiceSummary(u.Id)
	require.NoError(t, err)
	assert.False(t, available.IsNegative(), "available must never go negative, got %s", available)
	var rows []InvoiceRequest
	require.NoError(t, f.db.Where("user_id = ?", u.Id).Find(&rows).Error)
	consumedSum := decimal.Zero
	for _, r := range rows {
		consumedSum = consumedSum.Add(decimal.RequireFromString(r.AmountCny))
	}
	assert.False(t, consumedSum.GreaterThan(decimal.RequireFromString("100")), "consumed %s exceeds topup", consumedSum)
}
