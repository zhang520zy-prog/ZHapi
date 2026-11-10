package console_setting

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func annJSON(t *testing.T, items []map[string]interface{}) string {
	t.Helper()
	raw, err := common.Marshal(items)
	require.NoError(t, err)
	return string(raw)
}

func TestValidateAnnouncementsNewFields(t *testing.T) {
	base := map[string]interface{}{
		"content":     "hello",
		"publishDate": "2026-11-11T00:00:00Z",
	}
	tests := []struct {
		name    string
		mutate  func(map[string]interface{})
		wantErr string
	}{
		{name: "baseline ok", mutate: func(m map[string]interface{}) {}},
		{name: "title 60 ok", mutate: func(m map[string]interface{}) {
			m["title"] = strings.Repeat("a", 60)
		}},
		{name: "title 61 rejected", mutate: func(m map[string]interface{}) {
			m["title"] = strings.Repeat("a", 61)
		}, wantErr: "标题长度不能超过60字符"},
		{name: "title non-string rejected", mutate: func(m map[string]interface{}) {
			m["title"] = 12
		}, wantErr: "标题长度不能超过60字符"},
		{name: "popup bool ok", mutate: func(m map[string]interface{}) {
			m["popup"] = true
		}},
		{name: "popup non-bool rejected", mutate: func(m map[string]interface{}) {
			m["popup"] = "true"
		}, wantErr: "popup字段必须是布尔值"},
		{name: "expireDate ok", mutate: func(m map[string]interface{}) {
			m["expireDate"] = "2026-11-12T00:00:00Z"
		}},
		{name: "expireDate bad format", mutate: func(m map[string]interface{}) {
			m["expireDate"] = "tomorrow"
		}, wantErr: "过期时间格式错误"},
		{name: "expireDate not after publishDate", mutate: func(m map[string]interface{}) {
			m["expireDate"] = "2026-11-11T00:00:00Z"
		}, wantErr: "过期时间必须晚于发布时间"},
		{name: "expireDate before publishDate", mutate: func(m map[string]interface{}) {
			m["expireDate"] = "2026-11-10T00:00:00Z"
		}, wantErr: "过期时间必须晚于发布时间"},
		{name: "content 2000 ok", mutate: func(m map[string]interface{}) {
			m["content"] = strings.Repeat("字", 2000)
		}},
		{name: "content 2001 rejected", mutate: func(m map[string]interface{}) {
			m["content"] = strings.Repeat("字", 2001)
		}, wantErr: "内容长度不能超过2000字符"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			item := map[string]interface{}{}
			for k, v := range base {
				item[k] = v
			}
			tc.mutate(item)
			err := validateAnnouncements(annJSON(t, []map[string]interface{}{item}))
			if tc.wantErr == "" {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
			}
		})
	}
}

func TestNormalizeAnnouncementsAssignsIDs(t *testing.T) {
	existing := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
		{"id": 2, "content": "b", "publishDate": "2026-11-02T00:00:00Z"},
	})
	raw := annJSON(t, []map[string]interface{}{
		{"id": 2, "content": "b-edited", "publishDate": "2026-11-02T00:00:00Z"},
		{"content": "new", "publishDate": "2026-11-11T00:00:00Z"},
	})
	normalized, nextID, err := NormalizeAnnouncements(raw, existing, 3)
	require.NoError(t, err)
	assert.Equal(t, 4, nextID)
	var list []map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(normalized, &list))
	require.Len(t, list, 2)
	assert.Equal(t, float64(2), list[0]["id"], "已有 id 保持不变")
	assert.Equal(t, float64(3), list[1]["id"], "无 id 条目拿计数器值，删掉的不复用")
}

func TestNormalizeAnnouncementsKeepsBoundaryID(t *testing.T) {
	// 旧前端给新条目自算 max+1 提交，等于计数器值时不算伪造，保留并抬升计数器。
	existing := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
		{"id": 3, "content": "b", "publishDate": "2026-11-02T00:00:00Z"},
	})
	raw := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
		{"id": 4, "content": "new", "publishDate": "2026-11-11T00:00:00Z"},
	})
	normalized, nextID, err := NormalizeAnnouncements(raw, existing, 4)
	require.NoError(t, err)
	assert.Equal(t, 5, nextID)
	assert.Contains(t, normalized, `"id":4`)
}

func TestNormalizeAnnouncementsRejectsForgedID(t *testing.T) {
	existing := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
	})
	raw := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
		{"id": 99, "content": "forged", "publishDate": "2026-11-11T00:00:00Z"},
	})
	_, _, err := NormalizeAnnouncements(raw, existing, 2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "由服务端分配")
}

func TestNormalizeAnnouncementsRejectsDuplicateAndBadID(t *testing.T) {
	existing := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
	})
	dup := annJSON(t, []map[string]interface{}{
		{"id": 1, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
		{"id": 1, "content": "b", "publishDate": "2026-11-02T00:00:00Z"},
	})
	_, _, err := NormalizeAnnouncements(dup, existing, 2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "重复")

	bad := annJSON(t, []map[string]interface{}{
		{"id": "x", "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
	})
	_, _, err = NormalizeAnnouncements(bad, existing, 2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "正整数")

	fraction := annJSON(t, []map[string]interface{}{
		{"id": 1.5, "content": "a", "publishDate": "2026-11-01T00:00:00Z"},
	})
	_, _, err = NormalizeAnnouncements(fraction, existing, 2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "正整数")
}

func TestNormalizeAnnouncementsEmptyAllowed(t *testing.T) {
	// 清空全部公告是合法保存（与 ValidateConsoleSettings 的空值语义一致）。
	normalized, nextID, err := NormalizeAnnouncements("", "", 7)
	require.NoError(t, err)
	assert.Equal(t, "", normalized)
	assert.Equal(t, 7, nextID)
}

func TestNormalizeAnnouncementsBackfillIdempotent(t *testing.T) {
	legacy := `[{"content":"old1","publishDate":"2026-10-01T00:00:00Z"},{"content":"old2","publishDate":"2026-10-02T00:00:00Z"}]`
	normalized, nextID, err := NormalizeAnnouncements(legacy, legacy, 1)
	require.NoError(t, err)
	assert.Equal(t, 3, nextID)
	assert.Contains(t, normalized, `"id":1`)
	assert.Contains(t, normalized, `"id":2`)

	// 第二次规范化（存量已有 id）不产生变化。
	again, nextID2, err := NormalizeAnnouncements(normalized, normalized, nextID)
	require.NoError(t, err)
	assert.Equal(t, normalized, again)
	assert.Equal(t, 3, nextID2)
}
