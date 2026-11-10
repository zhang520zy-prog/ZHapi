package controller

import (
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAgreementVersionDatabaseMatrix B2.7-3：协议版本下发、接受、持久化与
// 注册写入。覆盖三库；LOG_DB 与主库同实例，审计行同步写入 audit_logs。
func TestAgreementVersionDatabaseMatrix(t *testing.T) {
	prevLegal := *system_setting.GetLegalSettings()
	prevRegister, prevPasswordRegister := common.RegisterEnabled, common.PasswordRegisterEnabled
	prevEmailVerification, prevQuotaForNewUser := common.EmailVerificationEnabled, common.QuotaForNewUser
	prevDefaultToken := constant.GenerateDefaultToken
	prevOptionMap := common.OptionMap
	t.Cleanup(func() {
		*system_setting.GetLegalSettings() = prevLegal
		common.RegisterEnabled, common.PasswordRegisterEnabled = prevRegister, prevPasswordRegister
		common.EmailVerificationEnabled, common.QuotaForNewUser = prevEmailVerification, prevQuotaForNewUser
		constant.GenerateDefaultToken = prevDefaultToken
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevOptionMap
		common.OptionMapRWMutex.Unlock()
	})
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	common.RegisterEnabled, common.PasswordRegisterEnabled = true, true
	common.EmailVerificationEnabled, common.QuotaForNewUser = false, 0
	constant.GenerateDefaultToken = false
	legal := system_setting.GetLegalSettings()
	legal.UserAgreement = "test agreement"

	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			legal.UserAgreementVersion = 1
			dsn := os.Getenv("TEST_" + strings.ToUpper(dialect) + "_DSN")
			if dialect != "sqlite" && dsn == "" {
				t.Skip("isolated database DSN not configured")
			}
			db, _ := newAuditTestDatabase(t, dialect, dsn)
			oldDB, oldLogDB, oldMaster, oldRedis := model.DB, model.LOG_DB, common.IsMasterNode, common.RedisEnabled
			oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.IsMasterNode, common.RedisEnabled = db, db, true, false
			databaseType := common.DatabaseType(dialect)
			if dialect == "postgres" {
				databaseType = common.DatabaseTypePostgreSQL
			}
			common.SetDatabaseTypes(databaseType, databaseType)
			t.Cleanup(func() {
				model.DB, model.LOG_DB, common.IsMasterNode, common.RedisEnabled = oldDB, oldLogDB, oldMaster, oldRedis
				common.SetDatabaseTypes(oldMainType, oldLogType)
			})
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.Option{}, &model.CasbinRule{}, &model.AuthzRole{}))
			require.NoError(t, model.MigrateAuditLogs())
			require.NoError(t, authz.Init(db))

			alice := model.User{Username: "agree-alice", Password: "unchanged", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "agree-alice"}
			require.NoError(t, db.Create(&alice).Error)

			router := gin.New()
			router.Use(func(c *gin.Context) {
				id, _ := strconv.Atoi(c.GetHeader("X-Test-User"))
				role, _ := strconv.Atoi(c.GetHeader("X-Test-Role"))
				c.Set("id", id)
				c.Set("role", role)
			})
			router.POST("/user/agreement/accept", AcceptUserAgreement)
			router.GET("/user/self", GetSelf)
			router.POST("/user/register", Register)
			router.GET("/status", GetStatus)
			request := func(method, path, body string, userId int) *httptest.ResponseRecorder {
				req := httptest.NewRequest(method, path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Test-User", strconv.Itoa(userId))
				req.Header.Set("X-Test-Role", strconv.Itoa(common.RoleCommonUser))
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				return out
			}

			// /api/status 下发当前版本。
			out := request("GET", "/status", "", alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"user_agreement_version":1`)

			// 老用户未同意任何版本：self 下发 0。
			out = request("GET", "/user/self", "", alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"agreement_version":0`)

			// 过期版本被拒绝，落审计（success=false），setting 不变。
			out = request("POST", "/user/agreement/accept", `{"version":0}`, alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"success":false`)
			stored := model.User{Id: alice.Id}
			require.NoError(t, db.Take(&stored).Error)
			assert.Equal(t, 0, stored.GetSetting().AgreementVersion)

			// 接受当前版本成功，持久化并落审计。
			out = request("POST", "/user/agreement/accept", `{"version":1}`, alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"agreement_version":1`)
			require.NoError(t, db.Take(&stored).Error)
			assert.Equal(t, 1, stored.GetSetting().AgreementVersion)
			var auditCount int64
			require.NoError(t, db.Model(&model.AuditLog{}).Where("user_id = ? AND action = ?", alice.Id, "user.agreement_accept").Count(&auditCount).Error)
			assert.Equal(t, int64(1), auditCount)
			require.NoError(t, db.Model(&model.AuditLog{}).Where("user_id = ? AND action = ?", alice.Id, "user.agreement_reject").Count(&auditCount).Error)
			assert.Equal(t, int64(1), auditCount, "rejected acceptance uses its own audit action")

			// 重复接受幂等；self 显示已同意版本。
			out = request("POST", "/user/agreement/accept", `{"version":1}`, alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"success":true`)
			out = request("GET", "/user/self", "", alice.Id)
			assert.Contains(t, out.Body.String(), `"agreement_version":1`)

			// 版本 0 场景：当前版本为 0 时接受 0 合法。
			legal.UserAgreementVersion = 0
			out = request("POST", "/user/agreement/accept", `{"version":0}`, alice.Id)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"success":true`)
			legal.UserAgreementVersion = 1

			// 注册直接记录当前版本，新用户不再弹窗。
			legal.UserAgreementVersion = 2
			out = request("POST", "/user/register", `{"username":"agree-newbie","password":"password123"}`, 0)
			require.Equal(t, 200, out.Code)
			assert.Contains(t, out.Body.String(), `"success":true`)
			var newbie model.User
			require.NoError(t, db.Where("username = ?", "agree-newbie").Take(&newbie).Error)
			assert.Equal(t, 2, newbie.GetSetting().AgreementVersion)
			// 侧栏初始化不能覆盖注册时写入的协议版本。
			assert.NotEmpty(t, newbie.GetSetting().SidebarModules)

			// 建议项：负数/非整数版本被拒绝，正整数正常写入配置。
			require.Error(t, model.UpdateOption("legal.user_agreement_version", "-1"))
			require.Error(t, model.UpdateOption("legal.user_agreement_version", "abc"))
			require.NoError(t, model.UpdateOption("legal.user_agreement_version", "3"))
			assert.Equal(t, 3, legal.UserAgreementVersion)
		})
	}
}
