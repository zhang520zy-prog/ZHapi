package operation_setting

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type PaymentSetting struct {
	AmountOptions  []int           `json:"amount_options"`
	AmountDiscount map[int]float64 `json:"amount_discount"` // 充值金额对应的折扣，例如 100 元 0.9 表示 100 元充值享受 9 折优惠
	FeeRateBps     map[string]int  `json:"fee_rate_bps"`    // 支付通道手续费率（基点），键为 <provider>:<method>

	ComplianceConfirmed    bool   `json:"compliance_confirmed"`
	ComplianceTermsVersion string `json:"compliance_terms_version"`
	ComplianceConfirmedAt  int64  `json:"compliance_confirmed_at"`
	ComplianceConfirmedBy  int    `json:"compliance_confirmed_by"`
	ComplianceConfirmedIP  string `json:"compliance_confirmed_ip"`
}

const CurrentComplianceTermsVersion = "v1"

// 默认配置
var paymentSetting = PaymentSetting{
	AmountOptions:  []int{10, 20, 50, 100, 200, 500},
	AmountDiscount: map[int]float64{},
	FeeRateBps:     map[string]int{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("payment_setting", &paymentSetting)
}

func GetPaymentSetting() *PaymentSetting {
	return &paymentSetting
}

func IsPaymentComplianceConfirmed() bool {
	return paymentSetting.ComplianceConfirmed &&
		paymentSetting.ComplianceTermsVersion == CurrentComplianceTermsVersion
}

// 手续费率上限：2000 bps = 20%，防止误填；如需更高由产品方调整常量。
const MaxFeeRateBps = 2000

// 支持配置手续费率的支付通道（与 model/topup.go 的 PaymentProvider 常量保持一致，
// operation_setting 不能反向依赖 model，这里复制取值）。
var feeRateProviders = map[string]bool{
	"epay":          true,
	"waffo":         true,
	"waffo_pancake": true,
}

// GetFeeRateBps 返回 <provider>:<method> 的手续费率（基点），未配置时返回 0。
func GetFeeRateBps(provider, method string) int {
	if paymentSetting.FeeRateBps == nil {
		return 0
	}
	return paymentSetting.FeeRateBps[provider+":"+method]
}

// ValidateFeeRateBpsJSON 校验 payment_setting.fee_rate_bps 的写入值：
// 键必须是 <provider>:<method>，provider 限于受支持的通道（creem 价格已含
// 手续费，不允许配置），值必须是 0～MaxFeeRateBps 的整数。
func ValidateFeeRateBpsJSON(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	var raw map[string]json.RawMessage
	if err := common.Unmarshal([]byte(trimmed), &raw); err != nil {
		return fmt.Errorf("fee_rate_bps 不是合法的 JSON 对象")
	}
	for key, rawVal := range raw {
		provider, method, ok := strings.Cut(key, ":")
		if !ok || provider == "" || method == "" {
			return fmt.Errorf("fee_rate_bps 键 %q 无效，应为 <provider>:<method>", key)
		}
		if !feeRateProviders[provider] {
			return fmt.Errorf("fee_rate_bps 键 %q 的支付通道不支持配置手续费率", key)
		}
		var num json.Number
		if err := common.Unmarshal(rawVal, &num); err != nil {
			return fmt.Errorf("fee_rate_bps[%q] 必须是整数", key)
		}
		// JSON 必须裸写整数：字符串/布尔等非数字 token 直接拒绝，
		// 避免宽松解码把 "300" 或 true 悄悄当成合法值。
		trimmed := strings.TrimSpace(string(rawVal))
		if trimmed == "" || trimmed[0] == '"' || trimmed[0] == '[' || trimmed[0] == '{' {
			return fmt.Errorf("fee_rate_bps[%q] 必须是整数", key)
		}
		v, err := num.Int64()
		if err != nil {
			return fmt.Errorf("fee_rate_bps[%q] 必须是整数", key)
		}
		if v < 0 || v > MaxFeeRateBps {
			return fmt.Errorf("fee_rate_bps[%q] 必须在 0～%d 之间", key, MaxFeeRateBps)
		}
	}
	return nil
}
