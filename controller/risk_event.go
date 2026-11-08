package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func riskError(c *gin.Context, err error) {
	status, code, message := http.StatusInternalServerError, "RISK_UNAVAILABLE", "Risk operation unavailable"
	switch {
	case errors.Is(err, model.ErrRiskInvalid):
		status, code, message = http.StatusBadRequest, "RISK_INVALID", "Invalid risk request"
	case errors.Is(err, model.ErrRiskNotFound):
		status, code, message = http.StatusNotFound, "RISK_NOT_FOUND", "Risk event not found"
	case errors.Is(err, model.ErrRiskConflict):
		status, code, message = http.StatusConflict, "RISK_CONFLICT", "Risk record changed; refresh and retry"
	default:
		common.SysError("risk operation failed: " + err.Error())
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": message})
}

func riskInt64Query(c *gin.Context, name string) (int64, error) {
	raw := c.Query(name)
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 {
		return 0, model.ErrRiskInvalid
	}
	return value, nil
}

func riskList(c *gin.Context, admin bool) {
	page := common.GetPageQuery(c)
	if page.Page < 1 || page.Page > 1000001 || page.PageSize < 1 || page.PageSize > 100 {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	filter := model.RiskEventFilter{Model: c.Query("model"), Status: c.Query("status"), RequestID: c.Query("request_id")}
	if !admin {
		filter.UserID = c.GetInt("id")
	} else if raw := c.Query("user_id"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value <= 0 {
			riskError(c, model.ErrRiskInvalid)
			return
		}
		filter.UserID = value
	}
	var err error
	if filter.StartTimestamp, err = riskInt64Query(c, "start_timestamp"); err != nil {
		riskError(c, err)
		return
	}
	if filter.EndTimestamp, err = riskInt64Query(c, "end_timestamp"); err != nil {
		riskError(c, err)
		return
	}
	rows, total, err := model.ListRiskEvents(filter, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		riskError(c, err)
		return
	}
	page.SetTotal(int(total))
	if admin {
		page.SetItems(rows)
	} else {
		items := make([]model.RiskEventDTO, 0, len(rows))
		for _, row := range rows {
			items = append(items, row.SafeDTO())
		}
		page.SetItems(items)
	}
	common.ApiSuccess(c, page)
}

func GetRiskEvents(c *gin.Context)     { riskList(c, true) }
func GetRiskEventsSelf(c *gin.Context) { riskList(c, false) }

func GetRiskEventDetail(c *gin.Context) {
	event, err := model.GetRiskEvent(c.Param("event_id"), 0)
	if err != nil {
		riskError(c, err)
		return
	}
	appeals, err := model.ListRiskAppeals(event.EventID, 0)
	if err != nil {
		riskError(c, err)
		return
	}
	changes, err := model.ListRiskEventChanges(event.EventID)
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"event": event, "appeals": appeals, "changes": changes})
}

func GetRiskEventSelfDetail(c *gin.Context) {
	event, err := model.GetRiskEvent(c.Param("event_id"), c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	appeals, err := model.ListRiskAppeals(event.EventID, c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	items := make([]model.RiskAppealDTO, 0, len(appeals))
	for _, appeal := range appeals {
		items = append(items, appeal.SafeDTO())
	}
	common.ApiSuccess(c, gin.H{"event": event.SafeDTO(), "appeals": items})
}

type riskAppealRequest struct {
	Reason string `json:"reason"`
}

func SubmitRiskEventAppeal(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskAppealRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	appeal, err := model.SubmitRiskAppeal(c.Param("event_id"), c.GetInt("id"), request.Reason)
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, appeal.SafeDTO())
}

type riskReviewRequest struct {
	EventID               string `json:"-"`
	ExpectedVersion       int    `json:"expected_version"`
	Status                string `json:"status"`
	Reason                string `json:"reason"`
	AppealID              int    `json:"appeal_id"`
	ExpectedAppealVersion int    `json:"expected_appeal_version"`
	RestrictionSeconds    int64  `json:"restriction_seconds"`
}

func ReviewRiskEvent(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskReviewRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	request.EventID = c.Param("event_id")
	event, err := model.ReviewRiskEvent(model.RiskReviewInput{EventID: request.EventID, ExpectedVersion: request.ExpectedVersion, Status: request.Status, Reason: request.Reason, ReviewerID: c.GetInt("id"), AppealID: request.AppealID, ExpectedAppealVersion: request.ExpectedAppealVersion, RestrictionSeconds: request.RestrictionSeconds})
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, event.SafeDTO())
}
