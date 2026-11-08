package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/gin-gonic/gin"
)

// ---------- 按业务线的管理端权限 ----------

// hasCommissionPerm 判定当前管理员是否持有某业务线下的指定动作权限：
// referral→referral.*，distributor→distributor.*。
func hasCommissionPerm(c *gin.Context, program string, action string) bool {
	resource := authz.ResourceDistributor
	if program == model.CommissionProgramReferral {
		resource = authz.ResourceReferral
	}
	return authz.Can(c.GetInt("id"), c.GetInt("role"), authz.Permission{Resource: resource, Action: action})
}

// triStateInt 把 JSON 三态字段（未传/null/数字）转成 **int：
// 外层 nil=未传（不更新）；内层 nil=显式 null（清空）；指向值为设定值。
func triStateInt(raw json.RawMessage) (**int, error) {
	if len(raw) == 0 || string(raw) == "null" {
		if len(raw) == 0 {
			return nil, nil
		}
		empty := (*int)(nil)
		return &empty, nil
	}
	var v int
	if err := common.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	inner := &v
	return &inner, nil
}

func denyCommissionAccess(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{
		"success": false,
		"code":    "AUTH_INSUFFICIENT_PRIVILEGE",
		"message": common.TranslateMessage(c, i18n.MsgAuthInsufficientPrivilege),
	})
}

// requireCommissionProgramPerm 读取并校验必填的 ?program= 查询参数
// （referral / distributor / all），再按业务线校验 action 权限；
// "all" 要求两条业务线的同动作权限同时具备。
func requireCommissionProgramPerm(c *gin.Context, action string) (string, bool) {
	program := c.Query("program")
	switch program {
	case model.CommissionProgramReferral, model.CommissionProgramDistributor:
		if !hasCommissionPerm(c, program, action) {
			denyCommissionAccess(c)
			return "", false
		}
	case model.CommissionProgramAll:
		if !(hasCommissionPerm(c, model.CommissionProgramReferral, action) && hasCommissionPerm(c, model.CommissionProgramDistributor, action)) {
			denyCommissionAccess(c)
			return "", false
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Query parameter program must be referral, distributor or all"})
		return "", false
	}
	return program, true
}

// requireCommissionRecordPerm 校验对某条具体流水所属业务线的动作权限。
func requireCommissionRecordPerm(c *gin.Context, program string, action string) bool {
	if !hasCommissionPerm(c, program, action) {
		denyCommissionAccess(c)
		return false
	}
	return true
}

// ---------- 申请与分销身份 ----------

func AdminListDistributorApplications(c *gin.Context) {
	page := common.GetPageQuery(c)
	apps, total, err := model.ListDistributorApplications(c.Query("status"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(apps)
	common.ApiSuccess(c, page)
}

func AdminReviewDistributorApplication(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid application")
		return
	}
	var input struct {
		Action   string `json:"action"`
		Note     string `json:"note"`
		Version  int    `json:"expected_version"`
		RateBps  *int   `json:"rate_bps"`
		HoldDays *int   `json:"hold_days"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Action == "reject" && strings.TrimSpace(input.Note) == "" {
		common.ApiErrorMsg(c, "A rejection note is required")
		return
	}
	if err := model.ReviewDistributorApplication(id, input.Action, input.Note, input.Version, c.GetInt("id"), input.RateBps, input.HoldDays); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.application_review", map[string]any{"application_id": id, "action": input.Action, "note": input.Note})
	if app, err := model.GetDistributorApplicationById(id); err == nil {
		if input.Action == "approve" {
			service.NotifyDistributorUser(app.UserId, dto.NotifyTypeDistributorLifecycle,
				"分销申请已通过", "你的分销商申请已通过，分销链接已生效。")
		} else {
			service.NotifyDistributorUser(app.UserId, dto.NotifyTypeDistributorLifecycle,
				"分销申请被驳回", fmt.Sprintf("驳回理由：%s。驳回满 24 小时后可重新申请。", input.Note))
		}
	}
	common.ApiSuccess(c, nil)
}

func AdminListDistributorProfiles(c *gin.Context) {
	page := common.GetPageQuery(c)
	profiles, total, err := model.ListDistributorProfiles(page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(profiles)
	common.ApiSuccess(c, page)
}

func AdminUpdateDistributorProfile(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "Invalid distributor")
		return
	}
	var input struct {
		Status   *string         `json:"status"`
		RateBps  json.RawMessage `json:"rate_bps"`
		HoldDays json.RawMessage `json:"hold_days"`
		Note     *string         `json:"note"`
		Version  int             `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	rateBps, err := triStateInt(input.RateBps)
	if err != nil {
		common.ApiErrorMsg(c, "Invalid rate_bps")
		return
	}
	holdDays, err := triStateInt(input.HoldDays)
	if err != nil {
		common.ApiErrorMsg(c, "Invalid hold_days")
		return
	}
	if err := model.UpdateDistributorProfile(userId, input.Status, rateBps, holdDays, input.Note, input.Version, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	if input.Status != nil && *input.Status == model.DistributorStatusSuspended {
		service.NotifyDistributorUser(userId, dto.NotifyTypeDistributorLifecycle,
			"分销资格已停用", "你的分销资格已被停用，分销链接即刻失效，余额与返现由管理员结清处理。")
	}
	audit := map[string]any{"target_user_id": userId}
	if input.Status != nil {
		audit["status"] = *input.Status
	}
	if input.Note != nil {
		audit["note"] = *input.Note
	}
	recordManageAudit(c, "distributor.profile_update", audit)
	common.ApiSuccess(c, nil)
}

// AdminSettleOutDistributor 结清停用分销商（B1.7）：冻结返现整批确认或作废，
// 余额转入账户余额或生成已打款提现单；仅 suspended 档案可结清，理由必填。
func AdminSettleOutDistributor(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "Invalid distributor")
		return
	}
	var input struct {
		Frozen         string            `json:"frozen"`
		Balance        string            `json:"balance"`
		PayoutMethod   string            `json:"payout_method"`
		PayoutRef      string            `json:"payout_ref"`
		PayoutCurrency string            `json:"payout_currency"`
		PayoutAmount   string            `json:"payout_amount"`
		PayoutNetwork  string            `json:"payout_network"`
		Account        map[string]string `json:"account"`
		Reason         string            `json:"reason"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	payout := model.SettleOutPayout{
		Method:   input.PayoutMethod,
		Ref:      input.PayoutRef,
		Currency: input.PayoutCurrency,
		Amount:   input.PayoutAmount,
		Network:  input.PayoutNetwork,
		Account:  input.Account,
	}
	if err := model.SettleOutDistributor(userId, input.Frozen, input.Balance, payout, input.Reason, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.settle_out", map[string]any{"target_user_id": userId, "frozen": input.Frozen, "balance": input.Balance, "reason": input.Reason})
	common.ApiSuccess(c, nil)
}

// ---------- 流水 / 结算 / 欠款 ----------

func AdminListCommissionRecords(c *gin.Context) {
	program, ok := requireCommissionProgramPerm(c, "read")
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	beneficiaryId, _ := strconv.Atoi(c.Query("user_id"))
	records, total, err := model.ListCommissionRecords(model.CommissionRecordFilter{
		Program: program, Status: c.Query("status"), BeneficiaryId: beneficiaryId,
		Start: page.GetStartIdx(), Size: page.GetPageSize(),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(records)
	common.ApiSuccess(c, page)
}

// AdminListInviteAttributions 归属清单（B1.16 管理员核对）。?program= 过滤，
// 空 program 需要任一 read 权限。
func AdminListInviteAttributions(c *gin.Context) {
	program, ok := requireCommissionProgramPerm(c, "read")
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	items, total, err := model.ListInviteAttributions(program, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

// AdminDueCommissionSummary 待确认数量徽标。
func AdminDueCommissionSummary(c *gin.Context) {
	count, quota, waitDays, err := model.DueCommissionSummary(common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"count": count, "quota": quota, "oldest_wait_days": waitDays})
}

// notifyCommissionCredited B4.1：确认结算后按受益人聚合发送"返现到账"通知
// （站内 + 用户设置的外部通道）。结算行由 settleCommissions 回写 settlement_id。
func notifyCommissionCredited(recordIds []int) {
	records, err := model.GetCommissionRecordsByIds(recordIds)
	if err != nil {
		return
	}
	settlementIds := map[int]bool{}
	counts := map[int]int{}
	for _, r := range records {
		if r.SettlementId > 0 {
			settlementIds[r.SettlementId] = true
		}
		counts[r.BeneficiaryUserId]++
	}
	ids := make([]int, 0, len(settlementIds))
	for id := range settlementIds {
		ids = append(ids, id)
	}
	var settlements []model.CommissionSettlement
	if err := model.DB.Where("id IN ?", ids).Find(&settlements).Error; err != nil {
		return
	}
	for _, s := range settlements {
		content := fmt.Sprintf("%d 笔分销返现合计 %s 已结算入账。", counts[s.BeneficiaryUserId], logger.LogQuota(s.CreditedQuota))
		if s.DebtOffsetQuota > 0 {
			content = fmt.Sprintf("%d 笔分销返现合计 %s 已结算，其中 %s 抵扣欠款，%s 入账。",
				counts[s.BeneficiaryUserId], logger.LogQuota(s.GrossQuota), logger.LogQuota(s.DebtOffsetQuota), logger.LogQuota(s.CreditedQuota))
		}
		service.NotifyDistributorUser(s.BeneficiaryUserId, dto.NotifyTypeDistributorCommissionDue, "分销返现到账", content)
	}
}

func AdminConfirmCommissions(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var input struct {
		Ids    []int  `json:"ids"`
		Reason string `json:"reason"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || len(input.Ids) == 0 || len(input.Ids) > 500 {
		common.ApiErrorMsg(c, "Invalid record selection")
		return
	}
	if err := model.ConfirmCommissions(input.Ids, c.GetInt("id"), input.Reason); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.commission_confirm", map[string]any{"count": len(input.Ids), "reason": input.Reason})
	notifyCommissionCredited(input.Ids)
	common.ApiSuccess(c, nil)
}

func AdminAdjustCommissionAvailableAt(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid record")
		return
	}
	record, err := model.GetCommissionRecord(id)
	if err != nil {
		commissionError(c, err)
		return
	}
	if !requireCommissionRecordPerm(c, record.Program, "settle") {
		return
	}
	var input struct {
		AvailableAt int64  `json:"available_at"`
		Reason      string `json:"reason"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.AdjustCommissionAvailableAt(id, input.AvailableAt, input.Reason, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.commission_adjust_time", map[string]any{"record_id": id, "available_at": input.AvailableAt, "reason": input.Reason})
	common.ApiSuccess(c, nil)
}

func AdminReverseCommissionRecord(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid record")
		return
	}
	record, err := model.GetCommissionRecord(id)
	if err != nil {
		commissionError(c, err)
		return
	}
	if !requireCommissionRecordPerm(c, record.Program, "settle") {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || input.Reason == "" {
		common.ApiErrorMsg(c, "A reason is required")
		return
	}
	if err := model.ReverseCommissionRecord(id, input.Reason, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.commission_reverse", map[string]any{"record_id": id, "reason": input.Reason})
	common.ApiSuccess(c, nil)
}

func AdminListCommissionSettlements(c *gin.Context) {
	program, ok := requireCommissionProgramPerm(c, "read")
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	rows, total, err := model.ListCommissionSettlements(userId, program, c.Query("trigger"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

func AdminListCommissionDebts(c *gin.Context) {
	program, ok := requireCommissionProgramPerm(c, "read")
	if !ok {
		return
	}
	userId, _ := strconv.Atoi(c.Query("user_id"))
	debts, err := model.ListCommissionDebts(userId, program)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, debts)
}

func AdminWaiveCommissionDebt(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "Invalid user")
		return
	}
	var input struct {
		BalanceType string `json:"balance_type"`
		Amount      int    `json:"amount_quota"`
		Reason      string `json:"reason"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || input.Reason == "" {
		common.ApiErrorMsg(c, "A reason is required")
		return
	}
	debtProgram := model.CommissionProgramDistributor
	if input.BalanceType == model.CommissionBalanceTypeAffQuota {
		debtProgram = model.CommissionProgramReferral
	}
	if !requireCommissionRecordPerm(c, debtProgram, "settle") {
		return
	}
	if err := model.WaiveCommissionDebt(userId, input.BalanceType, input.Amount, input.Reason, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.debt_waive", map[string]any{"target_user_id": userId, "balance_type": input.BalanceType, "amount": input.Amount, "reason": input.Reason})
	common.ApiSuccess(c, nil)
}

func AdminBackfillCommissions(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var input struct {
		TopupIds []int `json:"topup_ids"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || len(input.TopupIds) == 0 || len(input.TopupIds) > 500 {
		common.ApiErrorMsg(c, "Invalid top-up selection")
		return
	}
	programs, err := model.TopupAttributionPrograms(input.TopupIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(programs) == 0 {
		// 这批充值没有任何归属，补账是空操作；仍要求至少一条业务线的结算权限。
		if !hasCommissionPerm(c, model.CommissionProgramReferral, "settle") && !hasCommissionPerm(c, model.CommissionProgramDistributor, "settle") {
			denyCommissionAccess(c)
			return
		}
	}
	for _, p := range programs {
		if !hasCommissionPerm(c, p, "settle") {
			denyCommissionAccess(c)
			return
		}
	}
	created, err := model.BackfillCommissions(input.TopupIds, c.GetInt("id"))
	if err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.commission_backfill", map[string]any{"topup_ids": input.TopupIds, "created": created})
	common.ApiSuccess(c, gin.H{"created": created})
}

// ---------- 活动 ----------

func AdminListCommissionCampaigns(c *gin.Context) {
	program, ok := requireCommissionProgramPerm(c, "read")
	if !ok {
		return
	}
	page := common.GetPageQuery(c)
	campaigns, total, err := model.ListCommissionCampaigns(program, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(campaigns)
	common.ApiSuccess(c, page)
}

func AdminCreateCommissionCampaign(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var input struct {
		Name            string `json:"name"`
		Program         string `json:"program"`
		RateBps         int    `json:"rate_bps"`
		StartsAt        int64  `json:"starts_at"`
		EndsAt          int64  `json:"ends_at"`
		Description     string `json:"description"`
		ConfirmHighRate bool   `json:"confirm_high_rate"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Program != model.CommissionProgramReferral && input.Program != model.CommissionProgramDistributor {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "program must be referral or distributor"})
		return
	}
	if !requireCommissionRecordPerm(c, input.Program, "manage") {
		return
	}
	campaign, err := model.CreateCommissionCampaign(input.Name, input.Program, input.RateBps, input.StartsAt, input.EndsAt, input.Description, input.ConfirmHighRate, c.GetInt("id"))
	if err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.campaign_create", map[string]any{"campaign_id": campaign.Id, "program": input.Program, "rate_bps": input.RateBps})
	common.ApiSuccess(c, campaign)
}

func AdminUpdateCommissionCampaign(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid campaign")
		return
	}
	target, err := model.GetCommissionCampaign(id)
	if err != nil {
		commissionError(c, err)
		return
	}
	if !requireCommissionRecordPerm(c, target.Program, "manage") {
		return
	}
	var input struct {
		Name            string `json:"name"`
		RateBps         int    `json:"rate_bps"`
		StartsAt        int64  `json:"starts_at"`
		EndsAt          int64  `json:"ends_at"`
		Description     string `json:"description"`
		Version         int    `json:"expected_version"`
		ConfirmHighRate bool   `json:"confirm_high_rate"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.UpdateCommissionCampaign(id, input.Name, input.RateBps, input.StartsAt, input.EndsAt, input.Description, input.ConfirmHighRate, input.Version, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.campaign_update", map[string]any{"campaign_id": id})
	common.ApiSuccess(c, nil)
}

func AdminCancelCommissionCampaign(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid campaign")
		return
	}
	target, err := model.GetCommissionCampaign(id)
	if err != nil {
		commissionError(c, err)
		return
	}
	if !requireCommissionRecordPerm(c, target.Program, "manage") {
		return
	}
	var input struct {
		Version int `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.CancelCommissionCampaign(id, input.Version, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.campaign_cancel", map[string]any{"campaign_id": id})
	common.ApiSuccess(c, nil)
}

// ---------- 提现审核 ----------

func AdminListDistributorWithdrawals(c *gin.Context) {
	page := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	rows, total, err := model.ListDistributorWithdrawals(userId, c.Query("status"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for i := range rows {
		items = append(items, gin.H{
			"id": rows[i].Id, "user_id": rows[i].UserId, "amount_quota": rows[i].AmountQuota,
			"method": rows[i].Method, "payout_currency": rows[i].PayoutCurrency,
			"payout_amount": rows[i].PayoutAmount, "payout_network": rows[i].PayoutNetwork,
			"status": rows[i].Status, "account_tail": model.MaskedWithdrawalAccount(&rows[i]),
			"review_note": rows[i].ReviewNote, "created_at": rows[i].CreatedAt,
			"reviewed_at": rows[i].ReviewedAt, "paid_at": rows[i].PaidAt, "version": rows[i].Version,
		})
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

// AdminGetDistributorWithdrawal 详情：解密收款账户并写审计（distributor.settle）。
func AdminGetDistributorWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid withdrawal")
		return
	}
	withdrawal, err := model.GetDistributorWithdrawal(id)
	if err != nil {
		commissionError(c, err)
		return
	}
	account, err := model.DecryptWithdrawalAccount(withdrawal)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	debt, err := model.GetCommissionDebt(withdrawal.UserId, model.CommissionBalanceTypeDistributor)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	records, _, err := model.ListCommissionRecords(model.CommissionRecordFilter{
		Program: model.CommissionProgramDistributor, BeneficiaryId: withdrawal.UserId,
		Status: model.CommissionStatusFrozen, Start: 0, Size: 100,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "distributor.withdrawal_account_view", map[string]any{"withdrawal_id": id, "target_user_id": withdrawal.UserId})
	common.ApiSuccess(c, gin.H{
		"withdrawal":         withdrawal,
		"account":            account,
		"debt_quota":         debt.DebtQuota,
		"frozen_commissions": records,
	})
}

func AdminReviewDistributorWithdrawal(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid withdrawal")
		return
	}
	var input struct {
		Action  string `json:"action"`
		Note    string `json:"note"`
		Version int    `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Action == "reject" && strings.TrimSpace(input.Note) == "" {
		common.ApiErrorMsg(c, "A rejection note is required")
		return
	}
	if err := model.ReviewDistributorWithdrawal(id, input.Action, input.Note, input.Version, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.withdrawal_review", map[string]any{"withdrawal_id": id, "action": input.Action, "note": input.Note})
	if w, err := model.GetDistributorWithdrawal(id); err == nil {
		if input.Action == "approve" {
			service.NotifyDistributorUser(w.UserId, dto.NotifyTypeDistributorLifecycle,
				"提现申请已通过", fmt.Sprintf("提现单 #%d（%s）审核通过，等待打款。", w.Id, logger.LogQuota(w.AmountQuota)))
		} else {
			service.NotifyDistributorUser(w.UserId, dto.NotifyTypeDistributorLifecycle,
				"提现申请被驳回", fmt.Sprintf("提现单 #%d（%s）被驳回，额度已退回分销余额。理由：%s", w.Id, logger.LogQuota(w.AmountQuota), input.Note))
		}
	}
	common.ApiSuccess(c, nil)
}

func AdminMarkDistributorWithdrawalPaid(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid withdrawal")
		return
	}
	var input struct {
		PayoutRef string `json:"paid_ref"`
		Note      string `json:"note"`
		Version   int    `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.MarkDistributorWithdrawalPaid(id, input.PayoutRef, input.Note, input.Version, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	recordManageAudit(c, "distributor.withdrawal_paid", map[string]any{"withdrawal_id": id, "payout_ref": input.PayoutRef, "note": input.Note})
	if w, err := model.GetDistributorWithdrawal(id); err == nil {
		service.NotifyDistributorUser(w.UserId, dto.NotifyTypeDistributorLifecycle,
			"提现已打款", fmt.Sprintf("提现单 #%d 已打款，方式 %s，金额 %s %s，凭证号 %s。", w.Id, w.Method, w.PayoutAmount, w.PayoutCurrency, input.PayoutRef))
	}
	common.ApiSuccess(c, nil)
}
