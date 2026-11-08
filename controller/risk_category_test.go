package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// A-2：multipart/form-data 上传只导入 file 字段里的词，表单边界线不进词库；
// 裸文本（curl --data-binary）保持原样可用。
func TestPreviewRiskWordImportMultipart(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.RiskWordCategory{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		_ = sqlDB.Close()
	})
	category := &model.RiskWordCategory{Key: "deny", Name: "deny", Action: model.RiskWordActionBlock,
		Words: "", WordCount: 0, Status: model.RiskWordCategoryStatusEnabled, Version: 1}
	require.NoError(t, db.Create(category).Error)

	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", 1) })
	router.POST("/risk/categories/:id/import/preview", PreviewRiskWordImport)

	previewWords := func(t *testing.T, body *bytes.Buffer, contentType string) []string {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/risk/categories/"+itoa(category.Id)+"/import/preview", body)
		req.Header.Set("Content-Type", contentType)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		require.Equal(t, 200, out.Code, out.Body.String())
		assert.Contains(t, out.Body.String(), `"preview_id"`)
		var resp struct {
			Data struct {
				Added     int    `json:"added"`
				PreviewID string `json:"preview_id"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(out.Body.Bytes(), &resp))
		assert.Equal(t, 2, resp.Data.Added)
		preview := service.TakeRiskImportPreview(resp.Data.PreviewID, category.Id)
		require.NotNil(t, preview)
		return preview.Words
	}

	// multipart：只应取 file 字段内容。
	var multipartBody bytes.Buffer
	writer := multipart.NewWriter(&multipartBody)
	part, err := writer.CreateFormFile("file", "words.txt")
	require.NoError(t, err)
	_, err = part.Write([]byte("zzwordonezz\nzzwordtwozz\n"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	words := previewWords(t, &multipartBody, writer.FormDataContentType())
	assert.Equal(t, []string{"zzwordonezz", "zzwordtwozz"}, words)

	// 裸文本（--data-binary 默认 Content-Type）同样可用。
	raw := bytes.NewBufferString("zzwordonezz\nzzwordtwozz\n")
	words = previewWords(t, raw, "application/x-www-form-urlencoded")
	assert.Equal(t, []string{"zzwordonezz", "zzwordtwozz"}, words)

	// multipart 缺少 file 字段应拒绝。
	var emptyBody bytes.Buffer
	writer2 := multipart.NewWriter(&emptyBody)
	require.NoError(t, writer2.WriteField("other", "x"))
	require.NoError(t, writer2.Close())
	req := httptest.NewRequest(http.MethodPost, "/risk/categories/"+itoa(category.Id)+"/import/preview", &emptyBody)
	req.Header.Set("Content-Type", writer2.FormDataContentType())
	out := httptest.NewRecorder()
	router.ServeHTTP(out, req)
	assert.NotEqual(t, 200, out.Code)
}

func itoa(v int) string {
	return strconv.Itoa(v)
}
