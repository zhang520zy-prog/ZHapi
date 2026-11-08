package middleware

import (
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// RequireDistributor 要求当前用户拥有 active 分销身份。
// 分销身份是业务状态（distributor_profiles.status），不走 Casbin；
// profile 查询带 30 秒内存缓存，审批/停用/编辑时主动失效。
func RequireDistributor() gin.HandlerFunc {
	return func(c *gin.Context) {
		if model.GetActiveDistributorProfile(c.GetInt("id")) == nil {
			c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "Requires an active distributor profile"})
			return
		}
		c.Next()
	}
}

// Suspended distributors lose the whole distributor area (§1.2.9): no wallet,
// no transfer, no withdrawals — admins settle them out via the settle-out API.
