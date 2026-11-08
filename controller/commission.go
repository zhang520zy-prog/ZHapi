package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ---------- 用户侧：推广 ----------

// GetReferralSummary 推广汇总：邀请人数、累计返现、当前比例、欠款。
func GetReferralSummary(c *gin.Context) {
	userId := c.GetInt("id")
	invited, err := model.CountInvitees(userId, model.CommissionProgramReferral)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.CommissionTotals(userId, model.CommissionProgramReferral)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	debt, err := model.GetCommissionDebt(userId, model.CommissionBalanceTypeAffQuota)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rateBps := operation_setting.ReferralRateBps
	rateSource := model.CommissionRateSourceDefault
	var campaign *model.CommissionCampaign
	now := common.GetTimestamp()
	if active := activeCampaignOrNil(model.CommissionProgramReferral, now); active != nil {
		rateBps = active.RateBps
		rateSource = model.CommissionRateSourceCampaign
		campaign = active
	}
	common.ApiSuccess(c, gin.H{
		"enabled":          operation_setting.ReferralCommissionEnabled,
		"invited_count":    invited,
		"total_commission": totals["settled_quota"],
		"frozen_quota":     totals["frozen_quota"],
		"frozen_count":     totals["frozen_count"],
		"reversed_quota":   totals["reversed_quota"],
		"topup_base":       totals["topup_base_quota"],
		"rate_bps":         rateBps,
		"rate_source":      rateSource,
		"campaign":         campaign,
		"debt":             debt,
	})
}

func activeCampaignOrNil(program string, now int64) *model.CommissionCampaign {
	campaigns, err := model.ListVisibleCampaigns(now)
	if err != nil {
		return nil
	}
	for i := range campaigns {
		if campaigns[i].Program == program && campaigns[i].StartsAt <= now {
			return &campaigns[i]
		}
	}
	return nil
}

// GetReferralInvitees 推广被邀请人列表（用户名脱敏）。
func GetReferralInvitees(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListInvitees(c.GetInt("id"), model.CommissionProgramReferral, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// GetReferralCommissions 推广返现流水（被邀请人脱敏）。
func GetReferralCommissions(c *gin.Context) {
	page := common.GetPageQuery(c)
	records, total, err := model.ListCommissionRecords(model.CommissionRecordFilter{
		Program: model.CommissionProgramReferral, BeneficiaryId: c.GetInt("id"),
		Status: c.Query("status"), Start: page.GetStartIdx(), Size: page.GetPageSize(),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(records))
	for i := range records {
		items = append(items, commissionRecordDTO(&records[i], true))
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

func commissionRecordDTO(r *model.CommissionRecord, maskInvitee bool) gin.H {
	dto := gin.H{
		"id": r.Id, "program": r.Program, "source_type": r.SourceType, "source_id": r.SourceId,
		"beneficiary_user_id": r.BeneficiaryUserId, "base_quota": r.BaseQuota,
		"paid_money": r.PaidMoney, "currency": r.Currency,
		"rate_bps": r.RateBps, "rate_source": r.RateSource, "campaign_id": r.CampaignId,
		"commission_quota": r.CommissionQuota, "status": r.Status,
		"hold_days": r.HoldDays, "available_at": r.AvailableAt,
		"settlement_id": r.SettlementId, "reversed_quota": r.ReversedQuota,
		"terms_version": r.TermsVersion, "period_day": r.PeriodDay,
		"created_at": r.CreatedAt, "updated_at": r.UpdatedAt,
	}
	if maskInvitee {
		dto["invitee"] = model.MaskInviteeName(r.InviteeUserId)
	} else {
		dto["invitee_user_id"] = r.InviteeUserId
	}
	if r.Status == model.CommissionStatusFrozen && r.AvailableAt <= common.GetTimestamp() {
		dto["display_status"] = "due"
	} else {
		dto["display_status"] = r.Status
	}
	return dto
}

// GetSelfCommissionSettlements 推广页的结算记录；分销页另有 /distributor/settlements。
func GetSelfCommissionSettlements(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListCommissionSettlements(c.GetInt("id"), model.CommissionProgramReferral, c.Query("trigger"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// GetSelfCommissionDebts 推广页的欠款；分销欠款走分销钱包接口。
func GetSelfCommissionDebts(c *gin.Context) {
	debts, err := model.ListCommissionDebts(c.GetInt("id"), model.CommissionProgramReferral)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, debts)
}

// ---------- 佣金细则与活动（所有登录用户） ----------

// GetCommissionTerms 佣金细则所需数据。
func GetCommissionTerms(c *gin.Context) {
	userId := c.GetInt("id")
	profile := model.GetActiveDistributorProfile(userId)
	var myRateBps *int
	if profile != nil {
		myRateBps = profile.RateBps
	}
	campaigns, err := model.ListVisibleCampaigns(common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	referralReadVer, _ := model.LatestTermsAckVersion(userId, model.TermsDocReferralRules, model.TermsKindRead)
	agreementVer, _ := model.LatestTermsAckVersion(userId, model.TermsDocDistributorAgreement, model.TermsKindAgree)
	common.ApiSuccess(c, gin.H{
		"version":                       operation_setting.CommissionTermsVersion,
		"referral_rules_version":        operation_setting.CommissionTermsVersion,
		"distributor_agreement_version": operation_setting.DistributorAgreementVersion,
		"my_referral_read_version":      referralReadVer,
		"my_agreement_version":          agreementVer,
		"referral_rate_bps":             operation_setting.ReferralRateBps,
		"distributor_default_rate":      operation_setting.DistributorDefaultRateBps,
		"distributor_hold_days":         operation_setting.DistributorHoldDays,
		"my_distributor_rate_bps":       myRateBps,
		"distributor_withdraw_min":      operation_setting.DistributorWithdrawMinCNY,
		"distributor_withdraw_enabled":  operation_setting.DistributorWithdrawEnabled,
		"referral_extra":                operation_setting.ReferralTermsExtra,
		"distributor_extra":             operation_setting.DistributorTermsExtra,
		"campaigns":                     campaigns,
		"referral_enabled":              operation_setting.ReferralCommissionEnabled,
		"distributor_enabled":           operation_setting.DistributorEnabled,
	})
}

// AcknowledgeTermsRead 记录"已读"（F4.1 规则弹窗关闭时调用）；版本取服务端当前值。
func AcknowledgeTermsRead(c *gin.Context) {
	var input struct {
		Doc string `json:"doc"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil ||
		(input.Doc != model.TermsDocReferralRules && input.Doc != model.TermsDocDistributorAgreement) {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	version := model.TermsDocCurrentVersion(input.Doc)
	if err := model.AcknowledgeTermsTx(model.DB, c.GetInt("id"), input.Doc, model.TermsKindRead, version); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"doc": input.Doc, "version": version})
}

// GetActiveCommissionCampaigns 进行中与即将开始的活动。
func GetActiveCommissionCampaigns(c *gin.Context) {
	campaigns, err := model.ListVisibleCampaigns(common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaigns)
}

// ---------- 分销到期提醒（系统任务） ----------

// distributorDueReminderHandler 每 10 分钟把刚到期的分销流水标记提醒并通知有
// distributor.settle 权限的管理员；只发提醒，不动钱。
type distributorDueReminderHandler struct{}

func (distributorDueReminderHandler) Type() string            { return "distributor_commission_due" }
func (distributorDueReminderHandler) Interval() time.Duration { return 10 * time.Minute }
func (distributorDueReminderHandler) NewPayload() any         { return nil }
func (distributorDueReminderHandler) Enabled() bool {
	return operation_setting.DistributorEnabled
}

func (distributorDueReminderHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	now := common.GetTimestamp()
	summary, err := model.MarkDueCommissionsNotified(now)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	notified := 0
	for range summary {
		notified++
	}
	if notified > 0 {
		count, quota, _, err := model.DueCommissionSummary(now)
		if err != nil {
			finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
			return
		}
		service.NotifyDistributorSettleAdmins(
			"分销返现已到期，待确认",
			fmt.Sprintf("有 %d 笔分销返现到期，合计 %v，请在分销管理中确认。", count, quota),
		)
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded,
		map[string]int{"newly_due": notified}, nil)
}

// distributorDueDigestHandler 每天上午 10 点（站点时区）汇总提醒一次所有
// "到期但仍未确认" 的分销返现。Enabled() 折叠了"今天 10 点后还没发过"的判定，
// 靠系统任务的 DB 租约保证多节点只发一次。
type distributorDueDigestHandler struct{}

func (distributorDueDigestHandler) Type() string            { return "distributor_commission_due_digest" }
func (distributorDueDigestHandler) Interval() time.Duration { return 30 * time.Minute }
func (distributorDueDigestHandler) NewPayload() any         { return nil }

func (distributorDueDigestHandler) Enabled() bool {
	if !operation_setting.DistributorEnabled {
		return false
	}
	now := time.Now()
	today10 := time.Date(now.Year(), now.Month(), now.Day(), 10, 0, 0, 0, now.Location())
	if now.Before(today10) {
		return false
	}
	latest, err := model.GetLatestSystemTasks([]string{"distributor_commission_due_digest"})
	if err != nil {
		return true
	}
	task := latest["distributor_commission_due_digest"]
	if task == nil || task.Status == model.SystemTaskStatusFailed {
		return true
	}
	return task.CreatedAt < today10.Unix()
}

func (distributorDueDigestHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	now := common.GetTimestamp()
	count, quota, waitDays, err := model.DueCommissionSummary(now)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	if count > 0 {
		service.NotifyDistributorSettleAdmins(
			"分销返现待确认汇总",
			fmt.Sprintf("截至今日仍有 %d 笔分销返现到期未确认，合计 %v，最久已等待 %d 天，请及时处理。", count, quota, waitDays),
		)
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded,
		map[string]int{"due_count": count, "due_quota": quota, "oldest_wait_days": waitDays}, nil)
}

// ---------- 工具 ----------

func commissionError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrCommissionConflict), errors.Is(err, model.ErrDistributorConflict):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "State changed; refresh and retry"})
	case errors.Is(err, model.ErrCommissionNotFound), errors.Is(err, model.ErrDistributorNotFound), errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Record not found"})
	case errors.Is(err, model.ErrCommissionEarlyNoReason):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "A reason is required to confirm commissions before their available date"})
	case errors.Is(err, model.ErrCampaignOverlap):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Campaign time range overlaps an existing campaign"})
	case errors.Is(err, model.ErrCampaignHighRate):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "COMMISSION_HIGH_RATE", "message": "Rate above 30% requires confirm_high_rate"})
	case errors.Is(err, model.ErrCampaignStarted):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "A started campaign can only be ended early"})
	case errors.Is(err, model.ErrDebtExceeds):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Amount exceeds outstanding debt"})
	case errors.Is(err, model.ErrWithdrawPending):
		c.JSON(http.StatusConflict, gin.H{"success": false, "code": "WITHDRAWAL_UNFINISHED", "message": "Finish the pending withdrawal before settling out"})
	default:
		common.ApiError(c, err)
	}
}

// GetReferralTrend 推广返现按天趋势（days 限 7/30/90）。
func GetReferralTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	rows, err := model.CommissionTrend(c.GetInt("id"), model.CommissionProgramReferral, days)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// TransferReferralToQuota 推广返现余额转入账户余额。
func TransferReferralToQuota(c *gin.Context) {
	var req struct {
		AmountQuota int `json:"amount_quota"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.AmountQuota <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid amount"})
		return
	}
	if err := model.TransferReferralQuotaToQuota(c.GetInt("id"), req.AmountQuota); err != nil {
		if errors.Is(err, model.ErrCommissionInsufficient) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Insufficient referral balance"})
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
