package controller

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func riskParamID(c *gin.Context, name string) (int, error) {
	id, err := strconv.Atoi(c.Param(name))
	if err != nil || id <= 0 {
		return 0, model.ErrRiskInvalid
	}
	return id, nil
}

// GetRiskSelfState F5.1：登录用户自己的阶梯状态（顶部提示条与倒计时）。
func GetRiskSelfState(c *gin.Context) {
	state, err := model.GetRiskUserState(c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, state)
}

func ListRiskWordCategories(c *gin.Context) {
	rows, err := model.ListRiskWordCategories()
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

type riskCategoryCreateRequest struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Action string `json:"action"`
}

func CreateRiskWordCategory(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskCategoryCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	category, err := model.CreateRiskWordCategory(request.Key, request.Name, request.Action, c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	service.InvalidateRiskMatcher()
	recordRiskAudit(c, "risk.category.create", map[string]any{
		"key": category.Key, "action": category.Action,
		"word_count_before": 0, "word_count_after": category.WordCount, "version": category.Version,
	})
	common.ApiSuccess(c, category)
}

type riskCategoryUpdateRequest struct {
	Name            string `json:"name"`
	Action          string `json:"action"`
	Status          int    `json:"status"`
	ExpectedVersion int    `json:"expected_version"`
}

func UpdateRiskWordCategory(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskCategoryUpdateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	before, err := model.GetRiskWordCategory(id)
	if err != nil {
		riskError(c, err)
		return
	}
	category, err := model.UpdateRiskWordCategory(id, request.Name, request.Action, request.Status, request.ExpectedVersion, c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	service.InvalidateRiskMatcher()
	recordRiskAudit(c, "risk.category.update", map[string]any{
		"key": category.Key, "action": category.Action,
		"word_count_before": before.WordCount, "word_count_after": category.WordCount, "version": category.Version,
	})
	common.ApiSuccess(c, category)
}

type riskCategoryDeleteRequest struct {
	ExpectedVersion int `json:"expected_version"`
}

func DeleteRiskWordCategory(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskCategoryDeleteRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	before, err := model.GetRiskWordCategory(id)
	if err != nil {
		riskError(c, err)
		return
	}
	if err := model.DeleteRiskWordCategory(id, request.ExpectedVersion, c.GetInt("id")); err != nil {
		riskError(c, err)
		return
	}
	service.InvalidateRiskMatcher()
	recordRiskAudit(c, "risk.category.delete", map[string]any{
		"key": before.Key, "action": before.Action,
		"word_count_before": before.WordCount, "word_count_after": 0, "version": request.ExpectedVersion,
	})
	common.ApiSuccess(c, gin.H{"id": id})
}

// ExportRiskWordCategory 导出词表，text/plain 附件，一行一个词。
func ExportRiskWordCategory(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	category, err := model.GetRiskWordCategory(id)
	if err != nil {
		riskError(c, err)
		return
	}
	words, count, err := model.GetRiskCategoryWords(id)
	if err != nil {
		riskError(c, err)
		return
	}
	recordRiskAudit(c, "risk.category.export", map[string]any{"key": category.Key, "word_count": count})
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=risk-words-%s.txt", category.Key))
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(joinLines(words)))
}

func joinLines(words []string) string {
	if len(words) == 0 {
		return ""
	}
	out := words[0]
	for _, w := range words[1:] {
		out += "\n" + w
	}
	return out + "\n"
}

// riskImportMaxBytes 词库文件大小上限 2 MB；multipart 信封另加边界开销余量。
const riskImportMaxBytes = 2 * 1024 * 1024

// readRiskImportBody 按 Content-Type 取词表文本：multipart/form-data 读取
// file 字段内容（浏览器 FormData / curl -F），其余按裸文本处理
// （curl --data-binary、fetch 直传）。2 MB 上限对词表字节生效。
func readRiskImportBody(c *gin.Context) ([]byte, error) {
	if strings.HasPrefix(c.GetHeader("Content-Type"), "multipart/form-data") {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, riskImportMaxBytes+64*1024)
		file, err := c.FormFile("file")
		if err != nil {
			return nil, err
		}
		src, err := file.Open()
		if err != nil {
			return nil, err
		}
		defer src.Close()
		body, err := io.ReadAll(io.LimitReader(src, riskImportMaxBytes+1))
		if err != nil || int64(len(body)) > riskImportMaxBytes {
			return nil, model.ErrRiskInvalid
		}
		return body, nil
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, riskImportMaxBytes)
	return io.ReadAll(c.Request.Body)
}

// PreviewRiskWordImport 上传词表（multipart file 字段或裸文本，一行一个词，
// 最大 2 MB）做导入预览，不回显词。
func PreviewRiskWordImport(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	body, err := readRiskImportBody(c)
	if err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	if !utf8.Valid(body) {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	if _, err := model.GetRiskWordCategory(id); err != nil {
		riskError(c, err)
		return
	}
	words, invalid := model.NormalizeRiskWords(string(body))
	existing, err := model.RiskCategoryWordSet(id)
	if err != nil {
		riskError(c, err)
		return
	}
	preview := &service.RiskImportPreview{CategoryID: id, Words: words, Invalid: invalid}
	for _, word := range words {
		if _, dup := existing[word]; dup {
			preview.Duplicate++
		} else {
			preview.Added++
		}
	}
	preview.Total = preview.Added + preview.Duplicate + invalid
	previewID := service.StoreRiskImportPreview(preview)
	common.ApiSuccess(c, gin.H{
		"total": preview.Total, "added": preview.Added,
		"duplicate": preview.Duplicate, "invalid": invalid, "preview_id": previewID,
	})
}

type riskImportCommitRequest struct {
	PreviewID       string `json:"preview_id"`
	Mode            string `json:"mode"`
	ExpectedVersion int    `json:"expected_version"`
}

func CommitRiskWordImport(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskImportCommitRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	if request.Mode != "append" && request.Mode != "replace" {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	category, err := model.GetRiskWordCategory(id)
	if err != nil {
		riskError(c, err)
		return
	}
	preview := service.TakeRiskImportPreview(request.PreviewID, id)
	if preview == nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	added, duplicate, err := model.ImportRiskWords(id, preview.Words, request.Mode == "replace", request.ExpectedVersion, c.GetInt("id"))
	if err != nil {
		riskError(c, err)
		return
	}
	service.InvalidateRiskMatcher()
	recordRiskAudit(c, "risk.category.import", map[string]any{
		"key": category.Key, "added": added, "duplicate": duplicate, "invalid": preview.Invalid,
	})
	common.ApiSuccess(c, gin.H{"added": added, "duplicate": duplicate, "invalid": preview.Invalid})
}

// GetRiskUserState 管理员查看某用户阶梯状态 + 最近 30 天按类别命中次数。
func GetRiskUserState(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	state, err := model.GetRiskUserState(id)
	if err != nil {
		riskError(c, err)
		return
	}
	hits, err := model.ListRiskUserCategoryHits(id, common.GetTimestamp()-30*86400)
	if err != nil {
		riskError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"level": state.Level, "hits": state.Hits,
		"restricted_until": state.RestrictedUntil, "disabled": state.Disabled,
		"category_hits": hits,
	})
}

type riskReasonRequest struct {
	Reason string `json:"reason"`
}

func RevokeRiskRestriction(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskReasonRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	before, err := model.GetRiskUserState(id)
	if err != nil {
		riskError(c, err)
		return
	}
	if err := model.RevokeRiskRestriction(id, c.GetInt("id"), request.Reason); err != nil {
		riskError(c, err)
		return
	}
	recordRiskAudit(c, "risk.restriction.revoke", map[string]any{
		"user_id": id, "level": before.Level, "restricted_until": before.RestrictedUntil,
		"reason": request.Reason,
	})
	common.ApiSuccess(c, gin.H{"user_id": id})
}

func ReenableRiskUser(c *gin.Context) {
	id, err := riskParamID(c, "id")
	if err != nil {
		riskError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16*1024)
	var request riskReasonRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		riskError(c, model.ErrRiskInvalid)
		return
	}
	authVersion, err := model.ReenableRiskUser(id, c.GetInt("id"), request.Reason)
	if err != nil {
		riskError(c, err)
		return
	}
	model.FinishRiskReenable(id, authVersion)
	recordRiskAudit(c, "risk.user.reenable", map[string]any{
		"user_id": id, "reason": request.Reason,
	})
	common.ApiSuccess(c, gin.H{"user_id": id})
}
