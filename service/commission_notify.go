package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/authz"
)

// NotifyDistributorSettleAdmins 通知所有有 distributor.settle 权限的管理员
// （root 以及被单独授权的管理员），参照 NotifyUpstreamModelUpdateWatchers 的写法；
// 通知类型受现有每小时限流约束。
func NotifyDistributorSettleAdmins(subject string, content string) {
	var users []model.User
	if err := model.DB.
		Select("id", "email", "role", "status", "setting").
		Where("status = ? AND role >= ?", common.UserStatusEnabled, common.RoleAdminUser).
		Find(&users).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to query distributor settle admins: %s", err.Error()))
		return
	}
	notification := dto.NewNotify(dto.NotifyTypeDistributorCommissionDue, subject, content, nil)
	for _, user := range users {
		if !authz.Can(user.Id, user.Role, authz.DistributorSettle) {
			continue
		}
		if err := NotifyUser(user.Id, user.Email, user.GetSetting(), notification); err != nil {
			common.SysLog(fmt.Sprintf("failed to notify admin %d for distributor settlement: %s", user.Id, err.Error()))
		}
	}
}

// NotifyDistributorUser B4.1：分销商本人通知 = 站内铃铛（无条件落库）+
// 按用户通知设置的外部通道（NotifyUser 受每类型限流约束；用户未配置/关闭
// 邮件等通道时自然只剩站内）。
func NotifyDistributorUser(userId int, notifyType string, subject string, content string) {
	model.NotifyInSite(userId, notifyType, subject, content)
	var user model.User
	if err := model.DB.Select("id", "email", "setting").Where("id = ?", userId).Take(&user).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to load user %d for distributor notify: %s", userId, err.Error()))
		return
	}
	if err := NotifyUser(user.Id, user.Email, user.GetSetting(), dto.NewNotify(notifyType, subject, content, nil)); err != nil {
		common.SysLog(fmt.Sprintf("failed to notify distributor %d: %s", userId, err.Error()))
	}
}

// NotifyActiveDistributorsAgreementUpdate B4.1：《分销协议》版本更新后通知所有
// 激活分销商重新确认（确认前提现/转余额会被协议门拦截）。
func NotifyActiveDistributorsAgreementUpdate(version int) {
	var ids []int
	if err := model.DB.Model(&model.DistributorProfile{}).
		Where("status = ?", model.DistributorStatusActive).
		Pluck("user_id", &ids).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to query active distributors for agreement update: %s", err.Error()))
		return
	}
	subject := "《分销协议》已更新"
	content := fmt.Sprintf("《分销协议》已更新至 v%d，请前往分销页阅读并重新确认；确认前提现与转余额暂不可用。", version)
	for _, userId := range ids {
		NotifyDistributorUser(userId, dto.NotifyTypeDistributorLifecycle, subject, content)
	}
}

// NotifyDistributorReviewAdmins B4.2：新分销申请通知有 distributor.review 权限的管理员。
func NotifyDistributorReviewAdmins(subject string, content string) {
	var users []model.User
	if err := model.DB.
		Select("id", "email", "role", "status", "setting").
		Where("status = ? AND role >= ?", common.UserStatusEnabled, common.RoleAdminUser).
		Find(&users).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to query distributor review admins: %s", err.Error()))
		return
	}
	notification := dto.NewNotify(dto.NotifyTypeDistributorNewApplication, subject, content, nil)
	for _, user := range users {
		if !authz.Can(user.Id, user.Role, authz.DistributorReview) {
			continue
		}
		model.NotifyInSite(user.Id, dto.NotifyTypeDistributorNewApplication, subject, content)
		if err := NotifyUser(user.Id, user.Email, user.GetSetting(), notification); err != nil {
			common.SysLog(fmt.Sprintf("failed to notify admin %d for new application: %s", user.Id, err.Error()))
		}
	}
}
