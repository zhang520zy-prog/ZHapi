package controller

import (
	"fmt"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAnnouncementAckDatabaseMatrix B6.1：公告 id 分配、保存规范化、确认接口
// 与存量补 id 迁移。覆盖三库；PG16 通过 TEST_POSTGRES_DSN 指向实例覆盖。
func TestAnnouncementAckDatabaseMatrix(t *testing.T) {
	prevOptionMap := common.OptionMap
	prevConsole := *console_setting.GetConsoleSetting()
	prevMaster, prevRedis := common.IsMasterNode, common.RedisEnabled
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevOptionMap
		common.OptionMapRWMutex.Unlock()
		*console_setting.GetConsoleSetting() = prevConsole
		common.IsMasterNode, common.RedisEnabled = prevMaster, prevRedis
	})

	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			dsn := os.Getenv("TEST_" + strings.ToUpper(dialect) + "_DSN")
			if dialect != "sqlite" && dsn == "" {
				t.Skip("isolated database DSN not configured")
			}
			db, _ := newAuditTestDatabase(t, dialect, dsn)
			oldDB, oldLogDB := model.DB, model.LOG_DB
			oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.IsMasterNode, common.RedisEnabled = db, db, true, false
			databaseType := common.DatabaseType(dialect)
			if dialect == "postgres" {
				databaseType = common.DatabaseTypePostgreSQL
			}
			common.SetDatabaseTypes(databaseType, databaseType)
			common.OptionMapRWMutex.Lock()
			common.OptionMap = map[string]string{console_setting.AnnouncementNextIDOption: "1"}
			common.OptionMapRWMutex.Unlock()
			cs := console_setting.GetConsoleSetting()
			cs.Announcements = ""
			t.Cleanup(func() {
				model.DB, model.LOG_DB = oldDB, oldLogDB
				common.SetDatabaseTypes(oldMainType, oldLogType)
			})
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.Option{}, &model.CasbinRule{}, &model.AuthzRole{}))
			require.NoError(t, model.MigrateAuditLogs())
			require.NoError(t, authz.Init(db))

			alice := model.User{Username: "ack-alice", Password: "x", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
			alice.Setting = `{"language":"zh","agreement_version":2,"announcement_acked_ids":[1,5]}`
			require.NoError(t, db.Create(&alice).Error)

			router := gin.New()
			router.Use(func(c *gin.Context) {
				id, _ := strconv.Atoi(c.GetHeader("X-Test-User"))
				role, _ := strconv.Atoi(c.GetHeader("X-Test-Role"))
				c.Set("id", id)
				c.Set("role", role)
			})
			router.POST("/option", UpdateOption)
			router.POST("/user/announcements/ack", AckUserAnnouncements)
			router.GET("/user/self", GetSelf)
			request := func(method, path, body string, userId, role int) *httptest.ResponseRecorder {
				req := httptest.NewRequest(method, path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Test-User", strconv.Itoa(userId))
				req.Header.Set("X-Test-Role", strconv.Itoa(role))
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				return out
			}
			saveAnnouncements := func(items string) *httptest.ResponseRecorder {
				body := fmt.Sprintf(`{"key":"console_setting.announcements","value":%s}`, strconv.Quote(items))
				return request("POST", "/option", body, 0, common.RoleRootUser)
			}
			annItem := func(content, publishDate string, extra map[string]any) map[string]any {
				m := map[string]any{"content": content, "publishDate": publishDate}
				for k, v := range extra {
					m[k] = v
				}
				return m
			}
			toJSON := func(v any) string {
				raw, err := common.Marshal(v)
				require.NoError(t, err)
				return string(raw)
			}
			storedList := func() []map[string]any {
				var list []map[string]any
				require.NoError(t, common.UnmarshalJsonStr(cs.Announcements, &list))
				return list
			}

			// 保存：新条目拿新 id；编辑保持 id；删后新增不复用旧 id。
			out := saveAnnouncements(toJSON([]any{
				annItem("a", "2026-11-01T00:00:00Z", map[string]any{"popup": true, "title": "A"}),
				annItem("b", "2026-11-02T00:00:00Z", map[string]any{"popup": true}),
				annItem("c", "2026-11-03T00:00:00Z", nil),
			}))
			require.Equal(t, 200, out.Code, out.Body.String())
			assert.Contains(t, out.Body.String(), `"success":true`)
			list := storedList()
			require.Len(t, list, 3)
			assert.Equal(t, float64(1), list[0]["id"])
			assert.Equal(t, float64(2), list[1]["id"])
			assert.Equal(t, float64(3), list[2]["id"])
			assert.Equal(t, "4", func() string {
				common.OptionMapRWMutex.RLock()
				defer common.OptionMapRWMutex.RUnlock()
				return common.OptionMap[console_setting.AnnouncementNextIDOption]
			}(), "计数器应为下一个待分配 id")

			out = saveAnnouncements(toJSON([]any{
				annItem("a-edited", "2026-11-01T00:00:00Z", map[string]any{"popup": true, "id": 1}),
				annItem("b", "2026-11-02T00:00:00Z", map[string]any{"popup": true, "id": 2}),
				annItem("c", "2026-11-03T00:00:00Z", map[string]any{"id": 3}),
				annItem("d", "2026-11-04T00:00:00Z", map[string]any{"popup": true}),
			}))
			require.Contains(t, out.Body.String(), `"success":true`)
			list = storedList()
			require.Len(t, list, 4)
			assert.Equal(t, float64(1), list[0]["id"])
			assert.Equal(t, float64(4), list[3]["id"], "删后新增拿新 id 不复用")

			// 伪造超计数器 id 被拒。
			out = saveAnnouncements(toJSON([]any{
				annItem("a-edited", "2026-11-01T00:00:00Z", map[string]any{"popup": true, "id": 1}),
				annItem("forged", "2026-11-05T00:00:00Z", map[string]any{"id": 99}),
			}))
			assert.Contains(t, out.Body.String(), `"success":false`)
			assert.Contains(t, out.Body.String(), "由服务端分配")

			// 校验：标题/内容超限与过期时间倒挂被拒。
			out = saveAnnouncements(toJSON([]any{
				annItem("x", "2026-11-01T00:00:00Z", map[string]any{"title": strings.Repeat("t", 61)}),
			}))
			assert.Contains(t, out.Body.String(), `"success":false`)
			out = saveAnnouncements(toJSON([]any{
				annItem(strings.Repeat("长", 2001), "2026-11-01T00:00:00Z", nil),
			}))
			assert.Contains(t, out.Body.String(), `"success":false`)
			out = saveAnnouncements(toJSON([]any{
				annItem("x", "2026-11-10T00:00:00Z", map[string]any{"expireDate": "2026-11-01T00:00:00Z"}),
			}))
			assert.Contains(t, out.Body.String(), `"success":false`)

			// 确认接口：只记录存在且 popup=true 的 id（1/2/4 有效，3 未开、99 不存在）。
			out = request("POST", "/user/announcements/ack", `{"ids":[1,3,99]}`, alice.Id, common.RoleCommonUser)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"announcement_acked_ids":[1,5]`)
			var stored model.User
			require.NoError(t, db.Take(&stored, alice.Id).Error)
			storedSetting := stored.GetSetting()
			assert.Equal(t, []int{1, 5}, storedSetting.AnnouncementAckedIDs)
			assert.Equal(t, "zh", storedSetting.Language, "确认不能冲掉已有设置字段")
			assert.Equal(t, 2, storedSetting.AgreementVersion, "确认不能冲掉已有设置字段")

			out = request("POST", "/user/announcements/ack", `{"ids":[2,4]}`, alice.Id, common.RoleCommonUser)
			require.Contains(t, out.Body.String(), `"announcement_acked_ids":[1,5,2,4]`)
			// 幂等：重复调用结果不变。
			out = request("POST", "/user/announcements/ack", `{"ids":[2,4]}`, alice.Id, common.RoleCommonUser)
			require.Contains(t, out.Body.String(), `"announcement_acked_ids":[1,5,2,4]`)

			// 超限裁剪：已有 105 条时确认新 id，只保留最新 100 个。
			long := make([]int, 0, 105)
			for i := 10; i <= 114; i++ {
				long = append(long, i)
			}
			require.NoError(t, db.Model(&model.User{}).Where("id = ?", alice.Id).
				Update("setting", `{"language":"zh","announcement_acked_ids":`+toJSON(long)+`}`).Error)
			out = request("POST", "/user/announcements/ack", `{"ids":[4]}`, alice.Id, common.RoleCommonUser)
			require.Equal(t, 200, out.Code)
			require.NoError(t, db.Take(&stored, alice.Id).Error)
			merged := stored.GetSetting().AnnouncementAckedIDs
			require.Len(t, merged, 100)
			assert.Equal(t, 16, merged[0], "最旧的被丢掉")
			assert.Equal(t, 114, merged[98])
			assert.Equal(t, 4, merged[99], "新确认的在尾部")

			// /self 返回与库一致。
			out = request("GET", "/user/self", "", alice.Id, common.RoleCommonUser)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"announcement_acked_ids":[16`)

			// 存量补 id：库里写入无 id 的老公告，InitOptionMap 后补 id 且幂等。
			legacy := `[{"content":"old","publishDate":"2026-10-01T00:00:00Z"}]`
			require.NoError(t, db.Save(&model.Option{Key: "console_setting.announcements", Value: legacy}).Error)
			model.InitOptionMap()
			var migrated []map[string]any
			require.NoError(t, common.UnmarshalJsonStr(cs.Announcements, &migrated))
			require.Len(t, migrated, 1)
			assert.Equal(t, float64(5), migrated[0]["id"], "补 id 取计数器当前值")
			firstPass := cs.Announcements
			model.InitOptionMap()
			assert.Equal(t, firstPass, cs.Announcements, "补 id 只补一次")
			common.OptionMapRWMutex.RLock()
			counter := common.OptionMap[console_setting.AnnouncementNextIDOption]
			common.OptionMapRWMutex.RUnlock()
			assert.Equal(t, "6", counter)
		})
	}
}
