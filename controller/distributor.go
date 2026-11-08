package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// GetSelfDistributor 返回 {enabled, apply_enabled, profile?, application?}。
func GetSelfDistributor(c *gin.Context) {
	userId := c.GetInt("id")
	agreementVersion := operation_setting.DistributorAgreementVersion
	agreedVersion, _ := model.LatestTermsAckVersion(userId, model.TermsDocDistributorAgreement, model.TermsKindAgree)
	status := model.GetDistributorStatus(userId)
	data := gin.H{
		"enabled":                operation_setting.DistributorEnabled,
		"apply_enabled":          operation_setting.DistributorApplyEnabled,
		"status":                 status,
		"referral_rules_version": operation_setting.CommissionTermsVersion,
		"agreement_version":      agreementVersion,
		"agreed_version":         agreedVersion,
		// 协议待确认是分销商态：仅 active 档案且同意版本落后时为真。
		"needs_reconfirm": status == model.DistributorStatusActive && agreedVersion < agreementVersion,
	}
	if profile, err := model.GetDistributorProfileByUser(userId); err == nil {
		data["profile"] = profile
	}
	if app := model.GetLatestDistributorApplication(userId); app != nil {
		data["application"] = app
		// B1.9：驳回未满 24 小时时给出可再申请时间，前端据此倒计时并禁用表单。
		if app.Status == model.ApplicationStatusRejected && app.ReviewedAt > 0 {
			if retryAt := app.ReviewedAt + model.DistributorReapplyWaitSeconds; retryAt > common.GetTimestamp() {
				data["reapply_at"] = retryAt
			}
		}
	}
	common.ApiSuccess(c, data)
}

// AcknowledgeDistributorAgreement 确认当前版本《分销协议》；协议更新后未确认
// 时提现/转余额被禁用，调用此接口解除（§1.2.10）。
func AcknowledgeDistributorAgreement(c *gin.Context) {
	var input struct {
		Version int `json:"version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || input.Version <= 0 {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Version != operation_setting.DistributorAgreementVersion {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "TERMS_VERSION_MISMATCH", "message": "Commission terms changed; review the latest terms and resubmit"})
		return
	}
	if err := model.AcknowledgeTermsTx(model.DB, c.GetInt("id"), model.TermsDocDistributorAgreement, model.TermsKindAgree, input.Version); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// SubmitDistributorApplication 提交分销申请。
func SubmitDistributorApplication(c *gin.Context) {
	var input struct {
		Contact            string `json:"contact"`
		ChannelDesc        string `json:"channel_desc"`
		AgreedTermsVersion int    `json:"agreed_terms_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	app, err := model.SubmitDistributorApplication(c.GetInt("id"), input.Contact, input.ChannelDesc, input.AgreedTermsVersion)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrTermsVersionMismatch):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "TERMS_VERSION_MISMATCH", "message": "Commission terms changed; review the latest terms and resubmit"})
		case errors.Is(err, model.ErrDistributorDisabled):
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Distributor applications are not open"})
		case errors.Is(err, model.ErrApplicationExists):
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "A pending application already exists"})
		default:
			var tooSoon *model.ReapplyTooSoonError
			if errors.As(err, &tooSoon) {
				c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "code": "REAPPLY_TOO_SOON", "retry_at": tooSoon.RetryAt, "message": "Reapplication is allowed 24 hours after the last rejection"})
				return
			}
			common.ApiError(c, err)
		}
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "distributor.application_submit", map[string]any{"application_id": app.Id, "success": true})
	service.NotifyDistributorReviewAdmins("新的分销申请", fmt.Sprintf("用户 #%d 提交了分销申请（单号 #%d），待审核。", app.UserId, app.Id))
	common.ApiSuccess(c, app)
}

// WithdrawDistributorApplication 撤回自己的 pending 申请。
func WithdrawDistributorApplication(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid application")
		return
	}
	if err := model.WithdrawDistributorApplication(id, c.GetInt("id")); err != nil {
		commissionError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetDistributorSummary 分销看板 KPI。
func GetDistributorSummary(c *gin.Context) {
	userId := c.GetInt("id")
	profile, err := model.GetDistributorProfileByUser(userId)
	if err != nil {
		commissionError(c, err)
		return
	}
	invited, err := model.CountInvitees(userId, model.CommissionProgramDistributor)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.CommissionTotals(userId, model.CommissionProgramDistributor)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	debt, err := model.GetCommissionDebt(userId, model.CommissionBalanceTypeDistributor)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	dueCount, dueQuota, err := model.DueCommissionForUser(userId, common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rateBps := operation_setting.DistributorDefaultRateBps
	rateSource := model.CommissionRateSourceDefault
	if profile.RateBps != nil {
		rateBps, rateSource = *profile.RateBps, model.CommissionRateSourcePersonal
	}
	var campaign *model.CommissionCampaign
	if active := activeCampaignOrNil(model.CommissionProgramDistributor, common.GetTimestamp()); active != nil {
		rateBps, rateSource, campaign = active.RateBps, model.CommissionRateSourceCampaign, active
	}
	holdDays := operation_setting.DistributorHoldDays
	if profile.HoldDays != nil {
		holdDays = *profile.HoldDays
	}
	common.ApiSuccess(c, gin.H{
		"profile":        profile,
		"invited_count":  invited,
		"rate_bps":       rateBps,
		"rate_source":    rateSource,
		"campaign":       campaign,
		"hold_days":      holdDays,
		"debt":           debt,
		"due_count":      dueCount,
		"due_quota":      dueQuota,
		"frozen_quota":   totals["frozen_quota"],
		"frozen_count":   totals["frozen_count"],
		"settled_quota":  totals["settled_quota"],
		"reversed_quota": totals["reversed_quota"],
		"topup_base":     totals["topup_base_quota"],
	})
}

// GetDistributorTrend 按天趋势。
func GetDistributorTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	rows, err := model.CommissionTrend(c.GetInt("id"), model.CommissionProgramDistributor, days)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// GetDistributorInvitees 脱敏被邀请人列表。
func GetDistributorInvitees(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListInvitees(c.GetInt("id"), model.CommissionProgramDistributor, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// GetDistributorCommissions 分销流水。
func GetDistributorCommissions(c *gin.Context) {
	page := common.GetPageQuery(c)
	records, total, err := model.ListCommissionRecords(model.CommissionRecordFilter{
		Program: model.CommissionProgramDistributor, BeneficiaryId: c.GetInt("id"),
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

// GetDistributorSettlements 分销结算记录。
func GetDistributorSettlements(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListCommissionSettlements(c.GetInt("id"), model.CommissionProgramDistributor, "", page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// GetDistributorWallet 分销钱包信息。
func GetDistributorWallet(c *gin.Context) {
	info, err := model.GetDistributorWalletInfo(c.GetInt("id"))
	if err != nil {
		commissionError(c, err)
		return
	}
	common.ApiSuccess(c, info)
}

// RequestDistributorWithdrawal 提交提现申请；X-Security-Proof 范围 distributor.withdraw。
func RequestDistributorWithdrawal(c *gin.Context) {
	var input struct {
		AmountQuota int               `json:"amount_quota"`
		Method      string            `json:"method"`
		Account     map[string]string `json:"account"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || input.Account == nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	network := input.Account["network"]
	if input.Method != model.WithdrawMethodUSDT {
		network = ""
	}
	contextBytes, err := common.Marshal(service.DistributorWithdrawContext{
		AmountQuota: input.AmountQuota, Method: input.Method, PayoutNetwork: network,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{
		Scope:   service.VerificationScopeDistributorWithdraw,
		Context: contextBytes,
	}) == nil {
		return
	}
	withdrawal, err := model.CreateDistributorWithdrawal(c.GetInt("id"), input.AmountQuota, input.Method, input.Account)
	if err != nil {
		switch {
		case errors.Is(err, common.ErrAccountCryptoSecretMissing):
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Payout account encryption is not configured"})
		case errors.Is(err, model.ErrWithdrawAmountLow):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "WITHDRAW_MIN", "message": "Amount is below the minimum withdrawal"})
		case errors.Is(err, model.ErrWithdrawBalance):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Amount exceeds the withdrawable balance"})
		case errors.Is(err, model.ErrWithdrawPending):
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "An unfinished withdrawal already exists"})
		case errors.Is(err, model.ErrWithdrawMethod):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Payout method is not available"})
		case errors.Is(err, model.ErrWithdrawAccount):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Payout account details are incomplete or invalid"})
		case errors.Is(err, model.ErrDistributorDisabled):
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Withdrawals are not open"})
		case errors.Is(err, model.ErrTermsVersionMismatch):
			c.JSON(http.StatusForbidden, gin.H{"success": false, "code": "AGREEMENT_RECONFIRM", "message": "Distributor agreement updated; review and confirm the latest version before withdrawing"})
		default:
			common.ApiError(c, err)
		}
		return
	}
	service.NotifyDistributorSettleAdmins("新的分销提现申请", "有新的分销提现申请待审核，请在分销管理中处理。")
	common.ApiSuccess(c, withdrawal)
}

// GetDistributorWithdrawals 自己的提现记录（账户信息脱敏）。
func GetDistributorWithdrawals(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListDistributorWithdrawals(c.GetInt("id"), "", page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for i := range rows {
		items = append(items, gin.H{
			"id": rows[i].Id, "amount_quota": rows[i].AmountQuota, "method": rows[i].Method,
			"payout_currency": rows[i].PayoutCurrency, "payout_amount": rows[i].PayoutAmount,
			"payout_network": rows[i].PayoutNetwork, "status": rows[i].Status,
			"account_tail": model.MaskedWithdrawalAccount(&rows[i]),
			"review_note":  rows[i].ReviewNote, "created_at": rows[i].CreatedAt,
			"reviewed_at": rows[i].ReviewedAt, "paid_at": rows[i].PaidAt, "version": rows[i].Version,
		})
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

// TransferDistributorBalance 分销余额转入账户余额。
func TransferDistributorBalance(c *gin.Context) {
	var input struct {
		AmountQuota int `json:"amount_quota"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.TransferDistributorBalanceToQuota(c.GetInt("id"), input.AmountQuota); err != nil {
		switch {
		case errors.Is(err, model.ErrWithdrawBalance):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Amount exceeds the withdrawable balance"})
		case errors.Is(err, model.ErrDistributorNotFound):
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Requires an active distributor profile"})
		case errors.Is(err, model.ErrTermsVersionMismatch):
			c.JSON(http.StatusForbidden, gin.H{"success": false, "code": "AGREEMENT_RECONFIRM", "message": "Distributor agreement updated; review and confirm the latest version before transferring"})
		default:
			common.ApiError(c, err)
		}
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "distributor.balance_transfer", map[string]any{"amount_quota": input.AmountQuota, "success": true})
	common.ApiSuccess(c, nil)
}
