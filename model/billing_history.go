package model

import (
	"errors"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 账单明细（B3.8）：GET /api/user/billing/self 的只读合并视图。
// 三个来源：top_ups（排除订阅镜像行与发票手续费行）、subscription_orders、
// 发票手续费（top_ups payment_method='invoice_fee' ∪ invoice_requests
// 余额结算且已扣费）。不改写入逻辑，不加表不加列。

const (
	BillingKindAll          = "all"
	BillingKindTopup        = "topup"
	BillingKindSubscription = "subscription"
	BillingKindInvoiceFee   = "invoice_fee"
)

// BillingEntry 单条账单记录。金额一律字符串、按币种小数位输出；
// fee_money 在快照缺失的老订单（currency=”）上为 null；quota 可空。
type BillingEntry struct {
	Kind            string  `json:"kind"`
	TradeNo         string  `json:"trade_no"`
	Status          string  `json:"status"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Title           string  `json:"title"`
	PaymentProvider string  `json:"payment_provider"`
	PaymentMethod   string  `json:"payment_method"`
	CreditedMoney   string  `json:"credited_money"`
	FeeMoney        *string `json:"fee_money"`
	TotalMoney      string  `json:"total_money"`
	FeeRateBps      int     `json:"fee_rate_bps"`
	Currency        string  `json:"currency"`
	Quota           *int64  `json:"quota"`
}

type billingRow struct {
	createTime int64
	id         int
	entry      BillingEntry
}

// billingMoneyStrings 输出 credited/total/fee 三个金额字符串。
// 快照缺失的老订单（currency 为空）fee 为 null，credited/total 用 money。
func billingMoneyStrings(money float64, credited, fee decimal.Decimal, currency string) (string, string, *string) {
	if currency == "" {
		m := decimal.NewFromFloat(money).StringFixed(2)
		return m, m, nil
	}
	units := paymentMinorUnits(currency)
	f := fee.StringFixed(units)
	return credited.StringFixed(units), credited.Add(fee).StringFixed(units), &f
}

func billingTopUpEntry(t *TopUp) BillingEntry {
	// 直付的发票手续费（invoice_fee 行）没有 credited/fee 快照：整笔
	// money 都是手续费，输出与余额结算（invoice_requests）一致的
	// 三列格式——到账 0、手续费=实付=money、币种 CNY。
	if t.PaymentMethod == "invoice_fee" {
		money := decimal.NewFromFloat(t.Money).StringFixed(2)
		return BillingEntry{
			Kind:            BillingKindInvoiceFee,
			TradeNo:         t.TradeNo,
			Status:          t.Status,
			CreateTime:      t.CreateTime,
			CompleteTime:    t.CompleteTime,
			PaymentProvider: t.PaymentProvider,
			PaymentMethod:   t.PaymentMethod,
			CreditedMoney:   "0.00",
			FeeMoney:        &money,
			TotalMoney:      money,
			FeeRateBps:      t.FeeRateBps,
			Currency:        "CNY",
		}
	}
	credited, total, fee := billingMoneyStrings(t.Money, t.CreditedMoney, t.FeeMoney, t.Currency)
	var quota *int64
	if q, err := creditedTopUpQuota(t); err == nil && q > 0 {
		v := int64(q)
		quota = &v
	}
	return BillingEntry{
		Kind:            BillingKindTopup,
		TradeNo:         t.TradeNo,
		Status:          t.Status,
		CreateTime:      t.CreateTime,
		CompleteTime:    t.CompleteTime,
		PaymentProvider: t.PaymentProvider,
		PaymentMethod:   t.PaymentMethod,
		CreditedMoney:   credited,
		FeeMoney:        fee,
		TotalMoney:      total,
		FeeRateBps:      t.FeeRateBps,
		Currency:        t.Currency,
		Quota:           quota,
	}
}

func billingSubscriptionEntry(o *SubscriptionOrder, title string) BillingEntry {
	credited, total, fee := billingMoneyStrings(o.Money, o.CreditedMoney, o.FeeMoney, o.Currency)
	var quota *int64
	if o.PaymentMethod == PaymentMethodBalance {
		if v, ok := parseChargedQuota(o.ProviderPayload); ok {
			quota = &v
		}
	}
	return BillingEntry{
		Kind:            BillingKindSubscription,
		TradeNo:         o.TradeNo,
		Status:          o.Status,
		CreateTime:      o.CreateTime,
		CompleteTime:    o.CompleteTime,
		Title:           title,
		PaymentProvider: o.PaymentProvider,
		PaymentMethod:   o.PaymentMethod,
		CreditedMoney:   credited,
		FeeMoney:        fee,
		TotalMoney:      total,
		FeeRateBps:      o.FeeRateBps,
		Currency:        o.Currency,
		Quota:           quota,
	}
}

// parseChargedQuota 解析余额购买订单 provider_payload 里的 charged_quota=N。
func parseChargedQuota(payload string) (int64, bool) {
	raw, ok := strings.CutPrefix(strings.TrimSpace(payload), "charged_quota=")
	if !ok {
		return 0, false
	}
	v, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || v <= 0 {
		return 0, false
	}
	return v, true
}

func billingInvoiceRequestEntry(inv *InvoiceRequest) BillingEntry {
	fee := inv.FeeCny
	return BillingEntry{
		Kind:            BillingKindInvoiceFee,
		TradeNo:         inv.TradeNo,
		Status:          inv.Status,
		CreateTime:      inv.CreatedAt,
		CompleteTime:    inv.FeePaidAt,
		PaymentProvider: PaymentProviderBalance,
		PaymentMethod:   PaymentMethodBalance,
		CreditedMoney:   "0.00",
		FeeMoney:        &fee,
		TotalMoney:      fee,
		FeeRateBps:      inv.FeeRateBps,
		Currency:        "CNY",
	}
}

func withBillingTradeNoKeyword(query *gorm.DB, keyword string) (*gorm.DB, error) {
	if keyword == "" {
		return query, nil
	}
	pattern, err := sanitizeLikePattern(keyword)
	if err != nil {
		return nil, err
	}
	return query.Where("trade_no LIKE ? ESCAPE '!'", pattern), nil
}

// billingSource 汇总一种来源的 COUNT 与前 offset+limit 条。
type billingSource struct {
	count int64
	rows  []billingRow
}

func queryBillingTopUps(userId int, kind string, keyword string, cutoff int64, fetch int) (*billingSource, error) {
	sub := DB.Model(&SubscriptionOrder{}).Select("trade_no").Where("user_id = ?", userId)
	query := DB.Model(&TopUp{}).
		Where("user_id = ? AND create_time >= ?", userId, cutoff).
		Where("trade_no NOT IN (?)", sub)
	if kind == BillingKindInvoiceFee {
		query = query.Where("payment_method = ?", "invoice_fee")
	} else {
		query = query.Where("payment_method IS NULL OR payment_method <> ?", "invoice_fee")
	}
	var err error
	query, err = withBillingTradeNoKeyword(query, keyword)
	if err != nil {
		return nil, err
	}
	src := &billingSource{}
	if err = query.Count(&src.count).Error; err != nil {
		return nil, err
	}
	var topups []TopUp
	if err = query.Order("create_time DESC, id DESC").Limit(fetch).Find(&topups).Error; err != nil {
		return nil, err
	}
	for i := range topups {
		entry := billingTopUpEntry(&topups[i])
		entry.Kind = kind
		src.rows = append(src.rows, billingRow{createTime: topups[i].CreateTime, id: topups[i].Id, entry: entry})
	}
	return src, nil
}

func queryBillingSubscriptions(userId int, keyword string, fetch int) (*billingSource, error) {
	query := DB.Model(&SubscriptionOrder{}).Where("user_id = ?", userId)
	var err error
	query, err = withBillingTradeNoKeyword(query, keyword)
	if err != nil {
		return nil, err
	}
	src := &billingSource{}
	if err = query.Count(&src.count).Error; err != nil {
		return nil, err
	}
	var orders []SubscriptionOrder
	if err = query.Order("create_time DESC, id DESC").Limit(fetch).Find(&orders).Error; err != nil {
		return nil, err
	}
	// 套餐名按 id 批量查，被删的套餐留空字符串（等价 LEFT JOIN）。
	planIds := make([]int, 0, len(orders))
	for i := range orders {
		planIds = append(planIds, orders[i].PlanId)
	}
	titles := map[int]string{}
	if len(planIds) > 0 {
		var plans []SubscriptionPlan
		if err = DB.Model(&SubscriptionPlan{}).Select("id", "title").Where("id IN ?", planIds).Find(&plans).Error; err != nil {
			return nil, err
		}
		for i := range plans {
			titles[plans[i].Id] = plans[i].Title
		}
	}
	for i := range orders {
		src.rows = append(src.rows, billingRow{
			createTime: orders[i].CreateTime,
			id:         orders[i].Id,
			entry:      billingSubscriptionEntry(&orders[i], titles[orders[i].PlanId]),
		})
	}
	return src, nil
}

func queryBillingInvoiceRequests(userId int, keyword string, cutoff int64, fetch int) (*billingSource, error) {
	query := DB.Model(&InvoiceRequest{}).
		Where("user_id = ? AND settlement = ? AND fee_paid_at > 0 AND created_at >= ?",
			userId, InvoiceSettlementBalance, cutoff)
	var err error
	query, err = withBillingTradeNoKeyword(query, keyword)
	if err != nil {
		return nil, err
	}
	src := &billingSource{}
	if err = query.Count(&src.count).Error; err != nil {
		return nil, err
	}
	var invoices []InvoiceRequest
	if err = query.Order("created_at DESC, id DESC").Limit(fetch).Find(&invoices).Error; err != nil {
		return nil, err
	}
	for i := range invoices {
		src.rows = append(src.rows, billingRow{
			createTime: invoices[i].CreatedAt,
			id:         invoices[i].Id,
			entry:      billingInvoiceRequestEntry(&invoices[i]),
		})
	}
	return src, nil
}

// GetUserBillingEntries 合并三个来源的账单记录，按 create_time DESC, id DESC
// 排序后截取分页窗口。kind 为 all|topup|subscription|invoice_fee。
func GetUserBillingEntries(userId int, kind string, keyword string, pageInfo *common.PageInfo) (entries []*BillingEntry, total int64, err error) {
	if userId <= 0 {
		return nil, 0, errors.New("invalid user id")
	}
	switch kind {
	case BillingKindAll, BillingKindTopup, BillingKindSubscription, BillingKindInvoiceFee:
	default:
		return nil, 0, errors.New("invalid billing kind")
	}

	offset := pageInfo.GetStartIdx()
	fetch := offset + pageInfo.GetPageSize()
	cutoff := topUpQueryCutoff()

	var sources []*billingSource
	appendSource := func(src *billingSource, e error) error {
		if e != nil {
			return e
		}
		sources = append(sources, src)
		return nil
	}

	if kind == BillingKindAll || kind == BillingKindTopup {
		if err = appendSource(queryBillingTopUps(userId, BillingKindTopup, keyword, cutoff, fetch)); err != nil {
			return nil, 0, err
		}
	}
	if kind == BillingKindAll || kind == BillingKindSubscription {
		if err = appendSource(queryBillingSubscriptions(userId, keyword, fetch)); err != nil {
			return nil, 0, err
		}
	}
	if kind == BillingKindAll || kind == BillingKindInvoiceFee {
		if err = appendSource(queryBillingTopUps(userId, BillingKindInvoiceFee, keyword, cutoff, fetch)); err != nil {
			return nil, 0, err
		}
		if err = appendSource(queryBillingInvoiceRequests(userId, keyword, cutoff, fetch)); err != nil {
			return nil, 0, err
		}
	}

	var merged []billingRow
	for _, src := range sources {
		total += src.count
		merged = append(merged, src.rows...)
	}
	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].createTime != merged[j].createTime {
			return merged[i].createTime > merged[j].createTime
		}
		return merged[i].id > merged[j].id
	})

	entries = []*BillingEntry{}
	if offset >= len(merged) {
		return entries, total, nil
	}
	end := min(offset+pageInfo.GetPageSize(), len(merged))
	for _, row := range merged[offset:end] {
		entry := row.entry
		entries = append(entries, &entry)
	}
	return entries, total, nil
}
