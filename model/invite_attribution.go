package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// InviteAttribution 每个客户一条归属记录：注册时写入，之后不可修改。
// program 决定该客户产生的返现走推广还是分销，与邀请人身份变化无关。
type InviteAttribution struct {
	Id            int    `json:"id" gorm:"primaryKey"`
	InviteeUserId int    `json:"invitee_user_id" gorm:"uniqueIndex"`
	Program       string `json:"program" gorm:"type:varchar(16);index"`
	InviterUserId int    `json:"inviter_user_id" gorm:"index"`
	Code          string `json:"code" gorm:"type:varchar(32)"`
	CreatedAt     int64  `json:"created_at" gorm:"type:bigint"`
}

// ResolveInviteAttribution 按注册请求里的码解析归属。
// dist_code 优先：只要带了 dist 参数就只按分销码解析，无效或分销商已停用
// 都按无邀请人处理，不降级为推广。没有 dist 参数才看 aff_code。
func ResolveInviteAttribution(affCode string, distCode string) (program string, inviterId int, code string) {
	if distCode != "" {
		var profile DistributorProfile
		err := DB.Select("user_id").Where("dist_code = ? AND status = ?", distCode, DistributorStatusActive).Take(&profile).Error
		if err != nil {
			return "", 0, ""
		}
		return CommissionProgramDistributor, profile.UserId, distCode
	}
	if affCode == "" {
		return "", 0, ""
	}
	id, err := GetUserIdByAffCode(affCode)
	if err != nil || id <= 0 {
		return "", 0, ""
	}
	return CommissionProgramReferral, id, affCode
}

// SaveInviteAttribution 写入归属；自邀或空归属不写，重复注册幂等。
func SaveInviteAttribution(inviteeUserId int, program string, inviterId int, code string) error {
	return SaveInviteAttributionTx(DB, inviteeUserId, program, inviterId, code)
}

// SaveInviteAttributionTx 在已有事务里写归属（OAuth 注册与用户创建原子化）。
func SaveInviteAttributionTx(tx *gorm.DB, inviteeUserId int, program string, inviterId int, code string) error {
	if inviteeUserId <= 0 || inviterId <= 0 || inviteeUserId == inviterId {
		return nil
	}
	if program != CommissionProgramReferral && program != CommissionProgramDistributor {
		return nil
	}
	attr := &InviteAttribution{
		InviteeUserId: inviteeUserId,
		Program:       program,
		InviterUserId: inviterId,
		Code:          code,
		CreatedAt:     common.GetTimestamp(),
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(attr).Error
}

// ListInviteAttributions 归属清单（管理员核对 B1.16），按 program 过滤、分页。
func ListInviteAttributions(program string, start int, size int) ([]InviteAttribution, int64, error) {
	var total int64
	query := DB.Model(&InviteAttribution{})
	if program == CommissionProgramReferral || program == CommissionProgramDistributor {
		query = query.Where("program = ?", program)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []InviteAttribution
	err := query.Order("id DESC").Offset(start).Limit(size).Find(&items).Error
	return items, total, err
}

// GetInviteAttribution 返回客户的归属；没有记录返回 nil。
func GetInviteAttribution(inviteeUserId int) *InviteAttribution {
	var attr InviteAttribution
	if err := DB.Where("invitee_user_id = ?", inviteeUserId).Take(&attr).Error; err != nil {
		return nil
	}
	return &attr
}

// generateDistCode 生成 `D` 开头的分销码，与 4 位 aff_code 区分开。
// 必须在审批事务的同一会话里查重，否则 SQLite 下会自锁。
func generateDistCode(tx *gorm.DB) (string, error) {
	for range 8 {
		code := "D" + common.GetRandomString(6)
		var count int64
		if err := tx.Model(&DistributorProfile{}).Where("dist_code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", errors.New("failed to allocate a unique distributor code")
}

// backfillInviteAttributions 为升级前的老数据补写归属（B1.16，幂等）：
// 有被邀请关系的用户按其在 commission_records 里的第一笔流水类型补写；
// 两边都有流水的按最早一条，并输出清单给管理员核对。同时为已存在的
// 分销档案补发 dist_code。返回补写条数。
func backfillInviteAttributions() (int, error) {
	created := 0
	// 1) 老分销档案补发分销码
	var profiles []DistributorProfile
	if err := DB.Where("dist_code IS NULL OR dist_code = ''").Find(&profiles).Error; err != nil {
		return 0, err
	}
	for i := range profiles {
		code, err := generateDistCode(DB)
		if err != nil {
			return created, err
		}
		if err := DB.Model(&DistributorProfile{}).Where("id = ? AND (dist_code IS NULL OR dist_code = '')", profiles[i].Id).
			Update("dist_code", code).Error; err != nil {
			return created, err
		}
	}
	if len(profiles) > 0 {
		common.SysLog(fmt.Sprintf("backfilled dist_code for %d distributor profiles", len(profiles)))
	}
	// 2) 有邀请关系但没有归属记录的用户
	var users []User
	if err := DB.Select("id", "inviter_id").Where("inviter_id > 0").Find(&users).Error; err != nil {
		return created, err
	}
	var ambiguous []int
	for i := range users {
		u := &users[i]
		if GetInviteAttribution(u.Id) != nil {
			continue
		}
		program := CommissionProgramReferral
		var first CommissionRecord
		err := DB.Select("id", "program").
			Where("invitee_user_id = ? AND beneficiary_user_id = ?", u.Id, u.InviterId).
			Order("id").Limit(1).Take(&first).Error
		if err == nil {
			program = first.Program
			var otherCount int64
			other := CommissionProgramReferral
			if program == CommissionProgramReferral {
				other = CommissionProgramDistributor
			}
			if cntErr := DB.Model(&CommissionRecord{}).
				Where("invitee_user_id = ? AND beneficiary_user_id = ? AND program = ?", u.Id, u.InviterId, other).
				Count(&otherCount).Error; cntErr == nil && otherCount > 0 {
				ambiguous = append(ambiguous, u.Id)
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return created, err
		}
		if err := SaveInviteAttribution(u.Id, program, u.InviterId, ""); err != nil {
			return created, err
		}
		created++
	}
	// 3) aff_count 只统计推广归属（R4）：按归属表重算，清掉分销注册造成的虚增。
	if err := DB.Exec(`UPDATE users SET aff_count = (
		SELECT COUNT(*) FROM invite_attributions ia
		WHERE ia.inviter_user_id = users.id AND ia.program = ?)`, CommissionProgramReferral).Error; err != nil {
		return created, err
	}
	if created > 0 {
		common.SysLog(fmt.Sprintf("backfilled invite_attributions for %d users", created))
	}
	if len(ambiguous) > 0 {
		common.SysLog(fmt.Sprintf("invite_attributions backfill: %d users have records on both programs, assigned by earliest record: %v", len(ambiguous), ambiguous))
		if data, err := common.Marshal(ambiguous); err == nil {
			if err := UpdateOption("InviteAttributionBackfillReview", string(data)); err != nil {
				common.SysError("failed to persist invite_attributions backfill review list: " + err.Error())
			}
		}
	}
	return created, nil
}
