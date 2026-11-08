package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/authz"
)

// NotifyRiskEscalation B2.5：用户升到 notify_levels 级别时通知所有有
// risk.review 权限的管理员。在阶梯事务提交后调用；失败只记日志。
// 内容只带用户、级别、类别 Key 和解除时间，不含词或原文。
func NotifyRiskEscalation(userID int, result *model.RiskHitResult, category *RiskMatchCategory, event *model.RiskEvent) {
	username, _ := model.GetUsernameById(userID, false)
	eventID := ""
	if event != nil {
		eventID = event.EventID
	}
	outcome := "已停用"
	if !result.Disabled {
		outcome = fmt.Sprintf("restricted until %s", time.Unix(result.RestrictedUntil, 0).UTC().Format(time.RFC3339))
	}
	subject := fmt.Sprintf("Risk level %d reached", result.Level)
	content := fmt.Sprintf("user_id=%d username=%s level=%d category=%s outcome=%s event_id=%s",
		userID, username, result.Level, category.Key, outcome, eventID)
	NotifyRiskReviewAdmins(subject, content)
}

// NotifyRiskReviewAdmins 站内通知加 NotifyUser，照 NotifyDistributorReviewAdmins 的写法。
func NotifyRiskReviewAdmins(subject string, content string) {
	var users []model.User
	if err := model.DB.
		Select("id", "email", "role", "status", "setting").
		Where("status = ? AND role >= ?", common.UserStatusEnabled, common.RoleAdminUser).
		Find(&users).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to query risk review admins: %s", err.Error()))
		return
	}
	notification := dto.NewNotify(dto.NotifyTypeRiskEscalation, subject, content, nil)
	for _, user := range users {
		if !authz.Can(user.Id, user.Role, authz.RiskReview) {
			continue
		}
		model.NotifyInSite(user.Id, dto.NotifyTypeRiskEscalation, subject, content)
		if err := NotifyUser(user.Id, user.Email, user.GetSetting(), notification); err != nil {
			common.SysLog(fmt.Sprintf("failed to notify admin %d for risk escalation: %s", user.Id, err.Error()))
		}
	}
}
