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
import { describe, expect, it } from 'vitest'

import {
  API_KEY_PLACEHOLDER,
  buildSample,
  PROTOCOLS,
  SAMPLE_LANGS,
} from './samples'

const BASE = 'https://api.example.com'
const MODEL = 'gpt-4o-mini'

describe('docs request samples', () => {
  it('every protocol × language uses the placeholder key, the resolved base URL, and the selected model', () => {
    for (const { id: protocol } of PROTOCOLS) {
      for (const { id: lang } of SAMPLE_LANGS) {
        const code = buildSample(protocol, lang, BASE, MODEL)
        expect(code, `${protocol}/${lang} key`).toContain(API_KEY_PLACEHOLDER)
        expect(code, `${protocol}/${lang} base`).toContain(BASE)
        expect(code, `${protocol}/${lang} model`).toContain(MODEL)
      }
    }
  })

  it('targets the right endpoint and auth header per protocol (curl)', () => {
    expect(buildSample('openai-chat', 'curl', BASE, MODEL)).toContain(
      `${BASE}/v1/chat/completions`
    )
    expect(buildSample('openai-chat', 'curl', BASE, MODEL)).toContain(
      'Authorization: Bearer'
    )
    expect(buildSample('openai-responses', 'curl', BASE, MODEL)).toContain(
      `${BASE}/v1/responses`
    )
    const anthropic = buildSample('anthropic', 'curl', BASE, MODEL)
    expect(anthropic).toContain(`${BASE}/v1/messages`)
    expect(anthropic).toContain('x-api-key')
    expect(anthropic).toContain('anthropic-version: 2023-06-01')
    const gemini = buildSample('gemini', 'curl', BASE, MODEL)
    expect(gemini).toContain(`${BASE}/v1beta/models/${MODEL}:generateContent`)
    expect(gemini).toContain('x-goog-api-key')
  })

  it('SDK samples point base_url/baseURL at the gateway', () => {
    expect(buildSample('openai-chat', 'python', BASE, MODEL)).toContain(
      `base_url="${BASE}/v1"`
    )
    expect(buildSample('openai-responses', 'python', BASE, MODEL)).toContain(
      'client.responses.create'
    )
    expect(buildSample('anthropic', 'python', BASE, MODEL)).toContain(
      `base_url="${BASE}"`
    )
    expect(buildSample('gemini', 'python', BASE, MODEL)).toContain(
      `"base_url": "${BASE}"`
    )
    expect(buildSample('openai-chat', 'node', BASE, MODEL)).toContain(
      `baseURL: "${BASE}/v1"`
    )
    expect(buildSample('anthropic', 'node', BASE, MODEL)).toContain(
      `baseURL: "${BASE}"`
    )
    expect(buildSample('gemini', 'node', BASE, MODEL)).toContain(
      `baseUrl: "${BASE}"`
    )
  })
})
