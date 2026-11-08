package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// B3.2 试算规则：fee = credited × bps / 10000 按币种小数位四舍五入，
// total = credited + fee。到账金额先按币种小数位取整再算手续费。
func TestBuildPaymentQuote(t *testing.T) {
	for _, tc := range []struct {
		name         string
		credited     string
		bps          int
		currency     string
		wantCredited string
		wantFee      string
		wantTotal    string
	}{
		{"zero_bps", "100", 0, "CNY", "100.00", "0.00", "100.00"},
		{"300_bps", "100", 300, "CNY", "100.00", "3.00", "103.00"},
		{"2000_bps_cap", "100", 2000, "CNY", "100.00", "20.00", "120.00"},
		{"credited_rounds_up", "10.005", 0, "CNY", "10.01", "0.00", "10.01"},
		{"sub_cent_fee", "0.333", 300, "CNY", "0.33", "0.01", "0.34"},
		{"fee_rounds_half_up", "333.5", 300, "CNY", "333.50", "10.01", "343.51"},
		{"zero_decimal_jpy", "1000", 300, "JPY", "1000", "30", "1030"},
		{"zero_decimal_vnd", "10000.4", 0, "VND", "10000", "0", "10000"},
		{"lowercase_currency_normalized", "50", 300, "usd", "50.00", "1.50", "51.50"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q, err := BuildPaymentQuote(decimal.RequireFromString(tc.credited), tc.bps, tc.currency)
			require.NoError(t, err)
			assert.Equal(t, tc.wantCredited, q.CreditedMoney.StringFixed(MinorUnitsForCurrency(tc.currency)))
			assert.Equal(t, tc.wantFee, q.FeeMoney.StringFixed(MinorUnitsForCurrency(tc.currency)))
			assert.Equal(t, tc.wantTotal, q.TotalMoney.StringFixed(MinorUnitsForCurrency(tc.currency)))
			assert.Equal(t, tc.bps, q.FeeRateBps)
			assert.False(t, q.FeeIncluded)
		})
	}
}

func TestBuildPaymentQuoteRejectsInvalidInput(t *testing.T) {
	valid := decimal.RequireFromString("100")
	for _, tc := range []struct {
		name     string
		credited decimal.Decimal
		bps      int
	}{
		{"zero_credited", decimal.Zero, 0},
		{"negative_credited", decimal.RequireFromString("-1"), 300},
		{"rounds_to_zero", decimal.RequireFromString("0.001"), 0},
		{"negative_bps", valid, -1},
		{"above_cap", valid, operation_setting.MaxFeeRateBps + 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := BuildPaymentQuote(tc.credited, tc.bps, "CNY")
			assert.ErrorIs(t, err, ErrPaymentQuoteInvalid)
		})
	}
	// 上限本身放行
	_, err := BuildPaymentQuote(valid, operation_setting.MaxFeeRateBps, "CNY")
	require.NoError(t, err)
}

// quote 序列化遵循规则二.2：金额是字符串、按币种小数位，含 fee/total/currency。
func TestPaymentQuoteMarshalJSON(t *testing.T) {
	q, err := BuildPaymentQuote(decimal.RequireFromString("100"), 300, "CNY")
	require.NoError(t, err)
	raw, err := q.MarshalJSON()
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"credited_money": "100.00",
		"fee_rate_bps": 300,
		"fee": "3.00",
		"total": "103.00",
		"currency": "CNY",
		"fee_included": false
	}`, string(raw))
}
