package model

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

const RiskMaxLevel = 4

// RiskUserState 每个用户一行：四级阶梯的计数窗口与自动限制解除时间。
// 人工确认事件的限制仍记在 risk_events.restriction_until，两处取 max。
type RiskUserState struct {
	UserId          int   `json:"user_id" gorm:"primaryKey"`
	Level           int   `json:"level"`
	Hits            int   `json:"hits"`
	WindowStart     int64 `json:"window_start" gorm:"type:bigint"`
	RestrictedUntil int64 `json:"restricted_until" gorm:"type:bigint"`
	LastHitAt       int64 `json:"last_hit_at" gorm:"type:bigint"`
	Version         int   `json:"version"`
}

func lockRiskUserStateTx(tx *gorm.DB, userId int, now int64) (*RiskUserState, error) {
	state := &RiskUserState{}
	err := lockForUpdate(tx).Where("user_id = ?", userId).Take(state).Error
	if err == nil {
		return state, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	state = &RiskUserState{UserId: userId, WindowStart: now, Version: 1}
	createErr := tx.Create(state).Error
	if createErr == nil {
		return state, nil
	}
	// 并发插入主键冲突：重读已存在的行。
	if err := lockForUpdate(tx).Where("user_id = ?", userId).Take(state).Error; err != nil {
		return nil, err
	}
	return state, nil
}

// applyRiskHitTx 四级阶梯状态机（必须在事务内、行已加锁）。
// 返回新级别、解除时间、是否升级到停用、本次是否发生了升级，
// 以及停用时同步提升的用户 AuthVersion（供提交后发布缓存失效）。
func applyRiskHitTx(tx *gorm.DB, state *RiskUserState, now int64, immediate bool) (restrictedUntil int64, disabled, escalated bool, authVersion int64, err error) {
	setting := operation_setting.GetRiskSetting()
	threshold := setting.HitThreshold

	// 回落：长时间没有命中回到第 0 级。
	if state.Level > 0 && now-max(state.LastHitAt, state.RestrictedUntil) > setting.ResetAfterSeconds {
		state.Level = 0
		state.Hits = 0
	}

	// 限制期内到达的命中（限制生效前已通过受限检查的并发请求、以及
	// 限制期内才进入输出阶段的流）只记事件：不计数、不升级。
	// block_restrict 在限制期内同样不升级——规则三.3 只在限制结束
	// 后的窗口内计数，否则一轮并发命中可直接连升直至停用。
	if state.RestrictedUntil > now {
		return state.RestrictedUntil, false, false, 0, nil
	}

	// 计数窗口：第 0 级看 first_window_seconds；第 1～3 级的窗口从上次
	// 限制结束（WindowStart 已设为 RestrictedUntil）起算 escalation_window_seconds。
	if !immediate {
		window := setting.FirstWindowSeconds
		if state.Level > 0 {
			window = setting.EscalationWindowSeconds
		}
		if now-state.WindowStart > window {
			state.WindowStart = now
			state.Hits = 0
		}
		state.Hits++
	}
	if immediate || state.Hits >= threshold {
		state.Level++
		if state.Level > RiskMaxLevel {
			state.Level = RiskMaxLevel
		}
		escalated = true
		state.Hits = 0
		if state.Level >= RiskMaxLevel {
			disabled = true
		} else {
			state.RestrictedUntil = now + setting.LevelDuration(state.Level)
			state.WindowStart = state.RestrictedUntil
			restrictedUntil = state.RestrictedUntil
		}
	}
	state.LastHitAt = now
	state.Version++
	if err := tx.Save(state).Error; err != nil {
		return 0, false, false, 0, err
	}
	if disabled {
		result := tx.Model(&User{}).Where("id = ? AND status != ?", state.UserId, common.UserStatusDisabled).
			Update("status", common.UserStatusDisabled)
		if result.Error != nil {
			return 0, false, false, 0, result.Error
		}
		if result.RowsAffected == 1 {
			authVersion, err = IncrementUserAuthVersionWithTx(tx, state.UserId)
			if err != nil {
				return 0, false, false, 0, err
			}
		}
	}
	return restrictedUntil, disabled, escalated, authVersion, nil
}

// RiskHitResult 给调用方回传：新级别、解除时间、是否停用、是否升级、是否该通知管理员，
// 以及停用时提升的 AuthVersion（0 表示本次未停用）。
type RiskHitResult struct {
	Level           int
	RestrictedUntil int64
	Disabled        bool
	Escalated       bool
	Notify          bool
	AuthVersion     int64
}

// ApplyRiskHit 记录一次计数的命中并推进阶梯；风险事件由调用方在同一事务里写。
func ApplyRiskHit(tx *gorm.DB, userId int, now int64, immediate bool) (*RiskHitResult, error) {
	if userId <= 0 || now < 0 {
		return nil, ErrRiskInvalid
	}
	state, err := lockRiskUserStateTx(tx, userId, now)
	if err != nil {
		return nil, err
	}
	until, disabled, escalated, authVersion, err := applyRiskHitTx(tx, state, now, immediate)
	if err != nil {
		return nil, err
	}
	result := &RiskHitResult{
		Level:           state.Level,
		RestrictedUntil: until,
		Disabled:        disabled,
		Escalated:       escalated,
		AuthVersion:     authVersion,
		Notify:          escalated && operation_setting.GetRiskSetting().ShouldNotifyLevel(state.Level),
	}
	return result, nil
}

// publishRiskUserStatusChange 停用/恢复事务提交后统一处理：
// 发布已提交的 AuthVersion 下限，失效用户缓存与令牌缓存。
func publishRiskUserStatusChange(userId int, authVersion int64) {
	if authVersion > 0 {
		if err := publishCommittedUserAuthVersion(userId, authVersion); err != nil {
			common.SysError("failed to publish auth version for risk status change: " + err.Error())
		}
	}
	if err := invalidateUserCache(userId); err != nil {
		common.SysError("failed to invalidate user cache for risk status change: " + err.Error())
	}
	if err := InvalidateUserTokensCache(userId); err != nil {
		common.SysError("failed to invalidate tokens cache for risk status change: " + err.Error())
	}
}

// FinishRiskDisable 第 4 级停用提交后调用：失效缓存并撤销全部登录会话。
func FinishRiskDisable(userId int, authVersion int64) {
	publishRiskUserStatusChange(userId, authVersion)
	if _, err := RevokeAllUserSessions(userId, "risk_disabled"); err != nil {
		common.SysError("failed to revoke sessions for risk-disabled user: " + err.Error())
	}
}

// FinishRiskReenable 管理员恢复提交后调用：失效缓存与令牌。
func FinishRiskReenable(userId int, authVersion int64) {
	publishRiskUserStatusChange(userId, authVersion)
}

// RevokeRiskRestriction 撤销自动与人工限制：state 归零，生效中的人工
// restriction_until 改为 now，并各写一条 RiskEventChange。
func RevokeRiskRestriction(userId, actorID int, reason string) error {
	reason = strings.TrimSpace(reason)
	if userId <= 0 || actorID <= 0 || reason == "" || utf8.RuneCountInString(reason) > 500 {
		return ErrRiskInvalid
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		state, err := lockRiskUserStateTx(tx, userId, now)
		if err != nil {
			return err
		}
		state.Level = 0
		state.Hits = 0
		state.RestrictedUntil = now
		state.Version++
		if err := tx.Save(state).Error; err != nil {
			return err
		}
		var events []RiskEvent
		if err := tx.Where("user_id = ? AND restriction_until > ?", userId, now).Find(&events).Error; err != nil {
			return err
		}
		for _, event := range events {
			result := tx.Model(&RiskEvent{}).Where("id = ? AND restriction_until > ?", event.ID, now).
				Updates(map[string]any{"restriction_until": now, "version": gorm.Expr("version + 1")})
			if result.Error != nil {
				return result.Error
			}
			if err := tx.Create(&RiskEventChange{
				EventID: event.EventID, ActorID: actorID, Action: "revoke",
				Status: event.ReviewStatus, Reason: reason,
				CreatedAt: now, EventVersion: event.Version + 1, RestrictionUntil: now,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ReenableRiskUser 恢复第 4 级停用的用户；非风控停用的返回 ErrRiskInvalid。
// 返回提升后的 AuthVersion（0 表示状态未变化），供提交后发布缓存失效。
func ReenableRiskUser(userId, actorID int, reason string) (int64, error) {
	reason = strings.TrimSpace(reason)
	if userId <= 0 || actorID <= 0 || reason == "" || utf8.RuneCountInString(reason) > 500 {
		return 0, ErrRiskInvalid
	}
	var authVersion int64
	now := common.GetTimestamp()
	err := DB.Transaction(func(tx *gorm.DB) error {
		state, err := lockRiskUserStateTx(tx, userId, now)
		if err != nil {
			return err
		}
		var user User
		if err := tx.Select("id", "status").Take(&user, userId).Error; err != nil {
			return err
		}
		if state.Level != RiskMaxLevel || user.Status != common.UserStatusDisabled {
			return ErrRiskInvalid
		}
		state.Level = 0
		state.Hits = 0
		state.RestrictedUntil = 0
		state.Version++
		if err := tx.Save(state).Error; err != nil {
			return err
		}
		result := tx.Model(&User{}).Where("id = ? AND status != ?", userId, common.UserStatusEnabled).
			Update("status", common.UserStatusEnabled)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 1 {
			authVersion, err = IncrementUserAuthVersionWithTx(tx, userId)
			return err
		}
		return nil
	})
	return authVersion, err
}

// RiskUserStateDTO 管理员/用户查看阶梯状态；不含任何词或原文。
// EventID/CategoryName 仅在受限时下发（最近一条限制事件，供提示条用）。
type RiskUserStateDTO struct {
	Level           int    `json:"level"`
	Hits            int    `json:"hits"`
	RestrictedUntil int64  `json:"restricted_until"`
	Disabled        bool   `json:"disabled"`
	EventID         string `json:"event_id,omitempty"`
	CategoryName    string `json:"category_name,omitempty"`
}

func GetRiskUserState(userId int) (*RiskUserStateDTO, error) {
	if userId <= 0 {
		return nil, ErrRiskInvalid
	}
	var state RiskUserState
	err := DB.Where("user_id = ?", userId).Take(&state).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var user User
	disabled := false
	if err := DB.Select("status").Take(&user, userId).Error; err == nil {
		disabled = user.Status == common.UserStatusDisabled && state.Level >= RiskMaxLevel
	}
	dto := &RiskUserStateDTO{
		Level:           state.Level,
		Hits:            state.Hits,
		RestrictedUntil: state.RestrictedUntil,
		Disabled:        disabled,
	}
	restricted := state.RestrictedUntil > common.GetTimestamp() || disabled
	if restricted {
		if err := fillLatestRestrictionEvent(dto, userId); err != nil {
			return nil, err
		}
	}
	return dto, nil
}

// fillLatestRestrictionEvent 取该用户最近一条限制/停用事件，填 event_id 与
// category_name（B2.7-1：类别被删时回退为类别 key 本身）。
func fillLatestRestrictionEvent(dto *RiskUserStateDTO, userId int) error {
	var event RiskEvent
	err := DB.Select("event_id", "category").
		Where("user_id = ? AND action IN ?", userId, []string{"restrict", "disable"}).
		Order("created_at DESC, id DESC").
		Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	dto.EventID = event.EventID
	dto.CategoryName = event.Category
	names, err := RiskCategoryDisplayNames([]string{event.Category})
	if err != nil {
		return err
	}
	if name, ok := names[event.Category]; ok {
		dto.CategoryName = name
	}
	return nil
}

// ListRiskUserCategoryHits 返回最近 30 天按类别的计数命中次数（F5.2 详情用）。
func ListRiskUserCategoryHits(userId int, since int64) (map[string]int64, error) {
	if userId <= 0 || since < 0 {
		return nil, ErrRiskInvalid
	}
	var rows []struct {
		Category string
		Total    int64
	}
	err := DB.Model(&RiskEvent{}).
		Select("category, COUNT(*) AS total").
		Where("user_id = ? AND created_at >= ? AND action IN ?", userId, since,
			[]string{"block", "restrict", "disable"}).
		Group("category").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	hits := make(map[string]int64, len(rows))
	for _, row := range rows {
		hits[row.Category] = row.Total
	}
	return hits, nil
}
