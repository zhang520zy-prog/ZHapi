package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// Creem 商品币种仅支持 EUR/USD（官方 create-product API 的 ProductCurrency
// 枚举，见 B3.8 交付说明 W-3 查证），无法按人民币定价，订阅暂不开放。
// 完整实现见 git 历史，Creem 支持 CNY 商品后可恢复。
func SubscriptionRequestCreemPay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	common.ApiErrorMsg(c, "Creem 暂不支持订阅支付")
}
