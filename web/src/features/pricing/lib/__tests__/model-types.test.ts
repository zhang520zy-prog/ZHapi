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

import type { PricingModel } from '../../types'
import {
  getAvailableTypeChips,
  getModelTypeIds,
  matchesTypeFilter,
} from '../model-types'

const base: PricingModel = {
  id: 1,
  model_name: 'm',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: [],
}

describe('getModelTypeIds', () => {
  it('groups chat-protocol endpoints into the chat type', () => {
    expect(
      getModelTypeIds({
        ...base,
        supported_endpoint_types: ['openai', 'anthropic'],
      })
    ).toEqual(['chat'])
  })

  it('maps single-endpoint types to their own categories', () => {
    expect(
      getModelTypeIds({
        ...base,
        supported_endpoint_types: ['image-generation', 'jina-rerank'],
      })
    ).toEqual(['image', 'rerank'])
  })

  it('returns an empty list for unknown or missing endpoints', () => {
    expect(
      getModelTypeIds({ ...base, supported_endpoint_types: ['unknown-x'] })
    ).toEqual([])
    expect(getModelTypeIds({ ...base })).toEqual([])
  })
})

describe('getAvailableTypeChips', () => {
  it('counts each model once per type and hides empty categories', () => {
    const chips = getAvailableTypeChips([
      {
        ...base,
        supported_endpoint_types: ['openai', 'gemini', 'embeddings'],
      },
      { ...base, id: 2, supported_endpoint_types: ['anthropic'] },
    ])
    const byId = Object.fromEntries(chips.map((c) => [c.chip.id, c.count]))
    expect(byId.chat).toBe(2)
    expect(byId.embeddings).toBe(1)
    expect(chips.find((c) => c.chip.id === 'video')).toBeUndefined()
    expect(chips.find((c) => c.chip.id === 'rerank')).toBeUndefined()
  })
})

describe('matchesTypeFilter', () => {
  it('passes everything when no type is selected', () => {
    expect(matchesTypeFilter(base, [])).toBe(true)
  })

  it('requires the model to belong to at least one selected type', () => {
    const model = {
      ...base,
      supported_endpoint_types: ['image-generation'],
    }
    expect(matchesTypeFilter(model, ['image', 'video'])).toBe(true)
    expect(matchesTypeFilter(model, ['chat'])).toBe(false)
  })
})
