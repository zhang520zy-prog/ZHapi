package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// ListMyNotifications 站内通知列表（分页，未读数一并返回）。
func ListMyNotifications(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, unread, err := model.ListUserNotifications(c.GetInt("id"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      "",
		"data":         page,
		"unread_count": unread,
	})
}

// ReadMyNotifications 标记已读；ids 为空表示全部已读。
func ReadMyNotifications(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var input struct {
		Ids []int `json:"ids"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.MarkUserNotificationsRead(c.GetInt("id"), input.Ids); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
