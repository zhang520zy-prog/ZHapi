package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// B3.1 校验：键限 <provider>:<method>，provider 限 epay/waffo/waffo_pancake，
// creem 价格已含手续费不可配置；值限 0～2000 的整数。
func TestValidateFeeRateBpsJSON(t *testing.T) {
	for _, tc := range []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"empty", "", false},
		{"null", "null", false},
		{"valid_map", `{"epay:alipay":300,"epay:wxpay":0,"waffo:1":50,"waffo_pancake:default":2000}`, false},
		{"unknown_provider", `{"stripe:card":300}`, true},
		{"creem_rejected", `{"creem:default":300}`, true},
		{"missing_method", `{"epay":300}`, true},
		{"missing_colon", `{"epaypalipay":300}`, true},
		{"negative", `{"epay:alipay":-1}`, true},
		{"above_cap", `{"epay:alipay":2001}`, true},
		{"non_integer", `{"epay:alipay":3.5}`, true},
		{"string_value", `{"epay:alipay":"300"}`, true},
		{"not_object", `[300]`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateFeeRateBpsJSON(tc.value)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetFeeRateBpsDefaultsToZero(t *testing.T) {
	old := paymentSetting.FeeRateBps
	t.Cleanup(func() { paymentSetting.FeeRateBps = old })
	paymentSetting.FeeRateBps = map[string]int{"epay:alipay": 300}
	assert.Equal(t, 300, GetFeeRateBps("epay", "alipay"))
	assert.Equal(t, 0, GetFeeRateBps("epay", "wxpay"))
	assert.Equal(t, 0, GetFeeRateBps("waffo_pancake", "default"))
	paymentSetting.FeeRateBps = nil
	assert.Equal(t, 0, GetFeeRateBps("epay", "alipay"))
}
