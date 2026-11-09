/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * Request samples for the integration guide. Pure functions keyed by
 * protocol × language so tests can pin every combination. The API key in
 * every sample is the `sk-xxxx` placeholder — real keys never leave the
 * API keys page.
 */

export const API_KEY_PLACEHOLDER = 'sk-xxxx'

export type ProtocolId =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic'
  | 'gemini'

export type SampleLang = 'curl' | 'python' | 'node'

export const PROTOCOLS: { id: ProtocolId; label: string }[] = [
  { id: 'openai-chat', label: 'OpenAI Chat' },
  { id: 'openai-responses', label: 'OpenAI Responses' },
  { id: 'anthropic', label: 'Anthropic Messages' },
  { id: 'gemini', label: 'Gemini' },
]

export const SAMPLE_LANGS: { id: SampleLang; label: string }[] = [
  { id: 'curl', label: 'curl' },
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node.js' },
]

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function curlSample(protocol: ProtocolId, baseUrl: string, model: string) {
  switch (protocol) {
    case 'openai-chat':
      return `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\
  -d '${json({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
  })}'`
    case 'openai-responses':
      return `curl ${baseUrl}/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\
  -d '${json({
    model,
    input: 'Hello!',
  })}'`
    case 'anthropic':
      return `curl ${baseUrl}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${API_KEY_PLACEHOLDER}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '${json({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }],
  })}'`
    case 'gemini':
      return `curl "${baseUrl}/v1beta/models/${model}:generateContent" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-api-key: ${API_KEY_PLACEHOLDER}" \\
  -d '${json({
    contents: [{ parts: [{ text: 'Hello!' }] }],
  })}'`
  }
}

function pythonSample(protocol: ProtocolId, baseUrl: string, model: string) {
  switch (protocol) {
    case 'openai-chat':
      return `from openai import OpenAI

client = OpenAI(
    api_key="${API_KEY_PLACEHOLDER}",
    base_url="${baseUrl}/v1",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`
    case 'openai-responses':
      return `from openai import OpenAI

client = OpenAI(
    api_key="${API_KEY_PLACEHOLDER}",
    base_url="${baseUrl}/v1",
)

response = client.responses.create(
    model="${model}",
    input="Hello!",
)
print(response.output_text)`
    case 'anthropic':
      return `import anthropic

client = anthropic.Anthropic(
    api_key="${API_KEY_PLACEHOLDER}",
    base_url="${baseUrl}",
)

message = client.messages.create(
    model="${model}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)
print(message.content[0].text)`
    case 'gemini':
      return `from google import genai

client = genai.Client(
    api_key="${API_KEY_PLACEHOLDER}",
    http_options={"base_url": "${baseUrl}"},
)

response = client.models.generate_content(
    model="${model}",
    contents="Hello!",
)
print(response.text)`
  }
}

function nodeSample(protocol: ProtocolId, baseUrl: string, model: string) {
  switch (protocol) {
    case 'openai-chat':
      return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${API_KEY_PLACEHOLDER}",
  baseURL: "${baseUrl}/v1",
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`
    case 'openai-responses':
      return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${API_KEY_PLACEHOLDER}",
  baseURL: "${baseUrl}/v1",
});

const response = await client.responses.create({
  model: "${model}",
  input: "Hello!",
});
console.log(response.output_text);`
    case 'anthropic':
      return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "${API_KEY_PLACEHOLDER}",
  baseURL: "${baseUrl}",
});

const message = await client.messages.create({
  model: "${model}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(message.content[0].text);`
    case 'gemini':
      return `import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: "${API_KEY_PLACEHOLDER}",
  httpOptions: { baseUrl: "${baseUrl}" },
});

const response = await client.models.generateContent({
  model: "${model}",
  contents: "Hello!",
});
console.log(response.text);`
  }
}

const BUILDERS: Record<
  SampleLang,
  (protocol: ProtocolId, baseUrl: string, model: string) => string
> = {
  curl: curlSample,
  python: pythonSample,
  node: nodeSample,
}

export function buildSample(
  protocol: ProtocolId,
  lang: SampleLang,
  baseUrl: string,
  model: string
): string {
  return BUILDERS[lang](protocol, baseUrl, model)
}

export function sampleLanguage(lang: SampleLang): string {
  if (lang === 'curl') return 'bash'
  if (lang === 'python') return 'python'
  return 'javascript'
}
