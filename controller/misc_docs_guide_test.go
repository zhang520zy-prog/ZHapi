package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetStatusReturnsDocsGuideExtra(t *testing.T) {
	cs := console_setting.GetConsoleSetting()
	original := cs.DocsGuideExtra
	t.Cleanup(func() {
		cs.DocsGuideExtra = original
	})

	for _, value := range []string{"", "## Extra notes\n\nUse `/v1` for OpenAI."} {
		cs.DocsGuideExtra = value
		response := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(response)
		context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

		GetStatus(context)

		require.Equal(t, http.StatusOK, response.Code)
		var payload struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		assert.Equal(t, value, payload.Data["docs_guide_extra"])
	}
}
