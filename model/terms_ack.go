package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 两份规则文本各自独立版本（B1.8）：
// - referral_rules        《推广返现规则》，版本号 = CommissionTermsVersion
// - distributor_agreement 《分销协议》，   版本号 = DistributorAgreementVersion
// 已读（read）与同意（agree）分开记录；同意版本落后当前版本时，
// 分销提现与转余额被拒绝，直到重新确认（§1.2.10）。
const (
	TermsDocReferralRules        = "referral_rules"
	TermsDocDistributorAgreement = "distributor_agreement"

	TermsKindRead  = "read"
	TermsKindAgree = "agree"
)

type TermsAcknowledgement struct {
	Id        int    `json:"id" gorm:"primaryKey"`
	UserId    int    `json:"user_id" gorm:"uniqueIndex:idx_termsack_user_doc_kind_ver,priority:1"`
	Doc       string `json:"doc" gorm:"type:varchar(32);uniqueIndex:idx_termsack_user_doc_kind_ver,priority:2"`
	Kind      string `json:"kind" gorm:"type:varchar(16);uniqueIndex:idx_termsack_user_doc_kind_ver,priority:3"`
	Version   int    `json:"version" gorm:"uniqueIndex:idx_termsack_user_doc_kind_ver,priority:4"`
	CreatedAt int64  `json:"created_at" gorm:"type:bigint"`
}

// TermsDocCurrentVersion 当前生效的文本版本。
func TermsDocCurrentVersion(doc string) int {
	if doc == TermsDocDistributorAgreement {
		return operation_setting.DistributorAgreementVersion
	}
	return operation_setting.CommissionTermsVersion
}

// termsVersionForProgram 流水上记的版本号按业务线取对应文档版本：
// referral→《推广返现规则》，distributor→《分销协议》。
func termsVersionForProgram(program string) int {
	if program == CommissionProgramDistributor {
		return TermsDocCurrentVersion(TermsDocDistributorAgreement)
	}
	return TermsDocCurrentVersion(TermsDocReferralRules)
}

// AcknowledgeTermsTx 在事务里记录一条已读/同意；同一版本重复记录幂等。
func AcknowledgeTermsTx(tx *gorm.DB, userId int, doc string, kind string, version int) error {
	if userId <= 0 || version <= 0 {
		return nil
	}
	ack := &TermsAcknowledgement{
		UserId:    userId,
		Doc:       doc,
		Kind:      kind,
		Version:   version,
		CreatedAt: common.GetTimestamp(),
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(ack).Error
}

// LatestTermsAckVersion 返回用户在某文档某类型下记录过的最高版本；无记录返回 0。
func LatestTermsAckVersion(userId int, doc string, kind string) (int, error) {
	var maxVer *int
	err := DB.Model(&TermsAcknowledgement{}).
		Select("MAX(version)").
		Where("user_id = ? AND doc = ? AND kind = ?", userId, doc, kind).
		Scan(&maxVer).Error
	if err != nil || maxVer == nil {
		return 0, err
	}
	return *maxVer, nil
}

// hasCurrentAgreementTx 校验用户是否已同意当前版本的《分销协议》；供提现/转余额门禁用。
func hasCurrentAgreementTx(tx *gorm.DB, userId int) (bool, error) {
	current := TermsDocCurrentVersion(TermsDocDistributorAgreement)
	var count int64
	err := tx.Model(&TermsAcknowledgement{}).
		Where("user_id = ? AND doc = ? AND kind = ? AND version >= ?", userId, TermsDocDistributorAgreement, TermsKindAgree, current).
		Count(&count).Error
	return count > 0, err
}

// backfillTermsAcknowledgements 老数据迁移：把每个分销商最近一次"同意"（以最新
// 一条带 agreed_terms_version 的申请为准）补写进 terms_acknowledgements。
// 幂等，靠 (user,doc,kind,version) 唯一键去重。
func backfillTermsAcknowledgements() (int, error) {
	var apps []DistributorApplication
	if err := DB.Select("user_id", "agreed_terms_version", "agreed_at").
		Where("agreed_terms_version > 0").
		Order("id").
		Find(&apps).Error; err != nil {
		return 0, err
	}
	created := 0
	for i := range apps {
		ack := &TermsAcknowledgement{
			UserId:    apps[i].UserId,
			Doc:       TermsDocDistributorAgreement,
			Kind:      TermsKindAgree,
			Version:   apps[i].AgreedTermsVersion,
			CreatedAt: apps[i].AgreedAt,
		}
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(ack).Error; err != nil {
			return created, err
		}
		created++
	}
	if created > 0 {
		common.SysLog("backfilled terms_acknowledgements from distributor applications")
	}
	return created, nil
}
