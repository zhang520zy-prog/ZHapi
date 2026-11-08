package model

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
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
			require.NoError(t, CompleteSubscriptionOrder(subOrder.TradeNo, "", PaymentProviderStripe, "", *subPaid))
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
