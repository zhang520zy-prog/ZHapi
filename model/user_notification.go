package model

import (
	"github.com/QuantumNous/new-api/common"
)

// UserNotification 站内通知（顶部铃铛）。B4.1：分销商生命周期事件落站内 + 邮件。
type UserNotification struct {
	Id        int    `json:"id" gorm:"primaryKey"`
	UserId    int    `json:"user_id" gorm:"index:idx_user_notification_user_time,priority:1"`
	Type      string `json:"type" gorm:"type:varchar(48);index"`
	Title     string `json:"title" gorm:"type:varchar(128)"`
	Content   string `json:"content" gorm:"type:text"`
	ReadAt    int64  `json:"read_at" gorm:"type:bigint"`
	CreatedAt int64  `json:"created_at" gorm:"type:bigint;index:idx_user_notification_user_time,priority:2,sort:desc"`
}

// NotifyInSite 写一条站内通知；失败只记日志不阻断业务事务。
func NotifyInSite(userId int, notifyType string, title string, content string) {
	if userId <= 0 {
		return
	}
	row := &UserNotification{
		UserId:    userId,
		Type:      notifyType,
		Title:     title,
		Content:   content,
		CreatedAt: common.GetTimestamp(),
	}
	if err := DB.Create(row).Error; err != nil {
		common.SysError("failed to create in-site notification: " + err.Error())
	}
}

// ListUserNotifications 分页返回站内通知（按时间倒序）与未读数。
func ListUserNotifications(userId int, start int, size int) ([]UserNotification, int64, int64, error) {
	var total int64
	var unread int64
	q := DB.Model(&UserNotification{}).Where("user_id = ?", userId)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, 0, err
	}
	if err := q.Where("read_at = 0").Count(&unread).Error; err != nil {
		return nil, 0, 0, err
	}
	var rows []UserNotification
	err := DB.Where("user_id = ?", userId).Order("created_at DESC").Offset(start).Limit(size).Find(&rows).Error
	return rows, total, unread, err
}

// MarkUserNotificationsRead 标记已读；ids 为空时全部已读。
func MarkUserNotificationsRead(userId int, ids []int) error {
	now := common.GetTimestamp()
	q := DB.Model(&UserNotification{}).Where("user_id = ? AND read_at = 0", userId)
	if len(ids) > 0 {
		q = q.Where("id IN ?", ids)
	}
	return q.Update("read_at", now).Error
}
