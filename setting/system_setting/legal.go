package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
	// UserAgreementVersion B2.7-3：管理员上调该版本后，已同意旧版本的用户
	// 需在控制台重新确认协议；0 表示不启用版本化确认。
	UserAgreementVersion int `json:"user_agreement_version"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement:        "",
	PrivacyPolicy:        "",
	UserAgreementVersion: 0,
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}
