package service

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
)

// zeroDecimalCurrencies 零小数位币种，金额不能带小数点。
var zeroDecimalCurrencies = map[string]bool{
	"IDR": true, "JPY": true, "KRW": true, "VND": true,
}

// MinorUnitsForCurrency 返回币种的小数位数：ISO 4217 常规为 2，零小数币种为 0。
func MinorUnitsForCurrency(currency string) int32 {
	if zeroDecimalCurrencies[strings.ToUpper(currency)] {
		return 0
	}
	return 2
}

var ErrPaymentQuoteInvalid = errors.New("invalid payment quote")

// PaymentQuote 一次支付的完整报价：CreditedMoney 是钱包到账金额，
// TotalMoney 是用户实付金额（含手续费）。
type PaymentQuote struct {
	CreditedMoney decimal.Decimal `json:"-"`
	FeeRateBps    int             `json:"fee_rate_bps"`
	FeeMoney      decimal.Decimal `json:"-"`
	TotalMoney    decimal.Decimal `json:"-"`
	Currency      string          `json:"currency"`
	FeeIncluded   bool            `json:"fee_included"`
}

// MarshalJSON 输出规则二.2 约定的 quote 结构：金额一律字符串、按币种小数位。
func (q PaymentQuote) MarshalJSON() ([]byte, error) {
	units := MinorUnitsForCurrency(q.Currency)
	return common.Marshal(map[string]any{
		"credited_money": q.CreditedMoney.StringFixed(units),
		"fee_rate_bps":   q.FeeRateBps,
		"fee":            q.FeeMoney.StringFixed(units),
		"total":          q.TotalMoney.StringFixed(units),
		"currency":       q.Currency,
		"fee_included":   q.FeeIncluded,
	})
}

// BuildPaymentQuote 按费率计算实付金额。CreditedMoney 先按币种小数位
// 四舍五入，FeeMoney 在取整后的到账金额上计算，保证快照与实付一致。
func BuildPaymentQuote(credited decimal.Decimal, feeRateBps int, currency string) (PaymentQuote, error) {
	if feeRateBps < 0 || feeRateBps > operation_setting.MaxFeeRateBps {
		return PaymentQuote{}, ErrPaymentQuoteInvalid
	}
	if !credited.IsPositive() {
		return PaymentQuote{}, ErrPaymentQuoteInvalid
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	units := MinorUnitsForCurrency(currency)
	creditedRounded := credited.Round(units)
	if !creditedRounded.IsPositive() {
		return PaymentQuote{}, ErrPaymentQuoteInvalid
	}
	fee := creditedRounded.
		Mul(decimal.NewFromInt(int64(feeRateBps))).
		Div(decimal.NewFromInt(10000)).
		Round(units)
	total := creditedRounded.Add(fee)
	if !total.IsPositive() {
		return PaymentQuote{}, ErrPaymentQuoteInvalid
	}
	return PaymentQuote{
		CreditedMoney: creditedRounded,
		FeeRateBps:    feeRateBps,
		FeeMoney:      fee,
		TotalMoney:    total,
		Currency:      currency,
		FeeIncluded:   false,
	}, nil
}
