package model

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	RiskWordActionRecord        = "record"
	RiskWordActionBlock         = "block"
	RiskWordActionBlockRestrict = "block_restrict"

	RiskWordCategoryStatusEnabled  = 1
	RiskWordCategoryStatusDisabled = 2

	// RiskWordMaxLength 单个词的最大字符数（按 rune 计）。
	RiskWordMaxLength = 64
	// RiskGeneralCategoryKey 是旧扁平词表迁移而来的保留类别，不能删除。
	RiskGeneralCategoryKey = "general"
)

// RiskWordCategory 分类词库：Key 写入风险事件且创建后不可改；
// Words 一行一个词，保存前已规范化（去空白、小写、去重、排序）。
type RiskWordCategory struct {
	Id        int    `json:"id"`
	Key       string `json:"key" gorm:"type:varchar(32);uniqueIndex;not null"`
	Name      string `json:"name" gorm:"type:varchar(64);not null"`
	Action    string `json:"action" gorm:"type:varchar(16);not null"`
	Words     string `json:"-" gorm:"type:text"`
	WordCount int    `json:"word_count"`
	Status    int    `json:"status"`
	Version   int    `json:"version"`
	UpdatedAt int64  `json:"updated_at" gorm:"type:bigint"`
	UpdatedBy int    `json:"updated_by"`
}

func ValidRiskWordAction(action string) bool {
	return action == RiskWordActionRecord || action == RiskWordActionBlock || action == RiskWordActionBlockRestrict
}

func validRiskWordKey(key string) bool {
	if key == "" || utf8.RuneCountInString(key) > 32 {
		return false
	}
	for _, r := range key {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_') {
			return false
		}
	}
	return true
}

func invalidRiskWord(word string) bool {
	return utf8.RuneCountInString(word) > RiskWordMaxLength ||
		strings.IndexFunc(word, unicode.IsControl) >= 0
}

// NormalizeRiskWords 把多行文本规范成词表：逐行去空白、小写化；空行跳过；
// 超过 64 字符或含控制字符的行计入 invalid。返回去重排序后的词。
func NormalizeRiskWords(text string) (words []string, invalid int) {
	seen := make(map[string]struct{})
	for line := range strings.Lines(text) {
		word := strings.ToLower(strings.TrimSpace(line))
		if word == "" {
			continue
		}
		if invalidRiskWord(word) {
			invalid++
			continue
		}
		if _, ok := seen[word]; ok {
			continue
		}
		seen[word] = struct{}{}
		words = append(words, word)
	}
	return words, invalid
}

func joinRiskWords(words []string) string {
	return strings.Join(words, "\n")
}

func splitRiskWords(text string) []string {
	if text == "" {
		return nil
	}
	words := make([]string, 0, 32)
	for line := range strings.Lines(text) {
		if w := strings.TrimSpace(line); w != "" {
			words = append(words, w)
		}
	}
	return words
}

// migrateLegacySensitiveWords 首次启动时把旧扁平词表迁成 general 类别。
// 表非空即视为已迁移；只读 options 表里的存量值，不用默认值。
func migrateLegacySensitiveWords() error {
	var count int64
	if err := DB.Model(&RiskWordCategory{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	var opt Option
	err := DB.Where(commonKeyCol+" = ?", "SensitiveWords").Take(&opt).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	words, _ := NormalizeRiskWords(opt.Value)
	if len(words) == 0 {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var inside int64
		if err := tx.Model(&RiskWordCategory{}).Count(&inside).Error; err != nil {
			return err
		}
		if inside > 0 {
			return nil
		}
		return tx.Create(&RiskWordCategory{
			Key:       RiskGeneralCategoryKey,
			Name:      "通用",
			Action:    RiskWordActionBlock,
			Words:     joinRiskWords(words),
			WordCount: len(words),
			Status:    RiskWordCategoryStatusEnabled,
			Version:   1,
			UpdatedAt: common.GetTimestamp(),
		}).Error
	})
}

// RiskWordCategoryWord 是给匹配器用的只读视图。
type RiskWordCategoryWord struct {
	Id      int
	Key     string
	Name    string
	Action  string
	Version int
	Words   []string
}

// RiskWordCategoryVersion 只取签名所需的列，供匹配器每次检查缓存键。
type RiskWordCategoryVersion struct {
	Id      int
	Version int
}

func ListEnabledRiskCategoryVersions() ([]RiskWordCategoryVersion, error) {
	versions := make([]RiskWordCategoryVersion, 0)
	err := DB.Model(&RiskWordCategory{}).
		Select("id", "version").
		Where("status = ?", RiskWordCategoryStatusEnabled).
		Order("id").Scan(&versions).Error
	return versions, err
}

// ListEnabledRiskWordCategories 返回启用类别的词和签名信息；匹配器据此建自动机。
func ListEnabledRiskWordCategories() ([]RiskWordCategoryWord, error) {
	var rows []RiskWordCategory
	err := DB.Select("id", commonKeyCol, "name", "action", "words", "version").
		Where("status = ?", RiskWordCategoryStatusEnabled).
		Order("id").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	categories := make([]RiskWordCategoryWord, 0, len(rows))
	for _, row := range rows {
		categories = append(categories, RiskWordCategoryWord{
			Id:      row.Id,
			Key:     row.Key,
			Name:    row.Name,
			Action:  row.Action,
			Version: row.Version,
			Words:   splitRiskWords(row.Words),
		})
	}
	return categories, nil
}

// ListRiskWordCategories 列表页用，不读 Words 全文。
func ListRiskWordCategories() ([]RiskWordCategory, error) {
	rows := make([]RiskWordCategory, 0)
	err := DB.Select("id", commonKeyCol, "name", "action", "word_count", "status", "version", "updated_at", "updated_by").
		Order("id").Find(&rows).Error
	return rows, err
}

func GetRiskWordCategory(id int) (*RiskWordCategory, error) {
	if id <= 0 {
		return nil, ErrRiskInvalid
	}
	var row RiskWordCategory
	err := DB.Take(&row, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrRiskNotFound
	}
	return &row, err
}

func CreateRiskWordCategory(key, name, action string, actorID int) (*RiskWordCategory, error) {
	key = strings.TrimSpace(key)
	name = strings.TrimSpace(name)
	if !validRiskWordKey(key) || name == "" || utf8.RuneCountInString(name) > 64 || !ValidRiskWordAction(action) || actorID <= 0 {
		return nil, ErrRiskInvalid
	}
	category := &RiskWordCategory{
		Key: key, Name: name, Action: action,
		Status: RiskWordCategoryStatusEnabled, Version: 1,
		UpdatedAt: common.GetTimestamp(), UpdatedBy: actorID,
	}
	err := DB.Create(category).Error
	if isRiskDuplicateKey(err) {
		return nil, ErrRiskConflict
	}
	return category, err
}

// isRiskDuplicateKey 覆盖三种驱动的唯一约束错误文案。
func isRiskDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "Duplicate") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "UNIQUE constraint failed")
}

// UpdateRiskWordCategory 只允许改显示名、处置和状态；Key 与词表不经此接口。
func UpdateRiskWordCategory(id int, name, action string, status, expectedVersion, actorID int) (*RiskWordCategory, error) {
	name = strings.TrimSpace(name)
	if id <= 0 || name == "" || utf8.RuneCountInString(name) > 64 || !ValidRiskWordAction(action) ||
		(status != RiskWordCategoryStatusEnabled && status != RiskWordCategoryStatusDisabled) ||
		expectedVersion <= 0 || actorID <= 0 {
		return nil, ErrRiskInvalid
	}
	var row RiskWordCategory
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&RiskWordCategory{}).
			Where("id = ? AND version = ?", id, expectedVersion).
			Updates(map[string]any{
				"name": name, "action": action, "status": status,
				"version": expectedVersion + 1, "updated_at": common.GetTimestamp(), "updated_by": actorID,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			var count int64
			if err := tx.Model(&RiskWordCategory{}).Where("id = ?", id).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return ErrRiskNotFound
			}
			return ErrRiskConflict
		}
		return tx.Take(&row, id).Error
	})
	return &row, err
}

// DeleteRiskWordCategory general 类别不能删；其余按版本 CAS 删除。
func DeleteRiskWordCategory(id, expectedVersion, actorID int) error {
	if id <= 0 || expectedVersion <= 0 || actorID <= 0 {
		return ErrRiskInvalid
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var row RiskWordCategory
		if err := tx.Select("id", commonKeyCol).Take(&row, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrRiskNotFound
			}
			return err
		}
		if row.Key == RiskGeneralCategoryKey {
			return ErrRiskInvalid
		}
		result := tx.Where("id = ? AND version = ?", id, expectedVersion).Delete(&RiskWordCategory{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrRiskConflict
		}
		return nil
	})
}

// RiskCategoryWordSet 返回类别的现有词集合，供导入预览比对。
func RiskCategoryWordSet(id int) (map[string]struct{}, error) {
	row, err := GetRiskWordCategory(id)
	if err != nil {
		return nil, err
	}
	set := make(map[string]struct{}, row.WordCount)
	for _, w := range splitRiskWords(row.Words) {
		set[w] = struct{}{}
	}
	return set, nil
}

// ImportRiskWords 按 append/replace 模式写入词表，版本 CAS。
// words 必须已规范化。返回新增与重复计数。
func ImportRiskWords(id int, words []string, replace bool, expectedVersion, actorID int) (added, duplicate int, err error) {
	if id <= 0 || expectedVersion <= 0 || actorID <= 0 {
		return 0, 0, ErrRiskInvalid
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var row RiskWordCategory
		if err := tx.Select("id", "words", "version").Take(&row, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrRiskNotFound
			}
			return err
		}
		existing := make(map[string]struct{}, row.WordCount+len(words))
		merged := make([]string, 0, row.WordCount+len(words))
		if !replace {
			for _, w := range splitRiskWords(row.Words) {
				existing[w] = struct{}{}
				merged = append(merged, w)
			}
		}
		for _, w := range words {
			if _, ok := existing[w]; ok {
				duplicate++
				continue
			}
			existing[w] = struct{}{}
			merged = append(merged, w)
			added++
		}
		result := tx.Model(&RiskWordCategory{}).
			Where("id = ? AND version = ?", id, expectedVersion).
			Updates(map[string]any{
				"words": joinRiskWords(merged), "word_count": len(merged),
				"version": expectedVersion + 1, "updated_at": common.GetTimestamp(), "updated_by": actorID,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrRiskConflict
		}
		return nil
	})
	return added, duplicate, err
}

// GetRiskCategoryWords 导出用：返回规范化后的全文。
func GetRiskCategoryWords(id int) ([]string, int, error) {
	row, err := GetRiskWordCategory(id)
	if err != nil {
		return nil, 0, err
	}
	return splitRiskWords(row.Words), row.WordCount, nil
}
