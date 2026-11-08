package dto

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"

	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

type SensitiveResponse struct {
	SensitiveWords []string `json:"sensitive_words"`
	Content        string   `json:"content"`
}

// SensitiveTexts extracts model-visible text without using or changing billing
// metadata. Media references, transport identifiers and authentication metadata
// are not content. Strings within business tool arguments remain content.
func SensitiveTexts(request Request) []string {
	if request == nil || (reflect.ValueOf(request).Kind() == reflect.Pointer && reflect.ValueOf(request).IsNil()) {
		return nil
	}
	var texts sensitiveTextCollector
	switch r := request.(type) {
	case *GeneralOpenAIRequest:
		texts.content(sensitiveValue(r.Prompt))
		texts.content(sensitiveValue(r.Input))
		texts.content(sensitiveValue(r.Prefix))
		texts.content(sensitiveValue(r.Suffix))
		texts.add(r.Instruction)
		for _, message := range r.Messages {
			if message.Name != nil {
				texts.add(*message.Name)
			}
			texts.content(sensitiveValue(message.Content))
			texts.add(message.GetReasoningContent())
			for _, call := range message.ParseToolCalls() {
				texts.add(call.Function.Name)
				texts.payload(call.Function.Arguments)
				texts.custom(sensitiveValue(call.Custom))
			}
			texts.function(sensitiveValue(message.FunctionCall))
			texts.tools(sensitiveValue(message.Tools))
		}
		for _, tool := range r.Tools {
			texts.add(tool.Function.Name)
			texts.add(tool.Function.Description)
			texts.schema(sensitiveValue(tool.Function.Parameters))
			texts.custom(sensitiveValue(tool.Custom))
		}
		texts.tools(sensitiveValue(r.Functions))
		texts.function(sensitiveValue(r.FunctionCall))
		if r.ResponseFormat != nil {
			texts.schema(sensitiveValue(r.ResponseFormat.JsonSchema))
		}
	case *OpenAIResponsesRequest:
		texts.content(sensitiveValue(r.Instructions))
		texts.content(sensitiveValue(r.Input))
		texts.tools(sensitiveValue(r.Tools))
		if text, ok := sensitiveValue(r.Text).(map[string]any); ok {
			texts.schema(text["format"])
		}
		// Prompt variables are user content; its id/version are references.
		if prompt, ok := sensitiveValue(r.Prompt).(map[string]any); ok {
			if variables, ok := prompt["variables"].(map[string]any); ok {
				for _, name := range sensitiveKeys(variables) {
					texts.content(variables[name])
				}
			}
		}
	case *OpenAIResponsesCompactionRequest:
		texts.content(sensitiveValue(r.Instructions))
		texts.content(sensitiveValue(r.Input))
		texts.tools(sensitiveValue(r.Tools))
		if text, ok := sensitiveValue(r.Text).(map[string]any); ok {
			texts.schema(text["format"])
		}
	case *GeminiChatRequest:
		texts.gemini(r)
		texts.schema(sensitiveValue(r.GenerationConfig.ResponseSchema))
		texts.schema(sensitiveValue(r.GenerationConfig.ResponseJsonSchema))
	case *ClaudeRequest:
		texts.add(r.Prompt)
		texts.content(sensitiveValue(r.System))
		for _, message := range r.Messages {
			texts.content(sensitiveValue(message.Content))
		}
		texts.tools(sensitiveValue(r.Tools))
		texts.schema(sensitiveValue(r.OutputFormat))
		texts.schema(sensitiveValue(r.OutputConfig))
	default:
		if meta := request.GetTokenCountMeta(); meta != nil {
			texts.add(meta.CombineText)
		}
	}
	return texts
}

// SensitiveRealtimeTexts reads only client events that can introduce model
// content. It never modifies or re-encodes the original WebSocket frame.
func SensitiveRealtimeTexts(payload []byte) ([]string, error) {
	var event map[string]any
	if err := kitutil.Unmarshal(payload, &event); err != nil {
		return nil, err
	}
	if event == nil {
		return nil, fmt.Errorf("realtime event must be a JSON object")
	}
	var texts sensitiveTextCollector
	switch event["type"] {
	case RealtimeEventTypeSessionUpdate:
		if session, ok := event["session"].(map[string]any); ok {
			texts.content(session["instructions"])
			texts.tools(session["tools"])
		}
	case RealtimeEventTypeConversationCreate:
		texts.content(event["item"])
	case RealtimeEventTypeResponseCreate:
		if response, ok := event["response"].(map[string]any); ok {
			texts.content(response["instructions"])
			texts.content(response["input"])
			texts.tools(response["tools"])
		}
	}
	return texts, nil
}

// SensitiveTaskTexts extracts known model-content fields from a normalized task
// request. Unknown plugin-specific fields require an explicit content mapping.
func SensitiveTaskTexts(value any) []string {
	var texts sensitiveTextCollector
	texts.task(sensitiveValue(value))
	return texts
}

type sensitiveTextCollector []string

func (texts *sensitiveTextCollector) add(value string) {
	if value != "" {
		*texts = append(*texts, value)
	}
}

// sensitiveValue decodes opaque DTO fields and normalizes typed content blocks.
// Serialization is only an intermediate conversion of selected content fields;
// serialized JSON itself is never returned as text.
func sensitiveValue(value any) any {
	switch v := value.(type) {
	case nil, string, []any, map[string]any:
		return v
	case json.RawMessage:
		var decoded any
		_ = kitutil.Unmarshal(v, &decoded)
		return decoded
	default:
		decoded, _ := kitutil.Any2Type[any](v)
		return decoded
	}
}

// data extracts string leaves of user-defined tool payloads, never object keys.
func (texts *sensitiveTextCollector) data(value any) {
	switch v := sensitiveValue(value).(type) {
	case string:
		texts.add(v)
	case []any:
		for _, item := range v {
			texts.data(item)
		}
	case map[string]any:
		for _, key := range sensitiveKeys(v) {
			texts.add(key)
		}
		for _, key := range sensitiveKeys(v) {
			texts.data(v[key])
		}
	}
}

// payload also decodes JSON carried inside the string arguments/output fields.
// Plain text that happens to spell a JSON number or boolean is still text.
func (texts *sensitiveTextCollector) payload(value any) {
	if text, ok := value.(string); ok {
		var decoded any
		if kitutil.Unmarshal([]byte(text), &decoded) == nil {
			switch decoded.(type) {
			case string, []any, map[string]any:
				texts.data(decoded)
				return
			}
		}
	}
	texts.data(value)
}

func sensitiveKeys(value map[string]any) []string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

// content traverses protocol content blocks using explicit text-bearing fields.
func (texts *sensitiveTextCollector) content(value any) {
	switch v := value.(type) {
	case string:
		texts.add(v)
	case []any:
		for _, item := range v {
			texts.content(item)
		}
	case map[string]any:
		kind, _ := v["type"].(string)
		switch kind {
		case "text", "input_text", "output_text", "summary_text":
			texts.content(v["text"])
		case "refusal":
			texts.content(v["refusal"])
		case "input_audio", "audio":
			texts.content(v["transcript"])
		case "thinking":
			texts.content(v["thinking"])
		case "message", "":
			texts.content(v["content"])
			texts.function(v["function_call"])
			if calls, ok := v["tool_calls"].([]any); ok {
				for _, call := range calls {
					if tool, ok := call.(map[string]any); ok {
						texts.function(tool["function"])
					}
				}
			}
		case "function_call":
			texts.function(v)
		case "function_call_output", "custom_tool_call_output":
			if _, ok := v["output"].(string); ok {
				texts.payload(v["output"])
			} else {
				texts.content(v["output"])
			}
		case "custom_tool_call":
			texts.content(v["name"])
			texts.content(v["input"])
		case "tool_use", "server_tool_use":
			texts.content(v["name"])
			texts.data(v["input"])
		case "tool_result":
			texts.content(v["content"])
		case "document":
			texts.content(v["title"])
			texts.content(v["context"])
			if source, ok := v["source"].(map[string]any); ok {
				if source["type"] == "text" {
					texts.content(source["data"])
				} else if source["type"] == "content" {
					texts.content(source["content"])
				}
			}
		case "reasoning":
			texts.content(v["summary"])
		}
	}
}

func (texts *sensitiveTextCollector) function(value any) {
	if function, ok := value.(map[string]any); ok {
		texts.content(function["name"])
		texts.payload(function["arguments"])
	}
}

func (texts *sensitiveTextCollector) tools(value any) {
	if tools, ok := value.([]any); ok {
		for _, item := range tools {
			tool, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if function, ok := tool["function"].(map[string]any); ok {
				tool = function
			}
			texts.content(tool["name"])
			texts.content(tool["description"])
			for _, key := range []string{"parameters", "input_schema", "parametersJsonSchema", "response", "responseJsonSchema"} {
				texts.schema(tool[key])
			}
			texts.custom(tool["custom"])
			texts.schema(tool["format"])
			texts.tools(tool["functionDeclarations"])
			texts.tools(tool["function_declarations"])
			if location, ok := tool["user_location"].(map[string]any); ok {
				for _, key := range []string{"city", "country", "region", "timezone"} {
					texts.content(location[key])
				}
			}
		}
	}
}

func (texts *sensitiveTextCollector) schema(value any) {
	if schema, ok := value.(map[string]any); ok {
		for _, key := range []string{"title", "description", "enum", "const", "default", "examples", "definition"} {
			texts.data(schema[key])
		}
		for _, key := range []string{"properties", "$defs", "definitions", "patternProperties", "dependentSchemas"} {
			if children, ok := schema[key].(map[string]any); ok {
				for _, name := range sensitiveKeys(children) {
					texts.add(name)
					texts.schema(children[name])
				}
			}
		}
		for _, key := range []string{"schema", "format", "items", "additionalProperties", "contains", "not", "if", "then", "else", "propertyNames"} {
			texts.schema(schema[key])
		}
		for _, key := range []string{"allOf", "anyOf", "oneOf", "prefixItems"} {
			if children, ok := schema[key].([]any); ok {
				for _, child := range children {
					texts.schema(child)
				}
			}
		}
	}
}

func (texts *sensitiveTextCollector) custom(value any) {
	custom, ok := value.(map[string]any)
	if !ok {
		return
	}
	texts.content(custom["name"])
	texts.content(custom["description"])
	texts.payload(custom["input"])
	texts.schema(custom["format"])
}

func (texts *sensitiveTextCollector) gemini(request *GeminiChatRequest) {
	contents := request.Contents
	if request.SystemInstructions != nil {
		contents = append([]GeminiChatContent{*request.SystemInstructions}, contents...)
	}
	for _, content := range contents {
		for _, part := range content.Parts {
			texts.add(part.Text)
			if call := part.FunctionCall; call != nil {
				texts.add(call.FunctionName)
				texts.data(call.Arguments)
				for _, argument := range call.PartialArgs {
					if argument.StringValue != nil {
						texts.add(*argument.StringValue)
					}
				}
			}
			if response := part.FunctionResponse; response != nil {
				texts.add(response.Name)
				texts.data(response.Response)
			}
			if part.ExecutableCode != nil {
				texts.add(part.ExecutableCode.Code)
			}
			if part.CodeExecutionResult != nil {
				texts.add(part.CodeExecutionResult.Output)
			}
		}
	}
	texts.tools(sensitiveValue(request.Tools))
	for i := range request.Requests {
		texts.gemini(&request.Requests[i])
	}
}

func (texts *sensitiveTextCollector) task(value any) {
	switch v := value.(type) {
	case string:
		texts.add(v)
	case []any:
		for _, item := range v {
			texts.task(item)
		}
	case map[string]any:
		switch v["type"] {
		case "text", "input_text", "output_text", "message", "image", "image_url", "input_image", "input_audio", "audio", "file", "input_file", "video_url", "tool_use", "tool_result", "function_call", "function_call_output", "document":
			texts.content(v)
			return
		}
		for _, key := range []string{"prompt", "negative_prompt", "negativePrompt", "gpt_description_prompt", "description", "text", "instructions", "instruction", "system", "title", "tags", "style", "lyrics", "messages", "content", "input", "instances", "parameters", "positive_prompt", "positivePrompt", "subject", "theme", "story", "script"} {
			texts.task(v[key])
		}
		if metadata, ok := v["metadata"].(map[string]any); ok {
			texts.taskMetadata(metadata)
		}
	}
}

func (texts *sensitiveTextCollector) taskMetadata(value map[string]any) {
	for _, key := range []string{"content", "prompt", "negative_prompt", "negativePrompt", "gpt_description_prompt", "description", "instructions", "instruction", "title", "tags", "style", "lyrics", "messages", "input", "instances", "parameters", "positive_prompt", "positivePrompt", "subject", "theme", "story", "script"} {
		texts.task(value[key])
	}
}

// SensitiveOutputTexts extracts only model output text (content/text) for the
// output sensitive check. Reasoning and thinking are not checked; tool call
// arguments count as output content, other structural fields do not.
func SensitiveOutputTexts(response any) []string {
	if response == nil {
		return nil
	}
	var texts sensitiveTextCollector
	switch r := response.(type) {
	case *TextResponse:
		for i := range r.Choices {
			texts.outputMessage(&r.Choices[i].Message)
		}
	case *OpenAITextResponse:
		for i := range r.Choices {
			texts.outputMessage(&r.Choices[i].Message)
		}
	case *OpenAIResponsesResponse:
		for i := range r.Output {
			texts.outputBlock(sensitiveValue(r.Output[i]))
		}
	case *ClaudeResponse:
		texts.outputClaude(r)
	case *GeminiChatResponse:
		for i := range r.Candidates {
			for _, part := range r.Candidates[i].Content.Parts {
				if !part.Thought {
					texts.add(part.Text)
				}
				if call := part.FunctionCall; call != nil {
					texts.payload(call.Arguments)
				}
			}
		}
	default:
		texts.outputBlock(sensitiveValue(response))
	}
	return texts
}

func (texts *sensitiveTextCollector) outputMessage(message *Message) {
	texts.outputBlock(sensitiveValue(message.Content))
	for _, call := range message.ParseToolCalls() {
		texts.payload(call.Function.Arguments)
		texts.payload(message.FunctionCall)
	}
}

func (texts *sensitiveTextCollector) outputClaude(r *ClaudeResponse) {
	texts.add(r.Completion)
	for i := range r.Content {
		texts.outputClaudeBlock(&r.Content[i])
	}
	if r.Delta != nil {
		texts.outputClaudeBlock(r.Delta)
	}
	if r.ContentBlock != nil {
		texts.outputClaudeBlock(r.ContentBlock)
	}
}

func (texts *sensitiveTextCollector) outputClaudeBlock(message *ClaudeMediaMessage) {
	switch message.Type {
	case "text":
		if message.Text != nil {
			texts.add(*message.Text)
		}
	case "tool_use":
		texts.data(sensitiveValue(message.Input))
	default:
		if message.Text != nil {
			texts.add(*message.Text)
		}
	}
}

// outputBlock traverses output content blocks; only text-bearing blocks and
// tool call arguments are content. Reasoning, signatures and metadata are not.
func (texts *sensitiveTextCollector) outputBlock(value any) {
	switch v := value.(type) {
	case string:
		texts.add(v)
	case []any:
		for _, item := range v {
			texts.outputBlock(item)
		}
	case map[string]any:
		kind, _ := v["type"].(string)
		switch kind {
		case "text", "output_text", "summary_text":
			texts.outputBlock(v["text"])
		case "message", "":
			texts.outputBlock(v["content"])
		case "tool_use", "server_tool_use", "function_call", "custom_tool_call":
			if args, ok := v["arguments"]; ok {
				texts.payload(args)
			}
			if input, ok := v["input"]; ok {
				texts.payload(input)
			}
			if args, ok := v["partial_json"]; ok {
				texts.payload(args)
			}
		}
	}
}
