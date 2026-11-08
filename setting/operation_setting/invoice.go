package operation_setting

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// 申请发票选项。手续费 = 开票金额 × 费率，从用户余额额度中扣除；
// 三种发票类型的费率都可配置（基点）。

const (
	InvoiceTypeNormalFast = "normal_fast" // 普通发票（当天出票）
	InvoiceTypeNormal     = "normal"      // 普通发票（1-3 个工作日）
	InvoiceTypeVat        = "vat"         // 增值税专用发票

	DefaultInvoiceMinCNY = "1.00"
	DefaultInvoiceMaxCNY = "1000000.00"
)

var (
	InvoiceEnabled          = false
	InvoiceMinCNY           = DefaultInvoiceMinCNY
	InvoiceMaxCNY           = DefaultInvoiceMaxCNY
	InvoiceFeeRateFastBps   = 1100
	InvoiceFeeRateNormalBps = 1000
	InvoiceFeeRateVatBps    = 1600

	// InvoiceTypesText 每行一个类型：key|label|rate_bps。
	// 为空时回落到默认三档（费率仍取上面的三个独立配置）。
	InvoiceTypesText      = ""
	InvoiceCategoriesText = "Production & living services\nInformation technology services\nSoftware services"
	InvoiceItemsText      = "Technical service fee\nInformation service fee\nSoftware service fee"
)

type InvoiceTypeDef struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	RateBps int    `json:"rate_bps"`
}

func defaultInvoiceTypes() []InvoiceTypeDef {
	return []InvoiceTypeDef{
		{Key: InvoiceTypeNormalFast, Label: "Standard (same-day)", RateBps: InvoiceFeeRateFastBps},
		{Key: InvoiceTypeNormal, Label: "Standard (1–3 business days)", RateBps: InvoiceFeeRateNormalBps},
		{Key: InvoiceTypeVat, Label: "VAT special", RateBps: InvoiceFeeRateVatBps},
	}
}

// InvoiceTypes 解析管理员维护的类型清单；任一行格式不合法即丢弃该行，
// 全部无效时回落默认三档，保证 options 接口永远不返回空列表。
func InvoiceTypes() []InvoiceTypeDef {
	var out []InvoiceTypeDef
	for line := range strings.Lines(InvoiceTypesText) {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) != 3 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		label := strings.TrimSpace(parts[1])
		rate, err := strconv.Atoi(strings.TrimSpace(parts[2]))
		if key == "" || label == "" || err != nil || rate < 0 || len(key) > 16 || len(label) > 64 {
			continue
		}
		out = append(out, InvoiceTypeDef{Key: key, Label: label, RateBps: rate})
	}
	if len(out) == 0 {
		return defaultInvoiceTypes()
	}
	return out
}

func splitOptionLines(raw string) []string {
	var out []string
	for line := range strings.Lines(raw) {
		line = strings.TrimSpace(line)
		if line == "" || len(line) > 64 {
			continue
		}
		out = append(out, line)
	}
	return out
}

func InvoiceCategories() []string {
	return splitOptionLines(InvoiceCategoriesText)
}

func InvoiceItems() []string {
	return splitOptionLines(InvoiceItemsText)
}

func InvoiceFeeRateBps(invoiceType string) (int, bool) {
	for _, t := range InvoiceTypes() {
		if t.Key == invoiceType {
			return t.RateBps, true
		}
	}
	return 0, false
}

func InvoiceChoiceAllowed(list []string, value string) bool {
	if len(list) == 0 {
		return true
	}
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}

func ParseInvoiceAmountCny(raw string) (decimal.Decimal, error) {
	amount, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil || !amount.IsPositive() {
		return decimal.Zero, err
	}
	if amount.Exponent() < -2 {
		amount = amount.Round(2)
	}
	return amount, nil
}

func invoiceBound(raw string, fallback string) decimal.Decimal {
	v, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil || !v.IsPositive() {
		return decimal.RequireFromString(fallback)
	}
	return v
}

func InvoiceBounds() (decimal.Decimal, decimal.Decimal) {
	return invoiceBound(InvoiceMinCNY, DefaultInvoiceMinCNY), invoiceBound(InvoiceMaxCNY, DefaultInvoiceMaxCNY)
}

// InvoiceFee 计算开票手续费：人民币金额与折算站内额度（向上取整）。
func InvoiceFee(amountCny decimal.Decimal, rateBps int) (decimal.Decimal, int, error) {
	feeCny := amountCny.Mul(decimal.NewFromInt(int64(rateBps))).Div(decimal.NewFromInt(10000)).Round(2)
	rate := decimal.NewFromFloat(USDExchangeRate)
	if !rate.IsPositive() {
		rate = decimal.NewFromFloat(7.3)
	}
	quotaDec := feeCny.Div(rate).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Ceil()
	quota, clampErr := common.QuotaFromDecimalChecked(quotaDec)
	if clampErr != nil {
		return decimal.Zero, 0, clampErr
	}
	return feeCny, quota, nil
}
