package operation_setting

import (
	"fmt"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// RiskSetting 四级阶梯限制参数，通过 risk_setting.<field> 键保存。
type RiskSetting struct {
	HitThreshold            int     `json:"hit_threshold"`
	FirstWindowSeconds      int64   `json:"first_window_seconds"`
	EscalationWindowSeconds int64   `json:"escalation_window_seconds"`
	ResetAfterSeconds       int64   `json:"reset_after_seconds"`
	LevelDurationsSeconds   []int64 `json:"level_durations_seconds"`
	NotifyLevels            []int   `json:"notify_levels"`
}

var riskSetting = RiskSetting{
	HitThreshold:            3,
	FirstWindowSeconds:      3600,
	EscalationWindowSeconds: 86400,
	ResetAfterSeconds:       86400,
	LevelDurationsSeconds:   []int64{600, 3600, 86400},
	NotifyLevels:            []int{3, 4},
}

func init() {
	config.GlobalConfig.Register("risk_setting", &riskSetting)
}

func GetRiskSetting() *RiskSetting {
	return &riskSetting
}

const (
	riskMaxHitThreshold  = 100
	riskMinDuration      = int64(60)
	riskMaxDuration      = int64(30 * 86400)
	riskLevelCount       = 4
	riskDurationSlotSize = 3
)

// LevelDuration 返回第 level（1～3）级的限制时长秒数；第 4 级是停用。
func (s *RiskSetting) LevelDuration(level int) int64 {
	if level >= 1 && level <= len(s.LevelDurationsSeconds) {
		return s.LevelDurationsSeconds[level-1]
	}
	return 0
}

func (s *RiskSetting) ShouldNotifyLevel(level int) bool {
	return slices.Contains(s.NotifyLevels, level)
}

var riskScalarDurations = map[string]bool{
	"first_window_seconds":      true,
	"escalation_window_seconds": true,
	"reset_after_seconds":       true,
}

// ValidateRiskSettingValue 校验单个 risk_setting.<field> 写入值。
// 次数 1～100；窗口与时长 60 秒～30 天；level_durations_seconds 必须
// 正好 3 个且递增；notify_levels 元素在 1～4 之间。
func ValidateRiskSettingValue(field, value string) error {
	switch {
	case field == "hit_threshold":
		var v int
		if err := common.UnmarshalJsonStr(value, &v); err != nil || v < 1 || v > riskMaxHitThreshold {
			return fmt.Errorf("risk_setting.hit_threshold 必须是 1～%d 的整数", riskMaxHitThreshold)
		}
		return nil
	case riskScalarDurations[field]:
		var v int64
		if err := common.UnmarshalJsonStr(value, &v); err != nil || v < riskMinDuration || v > riskMaxDuration {
			return fmt.Errorf("risk_setting.%s 必须在 %d～%d 秒之间", field, riskMinDuration, riskMaxDuration)
		}
		return nil
	case field == "level_durations_seconds":
		var durations []int64
		if err := common.UnmarshalJsonStr(value, &durations); err != nil || len(durations) != riskDurationSlotSize {
			return fmt.Errorf("risk_setting.level_durations_seconds 必须是 %d 个递增的秒数", riskDurationSlotSize)
		}
		for i, d := range durations {
			if d < riskMinDuration || d > riskMaxDuration {
				return fmt.Errorf("risk_setting.level_durations_seconds 每项必须在 %d～%d 秒之间", riskMinDuration, riskMaxDuration)
			}
			if i > 0 && d <= durations[i-1] {
				return fmt.Errorf("risk_setting.level_durations_seconds 必须递增")
			}
		}
		return nil
	case field == "notify_levels":
		var levels []int
		if err := common.UnmarshalJsonStr(value, &levels); err != nil || len(levels) > riskLevelCount {
			return fmt.Errorf("risk_setting.notify_levels 必须是 1～%d 的级别数组", riskLevelCount)
		}
		for _, level := range levels {
			if level < 1 || level > riskLevelCount {
				return fmt.Errorf("risk_setting.notify_levels 每项必须在 1～%d 之间", riskLevelCount)
			}
		}
		return nil
	}
	return fmt.Errorf("risk_setting.%s 不是可配置字段", field)
}

var riskSettingFields = map[string]bool{
	"hit_threshold":             true,
	"first_window_seconds":      true,
	"escalation_window_seconds": true,
	"reset_after_seconds":       true,
	"level_durations_seconds":   true,
	"notify_levels":             true,
}

func IsRiskSettingField(field string) bool {
	return riskSettingFields[field]
}
