package service

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// RiskImportPreview 导入预览：词只留在服务端内存，接口不回显；10 分钟有效。
type RiskImportPreview struct {
	CategoryID int
	Words      []string
	Total      int
	Added      int
	Duplicate  int
	Invalid    int
	ExpiresAt  int64
}

const riskImportPreviewTTLSeconds = 600

var riskImportPreviews sync.Map

// StoreRiskImportPreview 保存规范化后的待导入词，返回 preview_id。
func StoreRiskImportPreview(preview *RiskImportPreview) string {
	preview.ExpiresAt = common.GetTimestamp() + riskImportPreviewTTLSeconds
	id := common.NewRequestId()
	riskImportPreviews.Store(id, preview)
	return id
}

// TakeRiskImportPreview 取走预览（一次性消费）；过期、不存在或类别不符返回 nil。
func TakeRiskImportPreview(previewID string, categoryID int) *RiskImportPreview {
	if previewID == "" || len(previewID) > 64 {
		return nil
	}
	value, ok := riskImportPreviews.LoadAndDelete(previewID)
	if !ok {
		return nil
	}
	preview, ok := value.(*RiskImportPreview)
	if !ok || preview.CategoryID != categoryID || preview.ExpiresAt < time.Now().Unix() {
		return nil
	}
	return preview
}
