package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// 推广与分销选项。值都落在 options 表（OptionMap），这里保存解析后的运行时副本；
// updateOptionMap 在 options 写入后更新这些变量。

const (
	DefaultReferralRateBps     = 150
	DefaultDistributorRateBps  = 1000
	DefaultDistributorHoldDays = 3
	DefaultWithdrawMinCNY      = "10"
	MaxCommissionRateBps       = 10000
	CommissionHighRateBps      = 3000 // 超过 30% 的活动比例需要二次确认
)

var (
	ReferralCommissionEnabled  = false
	ReferralRateBps            = DefaultReferralRateBps
	DistributorEnabled         = false
	DistributorApplyEnabled    = false
	DistributorDefaultRateBps  = DefaultDistributorRateBps
	DistributorHoldDays        = DefaultDistributorHoldDays
	DistributorWithdrawEnabled = false
	DistributorWithdrawMinCNY  = DefaultWithdrawMinCNY
	CommissionTermsExtra       = "" // 旧共用条款：仅作 R5 迁移数据源，新代码勿读
	ReferralTermsExtra         = ""
	DistributorTermsExtra      = ""
	CommissionTermsVersion     = 1
	// 《分销协议》独立版本号（B1.8）：与《推广返现规则》分开演进；
	// 升级存量库时初始化为当时的 CommissionTermsVersion，避免老同意记录瞬间失效。
	DistributorAgreementVersion = 1
)

func DistributorWithdrawMethods() []string {
	return parseStringListOption("DistributorWithdrawMethods", []string{"alipay", "wechat", "bank", "usdt"})
}

func DistributorUsdtNetworks() []string {
	return parseStringListOption("DistributorUsdtNetworks", nil)
}

func parseStringListOption(key string, fallback []string) []string {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[key]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	var list []string
	if err := common.Unmarshal([]byte(raw), &list); err != nil || list == nil {
		return fallback
	}
	return list
}

// WithdrawMinQuota 把最低提现人民币金额换算成站内额度（向上取整），保证换算后不低于设定值。
func WithdrawMinQuota() (int, error) {
	minCNY, err := decimal.NewFromString(strings.TrimSpace(DistributorWithdrawMinCNY))
	if err != nil || !minCNY.IsPositive() {
		minCNY = decimal.RequireFromString(DefaultWithdrawMinCNY)
	}
	rate := decimal.NewFromFloat(USDExchangeRate)
	if !rate.IsPositive() {
		rate = decimal.NewFromFloat(7.3)
	}
	quota := minCNY.Div(rate).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Ceil()
	minQuota, clamp := common.QuotaFromDecimalChecked(quota)
	if clamp != nil {
		return 0, clamp
	}
	return minQuota, nil
}
