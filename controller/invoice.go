package controller

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

// GetInvoiceOptions 开票申请页所需的开关、金额范围、管理员维护的
// 类型/类目/项目清单，以及用户最近一次开票信息（用于表单预填）。
func GetInvoiceOptions(c *gin.Context) {
	min, max := operation_setting.InvoiceBounds()
	data := gin.H{
		"enabled":    operation_setting.InvoiceEnabled,
		"min_cny":    min.StringFixed(2),
		"max_cny":    max.StringFixed(2),
		"types":      operation_setting.InvoiceTypes(),
		"categories": operation_setting.InvoiceCategories(),
		"items":      operation_setting.InvoiceItems(),
		"direct_pay": isEpayTopUpEnabled(),
	}
	received, consumed, available, err := model.InvoiceSummary(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	data["received_cny"] = received.StringFixed(2)
	data["invoiced_cny"] = consumed.StringFixed(2)
	data["invoiceable_cny"] = available.StringFixed(2)
	var last model.InvoiceRequest
	if err := model.DB.Where("user_id = ?", c.GetInt("id")).Order("id DESC").Take(&last).Error; err == nil {
		data["profile"] = gin.H{
			"buyer_name": last.BuyerName,
			"tax_no":     last.TaxNo,
			"category":   last.Category,
			"item":       last.Item,
			"email":      last.Email,
			"details":    last.Details,
		}
	}
	common.ApiSuccess(c, data)
}

// ListMyInvoices 当前用户的发票申请列表。
func ListMyInvoices(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListInvoices(c.GetInt("id"), c.Query("status"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// CreateInvoice 提交开票申请；balance 结算在同一事务内从余额扣除手续费，
// direct 结算创建 awaiting_payment 申请并拉起收银台订单，回调核销后转待开票。
func CreateInvoice(c *gin.Context) {
	var input model.CreateInvoiceInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Settlement == model.InvoiceSettlementDirect {
		createDirectInvoice(c, input)
		return
	}
	invoice, err := model.CreateInvoiceRequest(c.GetInt("id"), input)
	if err != nil {
		writeInvoiceError(c, err)
		return
	}
	common.ApiSuccess(c, invoice)
}

// createDirectInvoice 直接支付：校验字段后拉起收银台订单，申请与订单
// 同事务落库；核销回调把申请转回 pending 供管理员审核。
func createDirectInvoice(c *gin.Context, input model.CreateInvoiceInput) {
	id := c.GetInt("id")
	tradeNo := fmt.Sprintf("INV%dNO%s%d", id, common.GetRandomString(6), time.Now().Unix())
	invoice, err := model.PrepareDirectInvoice(id, input, tradeNo)
	if err != nil {
		writeInvoiceError(c, err)
		return
	}
	client := GetEpayClient()
	if client == nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "code": "INVOICE_DIRECT_PAY", "message": "Direct payment is not available"})
		return
	}
	payMethod := operation_setting.PayMethods[0]["type"]
	returnUrl, _ := url.Parse(strings.TrimRight(system_setting.ServerAddress, "/") + "/invoice")
	notifyUrl, _ := url.Parse(service.GetCallbackAddress() + "/api/user/epay/invoice_notify")
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           payMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("INVF%d", id),
		Money:          invoice.FeeCny,
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 发票手续费拉起支付失败 user_id=%d trade_no=%s fee_cny=%s error=%q", id, tradeNo, invoice.FeeCny, err.Error()))
		common.ApiErrorMsg(c, "Failed to create the cashier order")
		return
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          0,
		Money:           decimal.RequireFromString(invoice.FeeCny).InexactFloat64(),
		TradeNo:         tradeNo,
		PaymentMethod:   "invoice_fee",
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := model.PersistDirectInvoiceOrder(invoice, topUp); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 发票订单落库失败 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		common.ApiErrorMsg(c, "Failed to create the invoice order")
		return
	}
	common.ApiSuccess(c, gin.H{
		"invoice":        invoice,
		"payment_url":    uri,
		"payment_params": params,
	})
}

func writeInvoiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrInvoiceDisabled):
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Invoicing is not enabled"})
	case errors.Is(err, model.ErrInvoiceBalance):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "INVOICE_BALANCE", "message": "Balance is below the invoice fee"})
	case errors.Is(err, model.ErrInvoiceAmountRange):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "INVOICE_AMOUNT", "message": "Amount is out of range"})
	case errors.Is(err, model.ErrInvoiceQuotaExceeded):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "INVOICE_QUOTA", "message": "Amount exceeds the invoiceable balance"})
	case errors.Is(err, model.ErrInvoiceFields):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Required invoice fields are missing or invalid"})
	default:
		common.ApiError(c, err)
	}
}

// InvoiceEpayNotify 发票手续费的收银台回调；验签后核销 awaiting_payment 申请。
func InvoiceEpayNotify(c *gin.Context) {
	if !isEpayWebhookEnabled() {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	var params map[string]string
	if c.Request.Method == "POST" {
		if err := c.Request.ParseForm(); err != nil {
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}
	if len(params) == 0 {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	client := GetEpayClient()
	if client == nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		LockOrder(verifyInfo.ServiceTradeNo)
		defer UnlockOrder(verifyInfo.ServiceTradeNo)
		if _, err := model.SettleInvoiceEpay(verifyInfo.ServiceTradeNo, verifyInfo.Type); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 发票手续费核销失败 trade_no=%s error=%q", verifyInfo.ServiceTradeNo, err.Error()))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
	}
	_, _ = c.Writer.Write([]byte("success"))
}
func AdminListInvoices(c *gin.Context) {
	page := common.GetPageQuery(c)
	rows, total, err := model.ListInvoices(0, c.Query("status"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(rows)
	common.ApiSuccess(c, page)
}

// AdminReviewInvoice 推进状态：processing / issued / rejected（驳回退费）。
func AdminReviewInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid invoice id")
		return
	}
	var input struct {
		Action          string `json:"action"`
		Note            string `json:"note"`
		FileUrl         string `json:"file_url"`
		ExpectedVersion int    `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if input.Action != model.InvoiceStatusProcessing &&
		input.Action != model.InvoiceStatusIssued &&
		input.Action != model.InvoiceStatusRejected {
		common.ApiErrorMsg(c, "Invalid action")
		return
	}
	if input.Action == model.InvoiceStatusRejected && strings.TrimSpace(input.Note) == "" {
		common.ApiErrorMsg(c, "A rejection note is required")
		return
	}
	invoice, err := model.ReviewInvoiceRequest(id, c.GetInt("id"), input.Action, input.Note, input.FileUrl, input.ExpectedVersion)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrInvoiceNotFound):
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Invoice request not found"})
		case errors.Is(err, model.ErrInvoiceVersion):
			c.JSON(http.StatusConflict, gin.H{"success": false, "code": "VERSION_CONFLICT", "message": "Invoice request changed, refresh and retry"})
		case errors.Is(err, model.ErrInvoiceStatus):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invoice request is not in a reviewable status"})
		case errors.Is(err, model.ErrInvoiceFileUrl):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "INVALID_FILE_URL", "message": "Invoice file url must be http or https"})
		default:
			common.ApiError(c, err)
		}
		return
	}
	recordManageAudit(c, "invoice.review", map[string]any{"invoice_id": id, "action": input.Action, "note": input.Note})
	if input.Action == model.InvoiceStatusIssued {
		var user model.User
		if err := model.DB.Select("username").Where("id = ?", invoice.UserId).Take(&user).Error; err == nil {
			go model.NotifyInvoiceIssued(invoice, user.Username)
		}
	}
	common.ApiSuccess(c, invoice)
}
