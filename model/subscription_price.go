package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
)

// 套餐价格统一按人民币理解（B3.8-2 / P-1）。所有支付方式的换算只在这里
// 写一次：汇率用充值的 operation_setting.Price（每 1 美元额度对应的
// 人民币），Price <= 0 时报错、不下单。

// SubscriptionCnyToBalanceQuota 套餐人民币价 → 余额购买应扣额度：
// ceil(priceCny ÷ Price × QuotaPerUnit)。
func SubscriptionCnyToBalanceQuota(priceCny float64) (int, error) {
	if priceCny <= 0 {
		return 0, nil
	}
	if operation_setting.Price <= 0 {
		return 0, errors.New("充值汇率配置错误")
	}
	if common.QuotaPerUnit <= 0 {
		return 0, errors.New("额度单位配置错误")
	}
	quota := decimal.NewFromFloat(priceCny).
		Div(decimal.NewFromFloat(operation_setting.Price)).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit)).
		Ceil()
	return common.WalletQuotaFromDecimalStrict(quota)
}

// SubscriptionCnyToWaffoUsd 套餐人民币价 → Waffo Pancake 美元金额：
// round(priceCny ÷ Price × WaffoPancakeUnitPrice, 2)。
func SubscriptionCnyToWaffoUsd(priceCny float64) (decimal.Decimal, error) {
	if priceCny <= 0 {
		return decimal.Zero, nil
	}
	if operation_setting.Price <= 0 {
		return decimal.Zero, errors.New("充值汇率配置错误")
	}
	return decimal.NewFromFloat(priceCny).
		Div(decimal.NewFromFloat(operation_setting.Price)).
		Mul(decimal.NewFromFloat(setting.WaffoPancakeUnitPrice)).
		Round(2), nil
}
