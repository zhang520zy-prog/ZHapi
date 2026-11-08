package model

import (
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

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

var commissionTables = []any{&User{}, &TopUp{}, &DistributorProfile{}, &DistributorApplication{}, &CommissionRecord{}, &CommissionSettlement{}, &CommissionDebt{}, &DistributorWithdrawal{}, &CommissionCampaign{}, &InviteAttribution{}, &TermsAcknowledgement{}}

type commissionFixture struct {
	t   *testing.T
	db  *gorm.DB
	seq int
}

func newCommissionFixture(t *testing.T, dialect string) *commissionFixture {
	t.Helper()
	var driver gorm.Dialector
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(":memory:")
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN not configured")
		}
		driver = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN not configured")
		}
		driver = postgres.Open(dsn)
	}
	prefix := fmt.Sprintf("cm_%d_", time.Now().UnixNano())
	db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	if dialect == "sqlite" {
		sqlDB.SetMaxOpenConns(1)
	}
	previous := DB
	DB = db
	t.Cleanup(func() {
		DB = previous
		_ = db.Migrator().DropTable(commissionTables...)
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(commissionTables...))
	t.Setenv(common.DistributorAccountSecretEnv, "commission-test-secret")

	saved := snapshotCommissionOptions()
	t.Cleanup(saved.restore)
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMap["DistributorWithdrawMethods"] = `["alipay","wechat","bank","usdt"]`
	common.OptionMap["DistributorUsdtNetworks"] = "[]"
	common.OptionMapRWMutex.Unlock()
	operation_setting.ReferralCommissionEnabled = true
	operation_setting.ReferralRateBps = 150
	operation_setting.DistributorEnabled = true
	operation_setting.DistributorApplyEnabled = true
	operation_setting.DistributorDefaultRateBps = 1000
	operation_setting.DistributorHoldDays = 3
	operation_setting.DistributorWithdrawEnabled = true
	operation_setting.DistributorWithdrawMinCNY = "10"
	operation_setting.CommissionTermsExtra = ""
	operation_setting.CommissionTermsVersion = 1
	operation_setting.USDExchangeRate = 7.0
	common.QuotaPerUnit = 500000
	return &commissionFixture{t: t, db: db}
}

type commissionOptionSnapshot struct {
	referralEnabled bool
	referralRate    int
	distEnabled     bool
	applyEnabled    bool
	distRate        int
	holdDays        int
	withdrawEnabled bool
	withdrawMin     string
	termsExtra      string
	termsVersion    int
	usdRate         float64
	quotaPerUnit    float64
	methods         string
	networks        string
}

func snapshotCommissionOptions() commissionOptionSnapshot {
	common.OptionMapRWMutex.RLock()
	methods := common.OptionMap["DistributorWithdrawMethods"]
	networks := common.OptionMap["DistributorUsdtNetworks"]
	common.OptionMapRWMutex.RUnlock()
	return commissionOptionSnapshot{
		referralEnabled: operation_setting.ReferralCommissionEnabled,
		referralRate:    operation_setting.ReferralRateBps,
		distEnabled:     operation_setting.DistributorEnabled,
		applyEnabled:    operation_setting.DistributorApplyEnabled,
		distRate:        operation_setting.DistributorDefaultRateBps,
		holdDays:        operation_setting.DistributorHoldDays,
		withdrawEnabled: operation_setting.DistributorWithdrawEnabled,
		withdrawMin:     operation_setting.DistributorWithdrawMinCNY,
		termsExtra:      operation_setting.CommissionTermsExtra,
		termsVersion:    operation_setting.CommissionTermsVersion,
		usdRate:         operation_setting.USDExchangeRate,
		quotaPerUnit:    common.QuotaPerUnit,
		methods:         methods,
		networks:        networks,
	}
}

func (s commissionOptionSnapshot) restore() {
	operation_setting.ReferralCommissionEnabled = s.referralEnabled
	operation_setting.ReferralRateBps = s.referralRate
	operation_setting.DistributorEnabled = s.distEnabled
	operation_setting.DistributorApplyEnabled = s.applyEnabled
	operation_setting.DistributorDefaultRateBps = s.distRate
	operation_setting.DistributorHoldDays = s.holdDays
	operation_setting.DistributorWithdrawEnabled = s.withdrawEnabled
	operation_setting.DistributorWithdrawMinCNY = s.withdrawMin
	operation_setting.CommissionTermsExtra = s.termsExtra
	operation_setting.CommissionTermsVersion = s.termsVersion
	operation_setting.USDExchangeRate = s.usdRate
	common.QuotaPerUnit = s.quotaPerUnit
	common.OptionMapRWMutex.Lock()
	common.OptionMap["DistributorWithdrawMethods"] = s.methods
	common.OptionMap["DistributorUsdtNetworks"] = s.networks
	common.OptionMapRWMutex.Unlock()
}

// makeUser 建一个用推广链接注册的客户（inviter_id + referral 归属，与生产注册一致）。
func (f *commissionFixture) makeUser(username string, inviterId int) *User {
	f.t.Helper()
	user := &User{Username: username, Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: username, InviterId: inviterId}
	require.NoError(f.t, f.db.Create(user).Error)
	if inviterId > 0 {
		require.NoError(f.t, f.db.Create(&InviteAttribution{InviteeUserId: user.Id, Program: CommissionProgramReferral, InviterUserId: inviterId, Code: "aff", CreatedAt: common.GetTimestamp()}).Error)
	}
	return user
}

// makeDistUser 建一个用分销链接注册的客户（distributor 归属）。
func (f *commissionFixture) makeDistUser(username string, inviterId int) *User {
	f.t.Helper()
	user := &User{Username: username, Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: username, InviterId: inviterId}
	require.NoError(f.t, f.db.Create(user).Error)
	require.NoError(f.t, f.db.Create(&InviteAttribution{InviteeUserId: user.Id, Program: CommissionProgramDistributor, InviterUserId: inviterId, Code: "dist", CreatedAt: common.GetTimestamp()}).Error)
	return user
}

func (f *commissionFixture) makeTopUp(userId int, provider string, amount int64, money float64, completeTime int64) *TopUp {
	f.t.Helper()
	f.seq++
	topUp := &TopUp{
		UserId: userId, Amount: amount, Money: money,
		TradeNo:         fmt.Sprintf("tn-%d-%d", time.Now().UnixNano(), f.seq),
		PaymentProvider: provider, Status: common.TopUpStatusSuccess,
		CreateTime: completeTime - 60, CompleteTime: completeTime,
	}
	require.NoError(f.t, f.db.Create(topUp).Error)
	return topUp
}

func (f *commissionFixture) approveDistributor(userId int, rateBps *int, holdDays *int) *DistributorProfile {
	f.t.Helper()
	profile := &DistributorProfile{UserId: userId, Status: DistributorStatusActive, RateBps: rateBps, HoldDays: holdDays,
		ApprovedBy: 1, ApprovedAt: common.GetTimestamp(), CreatedAt: common.GetTimestamp(), UpdatedAt: common.GetTimestamp(), Version: 1}
	require.NoError(f.t, f.db.Create(profile).Error)
	// 生产路径在提交申请时写入同意记录；夹具绕过申请直接批准，需补上同样的 ack。
	require.NoError(f.t, f.db.Create(&TermsAcknowledgement{UserId: userId, Doc: TermsDocDistributorAgreement, Kind: TermsKindAgree,
		Version: operation_setting.DistributorAgreementVersion, CreatedAt: common.GetTimestamp()}).Error)
	InvalidateDistributorProfileCache(userId)
	return profile
}

func (f *commissionFixture) reloadUser(id int) User {
	f.t.Helper()
	var user User
	require.NoError(f.t, f.db.First(&user, id).Error)
	return user
}

func (f *commissionFixture) reloadProfile(userId int) DistributorProfile {
	f.t.Helper()
	var profile DistributorProfile
	require.NoError(f.t, f.db.Where("user_id = ?", userId).First(&profile).Error)
	return profile
}

func (f *commissionFixture) recordOf(topUpId int) CommissionRecord {
	f.t.Helper()
	var record CommissionRecord
	require.NoError(f.t, f.db.Where("source_type = ? AND source_id = ?", CommissionSourceTypeTopUp, topUpId).First(&record).Error)
	return record
}

func TestCommissionMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		for _, tc := range []struct {
			name string
			run  func(*commissionFixture, *testing.T)
		}{
			{"referral_instant_and_idempotent", (*commissionFixture).referralInstant},
			{"referral_fee_snapshot_same_cashback", (*commissionFixture).referralFeeSnapshot},
			{"distributor_frozen_then_confirmed", (*commissionFixture).distributorFrozenConfirm},
			{"reversal_and_debt_offset", (*commissionFixture).reversalDebtOffset},
			{"campaign_rate_priority", (*commissionFixture).campaignRatePriority},
			{"withdrawal_flow", (*commissionFixture).withdrawalFlow},
			{"application_and_status", (*commissionFixture).applicationFlow},
		} {
			t.Run(dialect+"/"+tc.name, func(t *testing.T) {
				f := newCommissionFixture(t, dialect)
				tc.run(f, t)
			})
		}
	}
}

// 推广：充值 100 元等值额度即时到账 1.5%，重复记账幂等。
func (f *commissionFixture) referralInstant(t *testing.T) {
	inviter := f.makeUser("inviter-r", 0)
	invitee := f.makeUser("invitee-r", inviter.Id)
	topUp := f.makeTopUp(invitee.Id, PaymentProviderEpay, 100, 730, common.GetTimestamp())
	credited := int(100 * common.QuotaPerUnit)

	accrueCommission(topUp, credited)
	accrueCommission(topUp, credited) // 回调重放

	record := f.recordOf(topUp.Id)
	assert.Equal(t, CommissionProgramReferral, record.Program)
	assert.Equal(t, CommissionStatusSettled, record.Status)
	expected := credited * 150 / 10000
	assert.Equal(t, expected, record.CommissionQuota)
	assert.Equal(t, CommissionRateSourceDefault, record.RateSource)

	var count int64
	require.NoError(t, f.db.Model(&CommissionRecord{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	user := f.reloadUser(inviter.Id)
	assert.Equal(t, expected, user.AffQuota)
	assert.Equal(t, expected, user.AffHistoryQuota)

	var settlements []CommissionSettlement
	require.NoError(t, f.db.Find(&settlements).Error)
	require.Len(t, settlements, 1)
	assert.Equal(t, SettlementTriggerInstant, settlements[0].Trigger)
	assert.Equal(t, 0, settlements[0].BalanceBefore)
	assert.Equal(t, expected, settlements[0].BalanceAfter)

	// 开关关闭后不再记账
	operation_setting.ReferralCommissionEnabled = false
	invitee2 := f.makeUser("invitee-r2", inviter.Id)
	topUp2 := f.makeTopUp(invitee2.Id, PaymentProviderEpay, 100, 730, common.GetTimestamp())
	accrueCommission(topUp2, credited)
	require.NoError(t, f.db.Model(&CommissionRecord{}).Where("source_id = ?", topUp2.Id).Count(&count).Error)
	assert.Equal(t, int64(0), count)
	operation_setting.ReferralCommissionEnabled = true
}

// B3.6 回归：推广返现基数是到账额度（creditedQuota），不是含手续费的实付金额。
// 同一笔到账，费率 0 与 300 bps 的手续费快照产生的返现相同，
// 均等于 入账额度 × 150 / 10000。
func (f *commissionFixture) referralFeeSnapshot(t *testing.T) {
	inviter := f.makeUser("inviter-f", 0)
	invitee := f.makeUser("invitee-f", inviter.Id)
	now := common.GetTimestamp()
	credited := int(100 * common.QuotaPerUnit)

	// 费率 0：无手续费，credited_money = money
	zeroFee := f.makeTopUp(invitee.Id, PaymentProviderEpay, 100, 730, now)
	zeroFee.Currency = "CNY"
	zeroFee.CreditedMoney = decimal.NewFromInt(730)
	zeroFee.FeeMoney = decimal.Zero
	zeroFee.FeeRateBps = 0
	require.NoError(t, f.db.Save(zeroFee).Error)

	// 费率 300 bps：money 仍是到账金额，fee 3% 只加在实付上
	withFee := f.makeTopUp(invitee.Id, PaymentProviderEpay, 100, 730, now)
	withFee.Currency = "CNY"
	withFee.CreditedMoney = decimal.NewFromInt(730)
	withFee.FeeMoney = decimal.RequireFromString("21.9")
	withFee.FeeRateBps = 300
	require.NoError(t, f.db.Save(withFee).Error)

	accrueCommission(zeroFee, credited)
	accrueCommission(withFee, credited)

	expected := credited * 150 / 10000
	zeroRecord := f.recordOf(zeroFee.Id)
	feeRecord := f.recordOf(withFee.Id)
	assert.Equal(t, CommissionProgramReferral, zeroRecord.Program)
	assert.Equal(t, expected, zeroRecord.CommissionQuota)
	assert.Equal(t, expected, feeRecord.CommissionQuota)
	assert.Equal(t, zeroRecord.BaseQuota, feeRecord.BaseQuota)
}

// 分销：冻结 → 到期后管理员确认才入账；并发确认只入账一次；提前确认需理由。
func (f *commissionFixture) distributorFrozenConfirm(t *testing.T) {
	distributor := f.makeUser("dist-c", 0)
	f.approveDistributor(distributor.Id, nil, nil)
	invitee := f.makeDistUser("invitee-c", distributor.Id)
	credited := int(10 * common.QuotaPerUnit)

	// 归属为分销的客户，充值完成时间不再参与判定：30 天前的充值同样走分销
	topUpBefore := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp()-86400*30)
	accrueCommission(topUpBefore, credited)
	before := f.recordOf(topUpBefore.Id)
	assert.Equal(t, CommissionProgramDistributor, before.Program)

	// 分销开关关掉时，归属为分销的充值不返现（不降级为推广）
	operation_setting.DistributorEnabled = false
	topUpDisabled := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUpDisabled, credited)
	var disabledCount int64
	require.NoError(t, f.db.Model(&CommissionRecord{}).Where("source_id = ?", topUpDisabled.Id).Count(&disabledCount).Error)
	assert.Equal(t, int64(0), disabledCount)
	operation_setting.DistributorEnabled = true

	topUp := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp, credited)
	record := f.recordOf(topUp.Id)
	assert.Equal(t, CommissionProgramDistributor, record.Program)
	assert.Equal(t, CommissionStatusFrozen, record.Status)
	assert.Equal(t, record.CreatedAt+3*86400, record.AvailableAt)

	profile := f.reloadProfile(distributor.Id)
	assert.Equal(t, 0, profile.BalanceQuota)

	// 提前确认必须填理由
	require.ErrorIs(t, ConfirmCommissions([]int{record.Id}, 9, ""), ErrCommissionEarlyNoReason)

	// 提前确认（带理由）→ trigger=early，入账一次
	require.NoError(t, ConfirmCommissions([]int{record.Id}, 9, "early ok"))
	profile = f.reloadProfile(distributor.Id)
	expected := credited * 1000 / 10000
	assert.Equal(t, expected, profile.BalanceQuota)
	record = f.recordOf(topUp.Id)
	assert.Equal(t, CommissionStatusSettled, record.Status)

	var settlements []CommissionSettlement
	require.NoError(t, f.db.Where("id = ?", record.SettlementId).Find(&settlements).Error)
	require.Len(t, settlements, 1)
	assert.Equal(t, SettlementTriggerEarly, settlements[0].Trigger)
	assert.Equal(t, 9, settlements[0].OperatorId)

	// 并发确认只入账一次
	topUp2 := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp2, credited)
	record2 := f.recordOf(topUp2.Id)
	require.NoError(t, AdjustCommissionAvailableAt(record2.Id, 1, "test", 9))
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Go(func() { errs <- ConfirmCommissions([]int{record2.Id}, 9, "ok") })
	}
	wg.Wait()
	close(errs)
	successes, conflicts := 0, 0
	for err := range errs {
		if err == nil {
			successes++
		} else {
			assert.ErrorIs(t, err, ErrCommissionConflict)
			conflicts++
		}
	}
	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, conflicts)
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, expected*2, profile.BalanceQuota)
}

// 冲正：冻结期退款不碰余额；结算后退款扣余额、不足记欠款；之后同类返现先抵欠款。
func (f *commissionFixture) reversalDebtOffset(t *testing.T) {
	distributor := f.makeUser("dist-v", 0)
	f.approveDistributor(distributor.Id, nil, nil)
	invitee := f.makeDistUser("invitee-v", distributor.Id)
	credited := int(10 * common.QuotaPerUnit)

	// 冻结期全额退款：只改状态，不动余额
	topUp := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp, credited)
	record := f.recordOf(topUp.Id)
	require.NoError(t, ReverseCommissionRecord(record.Id, "refund", 9))
	record = f.recordOf(topUp.Id)
	assert.Equal(t, CommissionStatusReversed, record.Status)
	assert.Equal(t, record.CommissionQuota, record.ReversedQuota)
	profile := f.reloadProfile(distributor.Id)
	assert.Equal(t, 0, profile.BalanceQuota)
	var debtCount int64
	require.NoError(t, f.db.Model(&CommissionDebt{}).Count(&debtCount).Error)
	assert.Equal(t, int64(0), debtCount)

	// 结算后退款：余额不够扣 → 欠款
	commission := credited * 1000 / 10000
	topUp2 := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp2, credited)
	record2 := f.recordOf(topUp2.Id)
	require.NoError(t, AdjustCommissionAvailableAt(record2.Id, 1, "test", 9))
	require.NoError(t, ConfirmCommissions([]int{record2.Id}, 9, "confirm"))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, commission, profile.BalanceQuota)

	// 先花掉一部分余额，使扣回不够
	require.NoError(t, f.db.Model(&DistributorProfile{}).Where("user_id = ?", distributor.Id).
		Update("balance_quota", 100).Error)
	require.NoError(t, ReverseCommissionRecord(record2.Id, "chargeback", 9))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, 0, profile.BalanceQuota)
	debt, err := GetCommissionDebt(distributor.Id, CommissionBalanceTypeDistributor)
	require.NoError(t, err)
	expectedDebt := commission - 100
	assert.Equal(t, expectedDebt, debt.DebtQuota)
	assert.Equal(t, expectedDebt, debt.TotalDebtQuota)

	// 之后的分销返现先抵欠款：500000 返现抵掉 499900，余 100 到账
	topUp3 := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp3, credited)
	record3 := f.recordOf(topUp3.Id)
	require.NoError(t, AdjustCommissionAvailableAt(record3.Id, 1, "test", 9))
	require.NoError(t, ConfirmCommissions([]int{record3.Id}, 9, "again"))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, 100, profile.BalanceQuota)
	debt, err = GetCommissionDebt(distributor.Id, CommissionBalanceTypeDistributor)
	require.NoError(t, err)
	assert.Equal(t, 0, debt.DebtQuota)
	assert.Equal(t, expectedDebt, debt.TotalOffsetQuota)

	var settlements []CommissionSettlement
	require.NoError(t, f.db.Where(map[string]any{"beneficiary_user_id": distributor.Id, "trigger": SettlementTriggerReversal}).Find(&settlements).Error)
	require.Len(t, settlements, 1)
	assert.Equal(t, 100, settlements[0].CreditedQuota)
	assert.Equal(t, expectedDebt, settlements[0].DebtAddedQuota)

	// 推广欠款不被分销返现抵扣（反向亦然），用独立流水验证
	referrer := f.makeUser("ref-v", 0)
	invitee2 := f.makeUser("invitee-v2", referrer.Id)
	topUpRef := f.makeTopUp(invitee2.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUpRef, credited)
	refRecord := f.recordOf(topUpRef.Id)
	require.NoError(t, f.db.Model(&User{}).Where("id = ?", referrer.Id).Update("aff_quota", 10).Error)
	require.NoError(t, ReverseCommissionRecord(refRecord.Id, "refund", 9))
	refDebt, err := GetCommissionDebt(referrer.Id, CommissionBalanceTypeAffQuota)
	require.NoError(t, err)
	assert.Equal(t, credited*150/10000-10, refDebt.DebtQuota)
	// referrer 同时有分销欠款，分销返现只抵分销欠款
	f.approveDistributor(referrer.Id, nil, nil)
	invitee3 := f.makeDistUser("invitee-v3", referrer.Id)
	topUpD := f.makeTopUp(invitee3.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUpD, credited)
	dRecord := f.recordOf(topUpD.Id)
	require.NoError(t, ConfirmCommissions([]int{dRecord.Id}, 9, "ok"))
	refDebt, err = GetCommissionDebt(referrer.Id, CommissionBalanceTypeAffQuota)
	require.NoError(t, err)
	assert.Equal(t, credited*150/10000-10, refDebt.DebtQuota, "referral debt untouched by distributor commission")

	// 欠款减免（在 referrer 的推广欠款上操作）：恒等式 total_debt - total_offset == debt
	require.NoError(t, WaiveCommissionDebt(referrer.Id, CommissionBalanceTypeAffQuota, 50, "manual waive", 9))
	refDebt, err = GetCommissionDebt(referrer.Id, CommissionBalanceTypeAffQuota)
	require.NoError(t, err)
	assert.Equal(t, refDebt.TotalDebtQuota-refDebt.TotalOffsetQuota, refDebt.DebtQuota)
	require.ErrorIs(t, WaiveCommissionDebt(referrer.Id, CommissionBalanceTypeAffQuota, refDebt.DebtQuota+1, "x", 9), ErrDebtExceeds)
}

// 比例优先级：活动 > 个人 > 默认；活动开始前/中/后按充值完成时间判断；重叠被拒。
func (f *commissionFixture) campaignRatePriority(t *testing.T) {
	distributor := f.makeUser("dist-p", 0)
	personalRate := 500
	f.approveDistributor(distributor.Id, &personalRate, nil)
	invitee := f.makeDistUser("invitee-p", distributor.Id)
	credited := int(10 * common.QuotaPerUnit)
	now := common.GetTimestamp()

	// 个人比例
	topUp := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, now)
	accrueCommission(topUp, credited)
	record := f.recordOf(topUp.Id)
	assert.Equal(t, credited*500/10000, record.CommissionQuota)
	assert.Equal(t, CommissionRateSourcePersonal, record.RateSource)

	// 活动覆盖个人比例
	campaign, err := CreateCommissionCampaign("double", CommissionProgramDistributor, 2000, now-3600, now+3600, "", false, 9)
	require.NoError(t, err)
	topUp2 := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, now)
	accrueCommission(topUp2, credited)
	record2 := f.recordOf(topUp2.Id)
	assert.Equal(t, credited*2000/10000, record2.CommissionQuota)
	assert.Equal(t, CommissionRateSourceCampaign, record2.RateSource)
	assert.Equal(t, campaign.Id, record2.CampaignId)

	// 活动时间重叠被拒
	_, err = CreateCommissionCampaign("overlap", CommissionProgramDistributor, 1000, now-10, now+10, "", false, 9)
	require.ErrorIs(t, err, ErrCampaignOverlap)
	// 不同 program 可重叠
	_, err = CreateCommissionCampaign("ref-campaign", CommissionProgramReferral, 300, now-3600, now+3600, "", false, 9)
	require.NoError(t, err)

	// 超过 30% 需 confirm_high_rate
	_, err = CreateCommissionCampaign("huge", CommissionProgramDistributor, 4000, now+7200, now+10000, "", false, 9)
	require.ErrorIs(t, err, ErrCampaignHighRate)
	_, err = CreateCommissionCampaign("huge", CommissionProgramDistributor, 4000, now+7200, now+10000, "", true, 9)
	require.NoError(t, err)

	// 已开始的活动只能把结束时间提前（且仍需晚于现在）
	require.ErrorIs(t, UpdateCommissionCampaign(campaign.Id, "x", 2500, campaign.StartsAt, now+8000, "", false, campaign.Version, 9), ErrCampaignStarted)
	require.ErrorIs(t, UpdateCommissionCampaign(campaign.Id, campaign.Name, campaign.RateBps, campaign.StartsAt, now-1, "", false, campaign.Version, 9), ErrCampaignStarted)
	require.NoError(t, UpdateCommissionCampaign(campaign.Id, campaign.Name, campaign.RateBps, campaign.StartsAt, now+50, "", false, campaign.Version, 9))
	// 结束后按个人比例
	topUp3 := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, now+120)
	accrueCommission(topUp3, credited)
	record3 := f.recordOf(topUp3.Id)
	assert.Equal(t, credited*500/10000, record3.CommissionQuota)

	// 取消未开始的活动
	future, err := CreateCommissionCampaign("future", CommissionProgramReferral, 200, now+7200, now+8000, "", false, 9)
	require.NoError(t, err)
	require.NoError(t, CancelCommissionCampaign(future.Id, future.Version, 9))
	require.ErrorIs(t, CancelCommissionCampaign(campaign.Id, campaign.Version+1, 9), ErrCampaignStarted)
}

// 提现：最低额边界、方式限制、未完成单、驳回退款、打款累计、转余额。
func (f *commissionFixture) withdrawalFlow(t *testing.T) {
	distributor := f.makeUser("dist-w", 0)
	f.approveDistributor(distributor.Id, nil, nil)
	// 注入余额
	require.NoError(t, f.db.Model(&DistributorProfile{}).Where("user_id = ?", distributor.Id).
		Update("balance_quota", int(20*common.QuotaPerUnit)).Error)
	InvalidateDistributorProfileCache(distributor.Id)

	minQuota, err := operation_setting.WithdrawMinQuota()
	require.NoError(t, err)
	// 10 元 / 7.0 汇率 ≈ 1.4286 USD → minQuota = ceil(1.4286 * 500000) = 714286
	assert.Equal(t, 714286, minQuota)

	// 低于最低额被拒
	_, err = CreateDistributorWithdrawal(distributor.Id, minQuota-1, WithdrawMethodAlipay,
		map[string]string{"name": "张三", "account": "a@x.com"})
	require.ErrorIs(t, err, ErrWithdrawAmountLow)

	// USDT 网络未配置被拒
	_, err = CreateDistributorWithdrawal(distributor.Id, minQuota, WithdrawMethodUSDT,
		map[string]string{"network": "trc20", "address": "TUsdtAddressForCommissionTestOnly"})
	require.Error(t, err)

	// 未开放方式被拒
	_, err = CreateDistributorWithdrawal(distributor.Id, minQuota, "paypal",
		map[string]string{"name": "x", "account": "y"})
	require.ErrorIs(t, err, ErrWithdrawMethod)

	// 等于最低额：通过；冻结金额
	w, err := CreateDistributorWithdrawal(distributor.Id, minQuota, WithdrawMethodAlipay,
		map[string]string{"name": "张三", "account": "a@x.com"})
	require.NoError(t, err)
	assert.Equal(t, "CNY", w.PayoutCurrency)
	// payout = minQuota/500000 * 7.0 ≈ 10.00 CNY
	assert.Equal(t, "10.00", w.PayoutAmount)
	profile := f.reloadProfile(distributor.Id)
	assert.Equal(t, int(20*common.QuotaPerUnit)-minQuota, profile.BalanceQuota)
	assert.Equal(t, minQuota, profile.WithdrawingQuota)

	// 同时只能一张未完成
	_, err = CreateDistributorWithdrawal(distributor.Id, minQuota, WithdrawMethodAlipay,
		map[string]string{"name": "张三", "account": "a@x.com"})
	require.ErrorIs(t, err, ErrWithdrawPending)

	// 超过余额被拒（先驳回已有单再试）
	require.NoError(t, ReviewDistributorWithdrawal(w.Id, "reject", "test reject", w.Version, 9))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, int(20*common.QuotaPerUnit), profile.BalanceQuota)
	assert.Equal(t, 0, profile.WithdrawingQuota)
	_, err = CreateDistributorWithdrawal(distributor.Id, int(25*common.QuotaPerUnit), WithdrawMethodAlipay,
		map[string]string{"name": "张三", "account": "a@x.com"})
	require.ErrorIs(t, err, ErrWithdrawBalance)

	// 审核 → 打款
	w2, err := CreateDistributorWithdrawal(distributor.Id, minQuota, WithdrawMethodAlipay,
		map[string]string{"name": "张三", "account": "a@x.com"})
	require.NoError(t, err)
	require.NoError(t, ReviewDistributorWithdrawal(w2.Id, "approve", "", w2.Version, 9))
	require.NoError(t, MarkDistributorWithdrawalPaid(w2.Id, "ref-123", "", w2.Version+1, 9))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, 0, profile.WithdrawingQuota)
	assert.Equal(t, minQuota, profile.TotalWithdrawnQuota)

	// 收款账户解密与脱敏
	account, err := DecryptWithdrawalAccount(w2)
	require.NoError(t, err)
	assert.Equal(t, "a@x.com", account["account"])
	assert.Equal(t, "****.com", MaskedWithdrawalAccount(w2))

	// 转入账户余额
	require.NoError(t, TransferDistributorBalanceToQuota(distributor.Id, minQuota))
	profile = f.reloadProfile(distributor.Id)
	assert.Equal(t, minQuota, profile.TotalTransferredQuota)
	user := f.reloadUser(distributor.Id)
	assert.Equal(t, minQuota, user.Quota)

	// 结算记录覆盖各 trigger
	var triggers []string
	require.NoError(t, f.db.Model(&CommissionSettlement{}).Where("beneficiary_user_id = ?", distributor.Id).
		Distinct().Pluck("trigger", &triggers).Error)
	assert.ElementsMatch(t, []string{SettlementTriggerWithdrawHold, SettlementTriggerWithdrawReject,
		SettlementTriggerWithdrawPaid, SettlementTriggerTransfer}, triggers)
}

// 申请：细则版本不一致拒绝；审批通过建身份；停用后充值改走推广。
func (f *commissionFixture) applicationFlow(t *testing.T) {
	user := f.makeUser("apply-u", 0)

	_, err := SubmitDistributorApplication(user.Id, "wx:abc", "渠道说明", operation_setting.DistributorAgreementVersion+1)
	require.ErrorIs(t, err, ErrTermsVersionMismatch)

	app, err := SubmitDistributorApplication(user.Id, "wx:abc", "渠道说明", operation_setting.DistributorAgreementVersion)
	require.NoError(t, err)
	// 重复 pending 被拒
	_, err = SubmitDistributorApplication(user.Id, "wx:abc", "渠道说明", operation_setting.DistributorAgreementVersion)
	require.ErrorIs(t, err, ErrApplicationExists)

	// 撤回后可重新申请
	require.NoError(t, WithdrawDistributorApplication(app.Id, user.Id))
	app2, err := SubmitDistributorApplication(user.Id, "wx:abc", "渠道说明", operation_setting.DistributorAgreementVersion)
	require.NoError(t, err)

	require.NoError(t, ReviewDistributorApplication(app2.Id, "approve", "", app2.Version, 9, nil, nil))
	InvalidateDistributorProfileCache(user.Id)
	profile := GetActiveDistributorProfile(user.Id)
	require.NotNil(t, profile)
	assert.Equal(t, DistributorStatusActive, profile.Status)

	// 审批并发：version 乐观锁
	require.ErrorIs(t, ReviewDistributorApplication(app2.Id, "reject", "x", app2.Version, 9, nil, nil), ErrDistributorConflict)

	// B1.10：只传 status 的部分更新不得清掉个人比例/冻结天数/备注
	rate, hold := 800, 5
	ratePtr, holdPtr := &rate, &hold
	note := "vip"
	require.NoError(t, UpdateDistributorProfile(user.Id, nil, &ratePtr, &holdPtr, &note, profile.Version, 9))
	profile = GetActiveDistributorProfile(user.Id)
	suspended := DistributorStatusSuspended
	require.NoError(t, UpdateDistributorProfile(user.Id, &suspended, nil, nil, nil, profile.Version, 9))
	kept, err := GetDistributorProfileByUser(user.Id)
	require.NoError(t, err)
	assert.Equal(t, DistributorStatusSuspended, kept.Status)
	assert.Equal(t, 800, *kept.RateBps)
	assert.Equal(t, 5, *kept.HoldDays)
	assert.Equal(t, "vip", kept.Note)
	invitee := f.makeUser("invitee-app", user.Id)
	credited := int(10 * common.QuotaPerUnit)
	topUp := f.makeTopUp(invitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUp, credited)
	record := f.recordOf(topUp.Id)
	assert.Equal(t, CommissionProgramReferral, record.Program)
	assert.Equal(t, credited*150/10000, record.CommissionQuota)

	distInvitee := f.makeDistUser("invitee-appd", user.Id)
	topUpD := f.makeTopUp(distInvitee.Id, PaymentProviderEpay, 10, 73, common.GetTimestamp())
	accrueCommission(topUpD, credited)
	var distCount int64
	require.NoError(t, f.db.Model(&CommissionRecord{}).Where("source_id = ?", topUpD.Id).Count(&distCount).Error)
	assert.Equal(t, int64(0), distCount)

	// 申请开关关闭拒绝
	other := f.makeUser("apply-o", 0)
	operation_setting.DistributorApplyEnabled = false
	_, err = SubmitDistributorApplication(other.Id, "c", "d", operation_setting.DistributorAgreementVersion)
	require.ErrorIs(t, err, ErrDistributorDisabled)
	operation_setting.DistributorApplyEnabled = true

	// B1.9：驳回 24 小时内重申请被拒并返回可重申请时间；超时放行
	rejected := f.makeUser("apply-r", 0)
	rApp, err := SubmitDistributorApplication(rejected.Id, "c", "d", operation_setting.DistributorAgreementVersion)
	require.NoError(t, err)
	require.NoError(t, ReviewDistributorApplication(rApp.Id, "reject", "不符合", rApp.Version, 9, nil, nil))
	_, err = SubmitDistributorApplication(rejected.Id, "c", "d", operation_setting.DistributorAgreementVersion)
	var tooSoon *ReapplyTooSoonError
	require.ErrorAs(t, err, &tooSoon)
	require.NoError(t, f.db.Model(&DistributorApplication{}).Where("id = ?", rApp.Id).
		Update("reviewed_at", common.GetTimestamp()-DistributorReapplyWaitSeconds-1).Error)
	_, err = SubmitDistributorApplication(rejected.Id, "c", "d", operation_setting.DistributorAgreementVersion)
	require.NoError(t, err)
}

// R3：归属写入失败时注册整体回滚——用户不存在，不留"永远没归属"的孤儿账户。
func TestRegisterAttributionFailureRollsBack(t *testing.T) {
	f := newCommissionFixture(t, "sqlite")
	inviter := f.makeUser("r3-inviter", 0)
	require.NoError(t, f.db.Migrator().DropTable(&InviteAttribution{}))
	newUser := &User{Username: "r3-new", Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, InviterId: inviter.Id}
	require.Error(t, newUser.InsertWithInvite(inviter.Id, CommissionProgramReferral, "aff"))
	var count int64
	require.NoError(t, f.db.Model(&User{}).Where("username = ?", "r3-new").Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

// R4：一次性拉新奖励（QuotaForInviter/QuotaForInvitee/aff_count）只发给推广归属；
// 分销归属注册一概不发。
func TestReferralBonusOnlyForReferralAttribution(t *testing.T) {
	f := newCommissionFixture(t, "sqlite")
	ps := operation_setting.GetPaymentSetting()
	prevConfirmed, prevVersion := ps.ComplianceConfirmed, ps.ComplianceTermsVersion
	prevInviter, prevInvitee := common.QuotaForInviter, common.QuotaForInvitee
	t.Cleanup(func() {
		ps.ComplianceConfirmed, ps.ComplianceTermsVersion = prevConfirmed, prevVersion
		common.QuotaForInviter, common.QuotaForInvitee = prevInviter, prevInvitee
	})
	ps.ComplianceConfirmed, ps.ComplianceTermsVersion = true, "v1"
	common.QuotaForInviter, common.QuotaForInvitee = 1000, 500

	referrer := f.makeUser("r4-ref", 0)
	distInviter := f.makeUser("r4-dist", 0)

	refUser := &User{Username: "r4-ref-new", Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, InviterId: referrer.Id}
	require.NoError(t, refUser.InsertWithInvite(referrer.Id, CommissionProgramReferral, "aff"))
	afterRef := f.reloadUser(referrer.Id)
	assert.Equal(t, 1, afterRef.AffCount)
	assert.Equal(t, 1000, afterRef.AffQuota)
	assert.Equal(t, 500, f.reloadUser(refUser.Id).Quota-common.QuotaForNewUser)

	distUser := &User{Username: "r4-dist-new", Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, InviterId: distInviter.Id}
	require.NoError(t, distUser.InsertWithInvite(distInviter.Id, CommissionProgramDistributor, "Dabc123"))
	afterDist := f.reloadUser(distInviter.Id)
	assert.Equal(t, 0, afterDist.AffCount)
	assert.Equal(t, 0, afterDist.AffQuota)
	assert.Equal(t, 0, f.reloadUser(distUser.Id).Quota-common.QuotaForNewUser)
}

// 自邀跳过（防御性检查）：归属指向自己的记录被直接写入时记账必须跳过。
func TestSelfInviteSkipped(t *testing.T) {
	f := newCommissionFixture(t, "sqlite")
	user := f.makeUser("self-inv", 0)
	require.NoError(t, f.db.Create(&InviteAttribution{InviteeUserId: user.Id, Program: CommissionProgramReferral, InviterUserId: user.Id, Code: "x", CreatedAt: common.GetTimestamp()}).Error)
	topUp := f.makeTopUp(user.Id, PaymentProviderEpay, 100, 730, common.GetTimestamp())
	accrueCommission(topUp, int(100*common.QuotaPerUnit))
	var count int64
	require.NoError(t, f.db.Model(&CommissionRecord{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}
