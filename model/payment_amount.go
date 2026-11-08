package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// ErrPaymentAmountMismatch 回调实付金额与订单快照不一致。
var ErrPaymentAmountMismatch = errors.New("paid amount mismatch")

// PaymentAmountMismatchError 携带核对失败的明细。核对发生在订单事务内，
// 事件记录要等事务回滚后另写（事务内写入会随回滚消失），明细由本错误透出。
type PaymentAmountMismatchError struct {
	Provider  string
	TradeNo   string
	Currency  string
	PaidMinor int64
}

func (e *PaymentAmountMismatchError) Error() string { return ErrPaymentAmountMismatch.Error() }

func (e *PaymentAmountMismatchError) Is(target error) bool {
	return target == ErrPaymentAmountMismatch
}

// noteAmountMismatch 把事务内核对失败转为持久化支付事件并归一为
// ErrPaymentAmountMismatch；非核对错误原样返回。EventID 由单号派生，
// 重复的不一致回调幂等。
func noteAmountMismatch(err error) error {
	var mismatch *PaymentAmountMismatchError
	if !errors.As(err, &mismatch) {
		return err
	}
	if recErr := recordPaymentAmountMismatch(mismatch.Provider, mismatch.TradeNo, mismatch.PaidMinor, mismatch.Currency); recErr != nil {
		common.SysError("record payment amount mismatch failed: " + recErr.Error())
	}
	return ErrPaymentAmountMismatch
}

// expectedPaidMoney 返回订单期望的实付金额：写过快照的订单为
// credited_money + fee_money；升级前的老订单（currency=”）回退到 Money。
func expectedPaidMoney(creditedMoney, feeMoney decimal.Decimal, money float64, currency string) decimal.Decimal {
	if strings.TrimSpace(currency) == "" {
		return decimal.NewFromFloat(money).Round(2)
	}
	return creditedMoney.Add(feeMoney)
}

// expectedCreditedMoney 返回 fee_included 通道（Creem）的期望实付金额：
// 快照订单为 credited_money（价格已含手续费），老订单回退到 Money。
func expectedCreditedMoney(creditedMoney decimal.Decimal, money float64, currency string) decimal.Decimal {
	if strings.TrimSpace(currency) == "" {
		return decimal.NewFromFloat(money).Round(2)
	}
	return creditedMoney
}

// parsePaidMoney 解析回调里的实付金额字符串。空串、非数值、负数均视为不可核对。
func parsePaidMoney(paid string) (decimal.Decimal, bool) {
	paid = strings.TrimSpace(paid)
	if paid == "" {
		return decimal.Zero, false
	}
	d, err := decimal.NewFromString(paid)
	if err != nil || d.IsNegative() {
		return decimal.Zero, false
	}
	return d, true
}

// minorUnitsForCurrency 与 service.MinorUnitsForCurrency 一致：ISO 4217 常规
// 币种 2 位小数，零小数币种 0 位。model 不能反向依赖 service，这里复制取值。
var paymentMinorZeroDecimalCurrencies = map[string]bool{
	"IDR": true, "JPY": true, "KRW": true, "VND": true,
}

func paymentMinorUnits(currency string) int32 {
	if paymentMinorZeroDecimalCurrencies[strings.ToUpper(currency)] {
		return 0
	}
	return 2
}

// verifyPaidMoney 在已加锁的事务内核对回调实付金额：金额无法解析、与期望
// 值不等、或币种与快照不一致时，返回 *PaymentAmountMismatchError，订单保持
// pending 不入账，事件由调用方在事务回滚后经 noteAmountMismatch 补写。
// expected 与 paid 均为该币种主单位金额，比较用 decimal.Equal 不允许误差。
// paidCurrency 为空时跳过币种比对（易支付回调不带币种字段）。
func verifyPaidMoney(provider, tradeNo, currency, paidCurrency string, expected decimal.Decimal, paidMoney string) error {
	if currency != "" && paidCurrency != "" && !strings.EqualFold(paidCurrency, currency) {
		return &PaymentAmountMismatchError{Provider: provider, TradeNo: tradeNo, Currency: paidCurrency}
	}
	paid, ok := parsePaidMoney(paidMoney)
	if ok && paid.Equal(expected) {
		return nil
	}
	paidMinor := paid.Shift(paymentMinorUnits(currency)).Round(0).IntPart()
	return &PaymentAmountMismatchError{Provider: provider, TradeNo: tradeNo, Currency: currency, PaidMinor: paidMinor}
}

// verifyPaidMinor 与 verifyPaidMoney 相同，但实付金额以最小货币单位传入
// （Creem 回调的 amount_paid）。
func verifyPaidMinor(provider, tradeNo, currency, paidCurrency string, expected decimal.Decimal, paidMinor int64) error {
	if currency != "" && paidCurrency != "" && !strings.EqualFold(paidCurrency, currency) {
		return &PaymentAmountMismatchError{Provider: provider, TradeNo: tradeNo, Currency: paidCurrency, PaidMinor: paidMinor}
	}
	expectedMinor := expected.Shift(paymentMinorUnits(currency)).Round(0).IntPart()
	if paidMinor == expectedMinor {
		return nil
	}
	return &PaymentAmountMismatchError{Provider: provider, TradeNo: tradeNo, Currency: currency, PaidMinor: paidMinor}
}
