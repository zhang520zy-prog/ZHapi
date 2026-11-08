package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSensitiveTextsProtocolContent(t *testing.T) {
	tests := []struct {
		name    string
		request Request
		body    string
		want    []string
	}{
		{"chat", &GeneralOpenAIRequest{}, `{"prompt":["prompt"],"input":"input","instruction":"instruction","suffix":"suffix","messages":[{"role":"user","content":[{"type":"text","text":"message"},{"type":"image_url","image_url":{"url":"https://media.invalid/image"}},{"type":"input_audio","input_audio":{"data":"BASE64_AUDIO","format":"wav"}}]},{"role":"assistant","content":null,"tool_calls":[{"id":"CALL_ID","type":"function","function":{"name":"lookup","arguments":"{\"SECRET_KEY\":\"argument\",\"url\":\"https://business.invalid\"}"}}],"function_call":{"name":"legacy","arguments":"{\"key\":\"legacy argument\"}"}},{"role":"system","tools":[{"type":"function","function":{"name":"dynamic","description":"dynamic description"}}]}],"tools":[{"type":"function","function":{"name":"declared","description":"tool description","parameters":{"type":"object","properties":{"SECRET_PROPERTY":{"type":"string","description":"parameter description","enum":["enum value"]}},"required":["SECRET_PROPERTY"]}}}],"metadata":{"api_key":"AUTH_TOKEN"}}`, []string{"prompt", "input", "instruction", "suffix", "message", "lookup", "SECRET_KEY", "argument", "url", "https://business.invalid", "legacy", "key", "legacy argument", "dynamic", "dynamic description", "declared", "tool description", "SECRET_PROPERTY", "parameter description", "enum value"}},
		{"responses", &OpenAIResponsesRequest{}, `{"instructions":"response instruction","input":[{"role":"user","content":[{"type":"input_text","text":"response text"},{"type":"input_image","image_url":"https://media.invalid"},{"type":"input_file","file_data":"BASE64_FILE","filename":"SECRET_FILENAME"}]},{"type":"function_call","name":"lookup","arguments":"{\"SECRET_KEY\":\"call text\"}"},{"type":"function_call_output","call_id":"SECRET_ID","output":[{"type":"input_text","text":"output text"},{"type":"input_image","image_url":"data:image/png;base64,SECRET"}]},{"type":"function_call_output","output":"plain output"}],"tools":[{"type":"function","name":"lookup","description":"description","parameters":{"type":"object","properties":{"x":{"description":"schema text"}}}},{"type":"mcp","server_url":"https://mcp.invalid","headers":{"Authorization":"SECRET_AUTH"}}],"metadata":{"secret":"SECRET_META"},"prompt_cache_key":"SECRET_CACHE"}`, []string{"response instruction", "response text", "lookup", "SECRET_KEY", "call text", "output text", "plain output", "lookup", "description", "x", "schema text"}},
		{"compaction", &OpenAIResponsesCompactionRequest{}, `{"instructions":"compact instruction","input":[{"role":"user","content":"compact text"},{"type":"function_call_output","output":"compact output"}]}`, []string{"compact instruction", "compact text", "compact output"}},
		{"gemini", &GeminiChatRequest{}, `{"system_instruction":{"parts":[{"text":"system text"}]},"contents":[{"role":"user","parts":[{"text":"gemini text"},{"inlineData":{"mimeType":"image/png","data":"BASE64_IMAGE"}},{"fileData":{"fileUri":"https://media.invalid"}},{"functionCall":{"name":"lookup","args":{"SECRET_KEY":"gemini argument"},"partialArgs":[{"jsonPath":"SECRET_PATH","stringValue":"partial argument"}]}},{"functionResponse":{"name":"lookup","response":{"SECRET_KEY":"gemini output"},"parts":[{"inlineData":{"mimeType":"image/png","data":"BASE64_RESULT"}}]}},{"executableCode":{"language":"PYTHON","code":"code text"}},{"codeExecutionResult":{"outcome":"OUTCOME","output":"code output"}}]}],"tools":[{"functionDeclarations":[{"name":"lookup","description":"gemini tool","parameters":{"type":"OBJECT","properties":{"SECRET_KEY":{"type":"STRING","description":"gemini schema"}}}}]}],"requests":[{"contents":[{"parts":[{"text":"batch text"}]}]}],"cachedContent":"SECRET_CACHE"}`, []string{"system text", "gemini text", "lookup", "SECRET_KEY", "gemini argument", "partial argument", "lookup", "SECRET_KEY", "gemini output", "code text", "code output", "lookup", "gemini tool", "SECRET_KEY", "gemini schema", "batch text"}},
		{"claude", &ClaudeRequest{}, `{"prompt":"legacy prompt","system":[{"type":"text","text":"claude system"}],"messages":[{"role":"user","content":[{"type":"text","text":"claude text"},{"type":"image","source":{"type":"base64","data":"BASE64_IMAGE"}},{"type":"tool_use","name":"lookup","input":{"SECRET_KEY":"claude argument"}},{"type":"tool_result","tool_use_id":"SECRET_ID","content":[{"type":"text","text":"claude output"},{"type":"image","source":{"type":"url","url":"https://media.invalid"}}]},{"type":"document","title":"document title","context":"document context","source":{"type":"text","data":"document text"}},{"type":"thinking","thinking":"thinking text","signature":"SECRET_SIGNATURE"}]}],"tools":[{"name":"lookup","description":"claude tool","input_schema":{"type":"object","properties":{"SECRET_KEY":{"type":"string","description":"claude schema"}}}}],"metadata":{"api_key":"SECRET_AUTH"}}`, []string{"legacy prompt", "claude system", "claude text", "lookup", "SECRET_KEY", "claude argument", "claude output", "document title", "document context", "document text", "thinking text", "lookup", "claude tool", "SECRET_KEY", "claude schema"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, kitutil.Unmarshal([]byte(tc.body), tc.request))
			before, err := kitutil.Marshal(tc.request)
			require.NoError(t, err)
			meta := tc.request.GetTokenCountMeta()
			assert.ElementsMatch(t, tc.want, SensitiveTexts(tc.request))
			after, err := kitutil.Marshal(tc.request)
			require.NoError(t, err)
			assert.Equal(t, before, after, "extraction must not mutate the forwarded request")
			assert.Equal(t, meta, tc.request.GetTokenCountMeta(), "extraction must not change billing metadata")
		})
	}
}

func TestSensitiveTextsEmptyAndExistingRequests(t *testing.T) {
	for _, request := range []Request{nil, (*GeneralOpenAIRequest)(nil), (*GeminiChatRequest)(nil), (*EmbeddingRequest)(nil), &GeneralOpenAIRequest{}, &BaseRequest{}, &OpenAIResponsesRequest{}} {
		assert.Empty(t, SensitiveTexts(request))
	}
	assert.Equal(t, []string{"image prompt"}, SensitiveTexts(&ImageRequest{Prompt: "image prompt"}))
	assert.Equal(t, []string{"embedding text"}, SensitiveTexts(&EmbeddingRequest{Input: "embedding text"}))
	assert.Equal(t, []string{"audio text"}, SensitiveTexts(&AudioRequest{Input: "audio text"}))
	assert.ElementsMatch(t, []string{"123", "true", "false"}, SensitiveTexts(&GeneralOpenAIRequest{Prompt: "123", Input: "true", Tools: []ToolCallRequest{{Function: FunctionRequest{Parameters: map[string]any{"enum": []any{"false"}}}}}}))
	request := &OpenAIResponsesRequest{}
	require.NoError(t, kitutil.Unmarshal([]byte(`{"input":[{"type":"function_call_output","output":"{\"SECRET_KEY\":\"json output text\"}"}]}`), request))
	assert.Equal(t, []string{"SECRET_KEY", "json output text"}, SensitiveTexts(request))
	require.NoError(t, kitutil.Unmarshal([]byte(`{"input":"123","text":{"format":{"type":"json_schema","description":"format description","schema":{"properties":{"SECRET_KEY":{"description":"format property"}}}}},"prompt":{"id":"SECRET_PROMPT","variables":{"x":"variable text","image":{"type":"input_image","image_url":"https://media.invalid"}}}}`), request))
	assert.ElementsMatch(t, []string{"123", "format description", "SECRET_KEY", "format property", "variable text"}, SensitiveTexts(request))
	claude := &ClaudeRequest{}
	require.NoError(t, kitutil.Unmarshal([]byte(`{"messages":[{"role":"user","content":[{"type":"document","source":{"type":"content","content":[{"type":"text","text":"nested document"},{"type":"image","source":{"type":"base64","data":"BASE64_IMAGE"}}]}}]}],"tools":[{"type":"web_search_20250305","name":"web_search","user_location":{"type":"approximate","city":"city text","country":"country text","timezone":"timezone text"}}]}`), claude))
	assert.ElementsMatch(t, []string{"nested document", "web_search", "city text", "country text", "timezone text"}, SensitiveTexts(claude))
}

func TestSensitiveRealtimeTexts(t *testing.T) {
	tests := []struct {
		body string
		want []string
	}{
		{`{"type":"session.update","session":{"instructions":"session instruction","tools":[{"type":"function","name":"lookup","description":"realtime tool","parameters":{"properties":{"SECRET_KEY":{"description":"parameter text"}}}}],"client_secret":{"value":"SECRET_AUTH"}}}`, []string{"session instruction", "lookup", "realtime tool", "SECRET_KEY", "parameter text"}},
		{`{"type":"conversation.item.create","item":{"type":"message","role":"user","content":[{"type":"input_text","text":"realtime text"},{"type":"input_audio","audio":"BASE64_AUDIO","transcript":"audio transcript"},{"type":"input_image","image_url":"https://media.invalid"}]}}`, []string{"realtime text", "audio transcript"}},
		{`{"type":"conversation.item.create","item":{"type":"function_call","name":"lookup","arguments":"{\"SECRET_KEY\":\"realtime argument\"}"}}`, []string{"lookup", "SECRET_KEY", "realtime argument"}},
		{`{"type":"conversation.item.create","item":{"type":"function_call_output","output":"realtime output"}}`, []string{"realtime output"}},
		{`{"type":"response.create","response":{"instructions":"response instruction","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"response input"}]}],"tools":[{"type":"function","name":"lookup","description":"response tool"}],"metadata":{"secret":"SECRET_META"}}}`, []string{"response instruction", "response input", "lookup", "response tool"}},
		{`{"type":"input_audio_buffer.append","audio":"BASE64_AUDIO","text":"NOT_PROTOCOL_TEXT"}`, nil},
		{`{"type":"session.created","session":{"instructions":"SERVER_EVENT"}}`, nil},
		{`{"type":"response.create","response":{"input":[{"type":"item_reference","id":"SECRET_ID"},{"type":"input_image","image_url":"data:image/png;base64,SECRET"}]}}`, nil},
	}
	for _, tc := range tests {
		payload := []byte(tc.body)
		before := append([]byte(nil), payload...)
		got, err := SensitiveRealtimeTexts(payload)
		require.NoError(t, err)
		assert.ElementsMatch(t, tc.want, got)
		assert.Equal(t, before, payload)
	}
	for _, body := range []string{"", "{", "[]", "null"} {
		_, err := SensitiveRealtimeTexts([]byte(body))
		assert.Error(t, err)
	}
}

func TestSensitiveTaskTexts(t *testing.T) {
	var payload any
	require.NoError(t, kitutil.Unmarshal([]byte(`{"model":"SECRET_MODEL","api_key":"SECRET_KEY","callback_url":"https://callback.invalid","input":{"prompt":"task prompt","negative_prompt":"negative prompt","image":"BASE64_IMAGE","messages":[{"role":"user","content":[{"type":"text","text":"task message"},{"type":"image_url","image_url":"https://media.invalid"}]}]},"parameters":{"prompt":"parameter prompt","width":1024},"instructions":"task instructions","metadata":{"text":"SECRET_META"}}`), &payload))
	assert.ElementsMatch(t, []string{"task prompt", "negative prompt", "task message", "parameter prompt", "task instructions"}, SensitiveTaskTexts(payload))
	assert.Empty(t, SensitiveTaskTexts(nil))
	require.NoError(t, kitutil.Unmarshal([]byte(`{"type":"text-to-image","metadata":{"content":[{"type":"text","text":"metadata text"},{"type":"image_url","image_url":"https://media.invalid"}]},"input":{"instances":[{"prompt":"instance prompt"}]},"title":"song title","tags":"song tags","style":"song style","lyrics":"song lyrics"}`), &payload))
	assert.ElementsMatch(t, []string{"metadata text", "instance prompt", "song title", "song tags", "song style", "song lyrics"}, SensitiveTaskTexts(payload))
	// Suno copies Responses metadata into its request body; other built-ins
	// override prompt from metadata or map metadata into provider parameters.
	require.NoError(t, kitutil.Unmarshal([]byte(`{"gpt_description_prompt":"suno description","metadata":{"gpt_description_prompt":"metadata suno description","prompt":"metadata prompt","negativePrompt":"veo negative prompt","title":"metadata song title","tags":"metadata song tags","api_key":"SECRET_AUTH","callback_url":"https://callback.invalid"},"input":{"messages":[{"role":"user","content":[{"text":"alibaba text"},{"image":"BASE64_IMAGE"}]}]},"parameters":{"negative_prompt":"alibaba negative prompt"}}`), &payload))
	assert.ElementsMatch(t, []string{"suno description", "metadata suno description", "metadata prompt", "veo negative prompt", "metadata song title", "metadata song tags", "alibaba text", "alibaba negative prompt"}, SensitiveTaskTexts(payload))
}

func TestSensitiveStructuredAndCustomContent(t *testing.T) {
	tests := []struct {
		request Request
		body    string
		want    []string
	}{
		{&ClaudeRequest{}, `{"output_format":{"type":"json_schema","schema":{"properties":{"legacy_field":{"description":"legacy description"}}}},"output_config":{"format":{"type":"json_schema","schema":{"properties":{"config_field":{"description":"config description"}}}}}}`, []string{"legacy_field", "legacy description", "config_field", "config description"}},
		{&GeminiChatRequest{}, `{"generationConfig":{"responseSchema":{"properties":{"gemini_field":{"description":"gemini description"}}},"responseJsonSchema":{"properties":{"json_field":{"description":"json description"}}}}}`, []string{"gemini_field", "gemini description", "json_field", "json description"}},
		{&GeneralOpenAIRequest{}, `{"tools":[{"type":"custom","custom":{"name":"custom_name","description":"custom description","format":{"type":"grammar","syntax":"lark","definition":"grammar definition"}}}],"messages":[{"role":"assistant","content":null,"tool_calls":[{"type":"custom","custom":{"name":"custom_name","input":"custom input"}}]}]}`, []string{"custom_name", "custom input", "custom_name", "custom description", "grammar definition"}},
		{&OpenAIResponsesRequest{}, `{"tools":[{"type":"custom","name":"response_custom","description":"response custom description","format":{"type":"grammar","syntax":"lark","definition":"response grammar"}}],"input":[{"type":"custom_tool_call","name":"response_custom","input":"response custom input"},{"type":"function_call","name":"f","arguments":"{\"user_defined_key\":{\"nested_key\":\"value\"}}"},{"type":"function_call_output","output":"{\"output_key\":\"output value\"}"}]}`, []string{"response_custom", "response custom input", "f", "user_defined_key", "nested_key", "value", "output_key", "output value", "response_custom", "response custom description", "response grammar"}},
	}
	for _, tc := range tests {
		require.NoError(t, kitutil.Unmarshal([]byte(tc.body), tc.request))
		assert.ElementsMatch(t, tc.want, SensitiveTexts(tc.request))
	}
}
