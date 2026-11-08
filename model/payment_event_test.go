package model

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestPaymentEventDatabaseMatrix(t *testing.T) {
	for _, dialect := range []common.DatabaseType{common.DatabaseTypeSQLite, common.DatabaseTypeMySQL, common.DatabaseTypePostgreSQL} {
		t.Run(string(dialect), func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case common.DatabaseTypeSQLite:
				driver = sqlite.Open(":memory:")
			case common.DatabaseTypeMySQL:
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case common.DatabaseTypePostgreSQL:
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("payment_%d_", time.Now().UnixNano())}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == common.DatabaseTypeSQLite {
				sqlDB.SetMaxOpenConns(1)
			}
			previousDB, previousLog, previousRedis := DB, LOG_DB, common.RedisEnabled
			previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
			DB, LOG_DB, common.RedisEnabled = db, db, false
			common.SetDatabaseTypes(dialect, dialect)
			t.Cleanup(func() {
				DB, LOG_DB, common.RedisEnabled = previousDB, previousLog, previousRedis
				common.SetDatabaseTypes(previousMainType, previousLogType)
				_ = db.Migrator().DropTable(&PaymentEventAction{}, &PaymentEvent{}, &PaymentReceipt{}, &SubscriptionOrder{}, &SubscriptionPlan{}, &UserSubscription{}, &TopUp{}, &Log{}, &User{},
					&DistributorProfile{}, &DistributorApplication{}, &CommissionRecord{}, &CommissionSettlement{}, &CommissionDebt{}, &DistributorWithdrawal{}, &CommissionCampaign{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &Log{}, &SubscriptionOrder{}, &SubscriptionPlan{}, &UserSubscription{},
				&DistributorProfile{}, &DistributorApplication{}, &CommissionRecord{}, &CommissionSettlement{}, &CommissionDebt{}, &DistributorWithdrawal{}, &CommissionCampaign{}))
			user := User{Username: "payment-owner", Password: "preserved", Quota: 7}
			require.NoError(t, db.Create(&user).Error)
			for range 2 {
				require.NoError(t, MigratePaymentEvents())
			}
			input := PaymentEventInput{Provider: PaymentProviderStripe, EventID: "evt_verified", EventType: "checkout.session.completed", TradeNo: "trade-once", SessionID: "cs_verified", PaymentIntent: "pi_verified", PaidMinor: 200, Currency: "usd", PaymentStatus: "paid", SessionStatus: "complete"}
			event, err := RecordPaymentEvent(input)
			require.NoError(t, err)
			duplicate, err := RecordPaymentEvent(input)
			require.NoError(t, err)
			assert.Equal(t, event.ID, duplicate.ID)
			different := input
			different.PaidMinor = 1
			_, err = RecordPaymentEvent(different)
			assert.ErrorIs(t, err, ErrPaymentEventConflict)
			now := common.GetTimestamp()
			outcomes := make(chan bool, 2)
			var wg sync.WaitGroup
			for range 2 {
				wg.Go(func() {
					_, claimed, claimErr := ClaimPaymentEvent(event.ID, now)
					assert.NoError(t, claimErr)
					outcomes <- claimed
				})
			}
			wg.Wait()
			close(outcomes)
			claimedCount := 0
			for claimed := range outcomes {
				if claimed {
					claimedCount++
				}
			}
			assert.Equal(t, 1, claimedCount)
			var claimed PaymentEvent
			require.NoError(t, db.First(&claimed, event.ID).Error)
			require.NoError(t, FinishPaymentEvent(claimed, errors.New("transient upstream failure"), false, now))
			var actions []PaymentEventAction
			require.NoError(t, db.Where("payment_event_id = ?", event.ID).Order("id").Find(&actions).Error)
			require.Len(t, actions, 2, "claims and outcomes remain auditable, including a crashed attempt")
			_, claimedOK, err := ClaimPaymentEvent(event.ID, now)
			require.NoError(t, err)
			assert.False(t, claimedOK)
			claimedEvent, claimedOK, err := ClaimPaymentEvent(event.ID, now+10000)
			require.NoError(t, err)
			require.True(t, claimedOK)
			order := TopUp{UserId: user.Id, Amount: 2, Money: 2, TradeNo: input.TradeNo, PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(&order).Error)
			require.NoError(t, Recharge(input.TradeNo, "", "127.0.0.1", *event))
			// Replaying after a commit-before-ACK crash must not credit the wallet twice.
			replay, claimedOK, err := ClaimPaymentEvent(event.ID, claimedEvent.LeaseUntil+1)
			require.NoError(t, err)
			require.True(t, claimedOK)
			require.NoError(t, Recharge(input.TradeNo, "", "127.0.0.1"))
			require.NoError(t, FinishPaymentEvent(*replay, nil, false, now+10001))
			require.ErrorIs(t, FinishPaymentEvent(*claimedEvent, nil, false, now+10001), ErrPaymentEventConflict)
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 7+int(2*common.QuotaPerUnit), user.Quota)
			assert.Equal(t, "preserved", user.Password)
			_, claimedOK, err = ClaimPaymentEvent(event.ID, now+20000)
			require.NoError(t, err)
			assert.False(t, claimedOK)
			rows, total, err := ListPaymentEvents("", "", 0, 20)
			require.NoError(t, err)
			assert.Equal(t, int64(1), total)
			require.Len(t, rows, 1)
			assert.Equal(t, "succeeded", rows[0].Status)
			assert.Empty(t, rows[0].LastErrorCode)
			refundInput := PaymentEventInput{Provider: PaymentProviderStripe, EventID: "evt_half_refund", EventType: "charge.refunded", PaymentIntent: "pi_verified", PaidMinor: 200, RefundedMinor: 100, Currency: "USD", ChargeID: "ch_verified"}
			refund, err := RecordPaymentEvent(refundInput)
			require.NoError(t, err)
			previousBatch := common.BatchUpdateEnabled
			common.BatchUpdateEnabled = true
			assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*refund), ErrPaymentFinancialReview, "batched in-flight quota must not be discarded by cache refresh")
			common.BatchUpdateEnabled = previousBatch
			require.NoError(t, ApplyVerifiedPaymentAdjustment(*refund))
			require.NoError(t, ApplyVerifiedPaymentAdjustment(*refund))
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 7+int(common.QuotaPerUnit), user.Quota)
			refundInput.EventID, refundInput.RefundedMinor = "evt_older_refund", 50
			olderRefund, err := RecordPaymentEvent(refundInput)
			require.NoError(t, err)
			require.NoError(t, ApplyVerifiedPaymentAdjustment(*olderRefund))
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 7+int(common.QuotaPerUnit), user.Quota)
			require.NoError(t, db.Model(&user).Update("quota", 0).Error)
			refundInput.EventID, refundInput.RefundedMinor = "evt_full_refund", 200
			fullRefund, err := RecordPaymentEvent(refundInput)
			require.NoError(t, err)
			assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*fullRefund), ErrPaymentInsufficientBalance)
			require.NoError(t, db.First(fullRefund, fullRefund.ID).Error)
			require.NotZero(t, fullRefund.PaymentReceiptID, "unapplied financial exceptions must retain their order linkage")
			receipt, err := GetPaymentReceipt(fullRefund.PaymentReceiptID)
			require.NoError(t, err)
			assert.EqualValues(t, 100, receipt.RefundedMinor)
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Zero(t, user.Quota)
			claim, claimedFinancial, err := ClaimPaymentEvent(fullRefund.ID, fullRefund.NextAttemptAt)
			require.NoError(t, err)
			require.True(t, claimedFinancial)
			require.NoError(t, FinishPaymentEvent(*claim, ErrPaymentInsufficientBalance, false, now))
			require.NoError(t, db.First(fullRefund, fullRefund.ID).Error)
			assert.ErrorIs(t, ResolvePaymentFinancialEvent(fullRefund.ID, fullRefund.Version, 9, "checked", "recover_credit"), ErrPaymentInsufficientBalance)
			require.NoError(t, ResolvePaymentFinancialEvent(fullRefund.ID, fullRefund.Version, 9, "Refund settled; no further collection authorized", "waive_recovery"))
			assert.ErrorIs(t, ResolvePaymentFinancialEvent(fullRefund.ID, fullRefund.Version, 9, "replay", "waive_recovery"), ErrPaymentEventConflict)
			receipt, err = GetPaymentReceipt(fullRefund.PaymentReceiptID)
			require.NoError(t, err)
			assert.EqualValues(t, 200, receipt.RefundedMinor)
			assert.Equal(t, int(common.QuotaPerUnit), receipt.WaivedQuota)
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Zero(t, user.Quota)
			for range 2 {
				require.NoError(t, MigratePaymentEvents())
			}
			var count int64
			require.NoError(t, db.Model(&PaymentEvent{}).Count(&count).Error)
			assert.EqualValues(t, 4, count)
			failedInput := input
			failedInput.EventID = "evt_review"
			failedInput.TradeNo = "wrong-provider"
			require.NoError(t, db.Create(&TopUp{UserId: user.Id, TradeNo: failedInput.TradeNo, PaymentProvider: PaymentProviderCreem, Status: common.TopUpStatusPending}).Error)
			assert.ErrorIs(t, Recharge(failedInput.TradeNo, "", ""), ErrPaymentMethodMismatch, "permanent financial errors must retain their classification")
			review, err := RecordPaymentEvent(failedInput)
			require.NoError(t, err)
			claim, ok, err := ClaimPaymentEvent(review.ID, review.NextAttemptAt)
			require.NoError(t, err)
			require.True(t, ok)
			require.NoError(t, FinishPaymentEvent(*claim, ErrPaymentMethodMismatch, false, now))
			require.NoError(t, db.First(review, review.ID).Error)
			assert.Equal(t, "needs_review", review.Status)
			assert.ErrorIs(t, RetryPaymentEvent(review.ID, review.Version, 9, "  "), ErrPaymentEventInvalid)
			assert.ErrorIs(t, RetryPaymentEvent(review.ID, review.Version-1, 9, "verified"), ErrPaymentEventConflict)
			require.NoError(t, RetryPaymentEvent(review.ID, review.Version, 9, "Verified original transaction"))
			require.NoError(t, db.First(review, review.ID).Error)
			assert.Equal(t, failedInput.PaidMinor, review.PaidMinor)
			require.NoError(t, db.Where("payment_event_id = ?", review.ID).Order("id").Find(&actions).Error)
			require.Len(t, actions, 3)
			assert.Equal(t, 9, actions[2].ActorID)
			assert.Equal(t, "Verified original transaction", actions[2].Reason)
			expiredInput := input
			expiredInput.EventID = "evt_exhausted"
			expired, err := RecordPaymentEvent(expiredInput)
			require.NoError(t, err)
			require.NoError(t, db.Model(expired).Updates(map[string]any{"status": "processing", "attempts": 8, "lease_until": now - 1}).Error)
			_, err = DuePaymentEvents(now, 100)
			require.NoError(t, err)
			require.NoError(t, db.First(expired, expired.ID).Error)
			assert.Equal(t, "needs_review", expired.Status)
			history, totalActions, err := ListPaymentEventActions(expired.ID, 0, 20)
			require.NoError(t, err)
			require.EqualValues(t, 1, totalActions)
			require.Len(t, history, 1)
			assert.Equal(t, "retry_exhausted", history[0].ErrorCode)
			plan := SubscriptionPlan{Title: "Refund plan", PriceAmount: 2, Currency: "USD", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
			require.NoError(t, db.Create(&plan).Error)
			subOrder := SubscriptionOrder{UserId: user.Id, PlanId: plan.Id, Money: 2, TradeNo: "subscription-refund", PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(&subOrder).Error)
			subInput := input
			subInput.EventID, subInput.TradeNo, subInput.SessionID, subInput.PaymentIntent, subInput.InvoiceID = "evt_sub_paid", subOrder.TradeNo, "cs_subscription", "", "in_subscription"
			subPaid, err := RecordPaymentEvent(subInput)
			require.NoError(t, err)
			require.NoError(t, CompleteSubscriptionOrder(subOrder.TradeNo, "", PaymentProviderStripe, "", "", "", *subPaid))
			invoice, err := RecordPaymentEvent(PaymentEventInput{Provider: PaymentProviderStripe, EventID: "evt_sub_invoice", EventType: "invoice.paid", InvoiceID: "in_subscription", PaymentIntent: "pi_subscription", PaidMinor: 200, Currency: "USD"})
			require.NoError(t, err)
			require.NoError(t, AttachVerifiedInvoicePayment(*invoice))
			require.NoError(t, AttachVerifiedInvoicePayment(*invoice))
			refundInput.EventID, refundInput.PaymentIntent, refundInput.RefundedMinor = "evt_sub_refund", "pi_subscription", 100
			subRefund, err := RecordPaymentEvent(refundInput)
			require.NoError(t, err)
			assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*subRefund), ErrPaymentEntitlementReview)
			claim, ok, err = ClaimPaymentEvent(subRefund.ID, subRefund.NextAttemptAt)
			require.NoError(t, err)
			require.True(t, ok)
			require.NoError(t, FinishPaymentEvent(*claim, ErrPaymentEntitlementReview, false, now))
			require.NoError(t, db.First(subRefund, subRefund.ID).Error)
			require.NoError(t, ResolvePaymentFinancialEvent(subRefund.ID, subRefund.Version, 9, "Keep remaining entitlement after the partial refund", "keep_entitlement"))
			require.NoError(t, db.First(&subOrder, subOrder.Id).Error)
			var sub UserSubscription
			require.NoError(t, db.First(&sub, subOrder.UserSubscriptionId).Error)
			assert.Equal(t, "active", sub.Status)
			refundInput.EventID, refundInput.RefundedMinor = "evt_sub_full_refund", 200
			subFullRefund, err := RecordPaymentEvent(refundInput)
			require.NoError(t, err)
			assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*subFullRefund), ErrPaymentEntitlementReview)
			claim, ok, err = ClaimPaymentEvent(subFullRefund.ID, subFullRefund.NextAttemptAt)
			require.NoError(t, err)
			require.True(t, ok)
			require.NoError(t, FinishPaymentEvent(*claim, ErrPaymentEntitlementReview, false, now))
			require.NoError(t, db.First(subFullRefund, subFullRefund.ID).Error)
			require.NoError(t, ResolvePaymentFinancialEvent(subFullRefund.ID, subFullRefund.Version, 9, "Full refund confirmed; end the linked entitlement", "cancel_entitlement"))
			require.NoError(t, db.First(&sub, sub.Id).Error)
			assert.Equal(t, "cancelled", sub.Status)
			for _, prior := range []string{"waiver", "dispute"} {
				t.Run("refund_after_"+prior, func(t *testing.T) {
					input := PaymentEventInput{Provider: PaymentProviderStripe, EventID: "evt_paid_" + prior, EventType: "checkout.session.completed", TradeNo: "trade_" + prior, SessionID: "cs_" + prior, PaymentIntent: "pi_" + prior, PaidMinor: 200, Currency: "usd", PaymentStatus: "paid", SessionStatus: "complete"}
					paid, err := RecordPaymentEvent(input)
					require.NoError(t, err)
					require.NoError(t, db.Create(&TopUp{UserId: user.Id, Amount: 2, Money: 2, TradeNo: input.TradeNo, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusPending}).Error)
					require.NoError(t, Recharge(input.TradeNo, "", "", *paid))
					adjustment := PaymentEventInput{Provider: PaymentProviderStripe, EventID: "evt_review_" + prior, EventType: "charge.refunded", PaymentIntent: input.PaymentIntent, PaidMinor: 200, RefundedMinor: 100, Currency: "usd", ChargeID: "ch_" + prior}
					action := "waive_recovery"
					if prior == "dispute" {
						adjustment.EventType = "charge.dispute.closed"
						adjustment.PaidMinor = 100
						adjustment.DisputeStatus = "lost"
						adjustment.RefundedMinor = 0
						action = "recover_credit"
					}
					first, err := RecordPaymentEvent(adjustment)
					require.NoError(t, err)
					require.NoError(t, db.Model(first).Update("status", "needs_review").Error)
					previousBatch := common.BatchUpdateEnabled
					common.BatchUpdateEnabled = prior == "waiver"
					assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*first), ErrPaymentFinancialReview)
					common.BatchUpdateEnabled = previousBatch
					require.NoError(t, db.First(first, first.ID).Error)
					require.NoError(t, ResolvePaymentFinancialEvent(first.ID, first.Version, 9, "Verified gateway settlement; record the recovery decision", action))
					require.NoError(t, db.First(&user, user.Id).Error)
					beforeQuota := user.Quota
					if prior == "dispute" {
						repeatInput := adjustment
						repeatInput.EventID = "evt_repeat_dispute"
						repeat, err := RecordPaymentEvent(repeatInput)
						require.NoError(t, err)
						assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*repeat), ErrPaymentFinancialReview)
						require.NoError(t, db.Model(repeat).Update("status", "needs_review").Error)
						require.NoError(t, ResolvePaymentFinancialEvent(repeat.ID, repeat.Version, 9, "The same settled loss has already been recovered", "recover_credit"))
						require.NoError(t, db.First(&user, user.Id).Error)
						assert.Equal(t, beforeQuota, user.Quota)
					}
					adjustment.EventID, adjustment.EventType, adjustment.PaidMinor, adjustment.RefundedMinor, adjustment.DisputeStatus = "evt_later_refund_"+prior, "charge.refunded", 200, 150, ""
					later, err := RecordPaymentEvent(adjustment)
					require.NoError(t, err)
					assert.ErrorIs(t, ApplyVerifiedPaymentAdjustment(*later), ErrPaymentFinancialReview, "later refunds must not undo a waiver or recover an overlapping dispute automatically")
					require.NoError(t, db.First(&user, user.Id).Error)
					assert.Equal(t, beforeQuota, user.Quota)
					if prior == "waiver" {
						require.NoError(t, db.Model(later).Update("status", "needs_review").Error)
						require.NoError(t, ResolvePaymentFinancialEvent(later.ID, later.Version, 9, "Recover only the newly refunded credit; preserve the prior waiver", "recover_credit"))
						require.NoError(t, db.First(&user, user.Id).Error)
						assert.Equal(t, beforeQuota-int(common.QuotaPerUnit/2), user.Quota)
					}
				})
			}
		})
	}
}

// TestPaymentAmountCheckMatrix B3.3：四通道回调在入账前核对实付金额。
// 精确金额入账一次且幂等；少付 0.01 不入账、订单保持 pending 并写
// needs_review 支付事件；老订单（currency=”）按 Money 核对。
func TestPaymentAmountCheckMatrix(t *testing.T) {
	for _, dialect := range []common.DatabaseType{common.DatabaseTypeSQLite, common.DatabaseTypeMySQL, common.DatabaseTypePostgreSQL} {
		t.Run(string(dialect), func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case common.DatabaseTypeSQLite:
				driver = sqlite.Open(":memory:")
			case common.DatabaseTypeMySQL:
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case common.DatabaseTypePostgreSQL:
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("amount_%d_", time.Now().UnixNano())}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == common.DatabaseTypeSQLite {
				sqlDB.SetMaxOpenConns(1)
			}
			previousDB, previousRedis := DB, common.RedisEnabled
			previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
			DB, common.RedisEnabled = db, false
			common.SetDatabaseTypes(dialect, dialect)
			t.Cleanup(func() {
				DB, common.RedisEnabled = previousDB, previousRedis
				common.SetDatabaseTypes(previousMainType, previousLogType)
				_ = db.Migrator().DropTable(&PaymentEvent{}, &PaymentEventAction{}, &PaymentReceipt{}, &SubscriptionOrder{}, &SubscriptionPlan{}, &UserSubscription{}, &TopUp{}, &Log{}, &User{})
				_ = sqlDB.Close()
			})
			// B3.3 迁移覆盖：新列存在，重复 AutoMigrate 无新增变更。
			require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &Log{}, &SubscriptionOrder{}, &SubscriptionPlan{}, &UserSubscription{}))
			require.NoError(t, db.AutoMigrate(&TopUp{}, &SubscriptionOrder{}))
			require.NoError(t, MigratePaymentEvents())
			for _, column := range []string{"fee_rate_bps", "fee_money", "credited_money", "currency"} {
				assert.True(t, db.Migrator().HasColumn(&TopUp{}, column), "top_ups missing %s", column)
				assert.True(t, db.Migrator().HasColumn(&SubscriptionOrder{}, column), "subscription_orders missing %s", column)
			}

			user := User{Username: "amount-owner", Password: "preserved", Quota: 7}
			require.NoError(t, db.Create(&user).Error)
			quotaOf := func() int {
				require.NoError(t, db.First(&user, user.Id).Error)
				return user.Quota
			}

			// epay 快照订单：credited 100 + fee 3 = 实付应为 103。
			mkTopUp := func(trade, provider, method, currency string, credited, fee float64) TopUp {
				topUp := TopUp{UserId: user.Id, Amount: 2, Money: credited, TradeNo: trade,
					PaymentProvider: provider, PaymentMethod: method, Status: common.TopUpStatusPending,
					CreditedMoney: decimal.NewFromFloat(credited), FeeMoney: decimal.NewFromFloat(fee), FeeRateBps: 300, Currency: currency}
				require.NoError(t, db.Create(&topUp).Error)
				return topUp
			}

			snapshot := mkTopUp("epay-exact", PaymentProviderEpay, "alipay", "CNY", 100, 3)
			done, err := RechargeEpay(snapshot.TradeNo, "alipay", "127.0.0.1", "103.00")
			require.NoError(t, err)
			assert.False(t, done)
			assert.Equal(t, 7+int(2*common.QuotaPerUnit), quotaOf())
			// 重复回调幂等：不再入账。
			done, err = RechargeEpay(snapshot.TradeNo, "alipay", "127.0.0.1", "103.00")
			require.NoError(t, err)
			assert.True(t, done)
			assert.Equal(t, 7+int(2*common.QuotaPerUnit), quotaOf())

			// 少付 0.01：不入账、保持 pending、写 needs_review 事件。
			short := mkTopUp("epay-short", PaymentProviderEpay, "alipay", "CNY", 100, 3)
			_, err = RechargeEpay(short.TradeNo, "alipay", "127.0.0.1", "102.99")
			assert.ErrorIs(t, err, ErrPaymentAmountMismatch)
			assert.Equal(t, 7+int(2*common.QuotaPerUnit), quotaOf())
			require.NoError(t, db.First(&short, short.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, short.Status)
			var mismatch PaymentEvent
			require.NoError(t, db.Where("trade_no = ? AND event_type = ?", short.TradeNo, PaymentEventTypeAmountMismatch).First(&mismatch).Error)
			assert.Equal(t, "needs_review", mismatch.Status)
			assert.EqualValues(t, 10299, mismatch.PaidMinor)
			// 补齐正确金额后仍可入账。
			done, err = RechargeEpay(short.TradeNo, "alipay", "127.0.0.1", "103.00")
			require.NoError(t, err)
			assert.False(t, done)
			assert.Equal(t, 7+int(4*common.QuotaPerUnit), quotaOf())

			// 老订单（currency=''）按 Money 核对。
			legacy := TopUp{UserId: user.Id, Amount: 2, Money: 10, TradeNo: "legacy-epay",
				PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(&legacy).Error)
			done, err = RechargeEpay(legacy.TradeNo, "", "127.0.0.1", "10.00")
			require.NoError(t, err)
			assert.False(t, done)
			legacyShort := TopUp{UserId: user.Id, Amount: 2, Money: 10, TradeNo: "legacy-short",
				PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(&legacyShort).Error)
			_, err = RechargeEpay(legacyShort.TradeNo, "", "127.0.0.1", "9.99")
			assert.ErrorIs(t, err, ErrPaymentAmountMismatch)
			require.NoError(t, db.First(&legacyShort, legacyShort.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, legacyShort.Status)

			// Waffo 回调带币种：金额对但币种错同样不入账。
			// 这三个通道按既有约定对外屏蔽内部错误，核对明细看订单状态与事件。
			wrongCurrency := mkTopUp("waffo-currency", PaymentProviderWaffo, "1", "CNY", 100, 3)
			err = RechargeWaffo(wrongCurrency.TradeNo, "127.0.0.1", "103.00", "USD")
			assert.Error(t, err)
			require.NoError(t, db.First(&wrongCurrency, wrongCurrency.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, wrongCurrency.Status)
			assert.Equal(t, 7+int(6*common.QuotaPerUnit), quotaOf())
			var waffoEvent PaymentEvent
			require.NoError(t, db.Where("trade_no = ? AND event_type = ?", wrongCurrency.TradeNo, PaymentEventTypeAmountMismatch).First(&waffoEvent).Error)
			assert.Equal(t, "USD", waffoEvent.Currency)

			// Creem 是 fee_included：实付应等于 credited_money（最小单位核对）。
			creem := mkTopUp("creem-order", PaymentProviderCreem, "creem", "USD", 20, 0)
			err = RechargeCreem(creem.TradeNo, "", "", "127.0.0.1", 2000, "USD")
			require.NoError(t, err)
			creemShort := mkTopUp("creem-short", PaymentProviderCreem, "creem", "USD", 20, 0)
			err = RechargeCreem(creemShort.TradeNo, "", "", "127.0.0.1", 1999, "USD")
			assert.Error(t, err)
			require.NoError(t, db.First(&creemShort, creemShort.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, creemShort.Status)
			var creemEvent PaymentEvent
			require.NoError(t, db.Where("trade_no = ? AND event_type = ?", creemShort.TradeNo, PaymentEventTypeAmountMismatch).First(&creemEvent).Error)
			assert.EqualValues(t, 1999, creemEvent.PaidMinor)

			// Waffo Pancake：快照订单按 credited+fee 核对。
			pancake := mkTopUp("pancake-order", PaymentProviderWaffoPancake, "waffo_pancake", "USD", 50, 1.5)
			err = RechargeWaffoPancake(pancake.TradeNo, "51.50", "USD")
			require.NoError(t, err)
			pancakeShort := mkTopUp("pancake-short", PaymentProviderWaffoPancake, "waffo_pancake", "USD", 50, 1.5)
			err = RechargeWaffoPancake(pancakeShort.TradeNo, "51.49", "USD")
			assert.Error(t, err)
			require.NoError(t, db.First(&pancakeShort, pancakeShort.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, pancakeShort.Status)

			// 订阅订单回调同样核对：少付保持 pending，不建订阅。
			plan := SubscriptionPlan{Title: "Amount plan", PriceAmount: 30, Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
			require.NoError(t, db.Create(&plan).Error)
			subOrder := SubscriptionOrder{UserId: user.Id, PlanId: plan.Id, Money: 30, TradeNo: "sub-short",
				PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending,
				CreditedMoney: decimal.NewFromInt(30), FeeMoney: decimal.RequireFromString("0.9"), FeeRateBps: 300, Currency: "CNY"}
			require.NoError(t, db.Create(&subOrder).Error)
			err = CompleteSubscriptionOrder(subOrder.TradeNo, "", PaymentProviderEpay, "", "30.89", "")
			assert.ErrorIs(t, err, ErrPaymentAmountMismatch)
			require.NoError(t, db.First(&subOrder, subOrder.Id).Error)
			assert.Equal(t, common.TopUpStatusPending, subOrder.Status)
			err = CompleteSubscriptionOrder(subOrder.TradeNo, "", PaymentProviderEpay, "", "30.90", "")
			require.NoError(t, err)
			require.NoError(t, db.First(&subOrder, subOrder.Id).Error)
			assert.Equal(t, common.TopUpStatusSuccess, subOrder.Status)
		})
	}
}

// TestFeeSnapshotAutoMigrateIdempotent B3.3 迁移幂等：第二次 AutoMigrate
// 不得再产生 ALTER/DDL（decimal 默认值若写错方言会在每次启动重复 ALTER）。
func TestFeeSnapshotAutoMigrateIdempotent(t *testing.T) {
	for _, dialect := range []common.DatabaseType{common.DatabaseTypeSQLite, common.DatabaseTypeMySQL, common.DatabaseTypePostgreSQL} {
		t.Run(string(dialect), func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case common.DatabaseTypeSQLite:
				driver = sqlite.Open(":memory:")
			case common.DatabaseTypeMySQL:
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case common.DatabaseTypePostgreSQL:
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			var sqlLog strings.Builder
			db, err := gorm.Open(driver, &gorm.Config{
				NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("fee_mig_%d_", time.Now().UnixNano())},
				Logger:         logger.New(log.New(&sqlLog, "", 0), logger.Config{LogLevel: logger.Info}),
			})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == common.DatabaseTypeSQLite {
				sqlDB.SetMaxOpenConns(1)
			}
			t.Cleanup(func() {
				_ = db.Migrator().DropTable(&TopUp{}, &SubscriptionOrder{})
				_ = sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(&TopUp{}, &SubscriptionOrder{}))
			sqlLog.Reset()
			require.NoError(t, db.AutoMigrate(&TopUp{}, &SubscriptionOrder{}))
			out := sqlLog.String()
			for line := range strings.Lines(out) {
				upper := strings.ToUpper(line)
				isDDL := strings.Contains(upper, "ALTER TABLE") || strings.Contains(upper, "ADD COLUMN") ||
					strings.Contains(upper, "MODIFY COLUMN") || strings.Contains(upper, "CREATE TABLE")
				if !isDDL {
					continue
				}
				for _, column := range []string{"fee_rate_bps", "fee_money", "credited_money", "currency"} {
					assert.NotContains(t, line, column, "second AutoMigrate re-emitted DDL for %s:\n%s", column, out)
				}
			}
		})
	}
}
