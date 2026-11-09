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
import { ENDPOINT_TYPES } from '../constants'
import type { PricingModel } from '../types'

// ----------------------------------------------------------------------------
// Model type chips: user-facing categories grouped from endpoint types
// ----------------------------------------------------------------------------

export type ModelTypeChip = {
  /** URL / filter id, e.g. `chat` */
  id: string
  /** i18n label key */
  labelKey: string
  /** Raw `supported_endpoint_types` values that belong to this category */
  endpoints: string[]
}

export const MODEL_TYPE_CHIPS: readonly ModelTypeChip[] = [
  {
    id: 'chat',
    labelKey: 'Chat',
    endpoints: [
      ENDPOINT_TYPES.OPENAI,
      ENDPOINT_TYPES.OPENAI_RESPONSE,
      ENDPOINT_TYPES.ANTHROPIC,
      ENDPOINT_TYPES.GEMINI,
    ],
  },
  {
    id: 'image',
    labelKey: 'Image',
    endpoints: [ENDPOINT_TYPES.IMAGE_GENERATION],
  },
  {
    id: 'video',
    labelKey: 'Video',
    endpoints: [ENDPOINT_TYPES.OPENAI_VIDEO],
  },
  {
    id: 'embeddings',
    labelKey: 'Embeddings',
    endpoints: [ENDPOINT_TYPES.EMBEDDINGS],
  },
  {
    id: 'rerank',
    labelKey: 'Rerank',
    endpoints: [ENDPOINT_TYPES.JINA_RERANK],
  },
]

const ENDPOINT_TO_TYPE = new Map<string, string>(
  MODEL_TYPE_CHIPS.flatMap((chip) =>
    chip.endpoints.map((endpoint) => [endpoint, chip.id] as const)
  )
)

/** All type-chip ids a model belongs to, based on its endpoint types. */
export function getModelTypeIds(model: PricingModel): string[] {
  const ids = new Set<string>()
  for (const endpoint of model.supported_endpoint_types ?? []) {
    const id = ENDPOINT_TO_TYPE.get(endpoint)
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * Type chips that at least one model belongs to, with per-chip counts.
 * Empty categories are hidden from the filter bar.
 */
export function getAvailableTypeChips(
  models: PricingModel[]
): { chip: ModelTypeChip; count: number }[] {
  const counts = new Map<string, number>()
  for (const model of models) {
    for (const id of getModelTypeIds(model)) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return MODEL_TYPE_CHIPS.map((chip) => ({
    chip,
    count: counts.get(chip.id) ?? 0,
  })).filter(({ count }) => count > 0)
}

/** A model passes when it belongs to at least one selected type. */
export function matchesTypeFilter(
  model: PricingModel,
  selectedTypeIds: string[]
): boolean {
  if (selectedTypeIds.length === 0) return true
  return getModelTypeIds(model).some((id) => selectedTypeIds.includes(id))
}
