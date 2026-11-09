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
  filtersToSearchParams,
  resolveInitialFilters,
  type PricingSearchParams,
} from '../../hooks/use-filters'

describe('resolveInitialFilters', () => {
  it('merges the legacy vendor param into vendors', () => {
    const resolved = resolveInitialFilters({
      vendor: 'OpenAI',
      vendors: ['Anthropic'],
    })
    expect(resolved.vendors).toEqual(['Anthropic', 'OpenAI'])
  })

  it('keeps vendors when only the legacy param is present', () => {
    expect(resolveInitialFilters({ vendor: 'OpenAI' }).vendors).toEqual([
      'OpenAI',
    ])
  })

  it('does not duplicate a vendor already present in vendors', () => {
    expect(
      resolveInitialFilters({ vendor: 'OpenAI', vendors: ['OpenAI'] }).vendors
    ).toEqual(['OpenAI'])
  })

  it('drops empty arrays and passes through type filters', () => {
    const resolved = resolveInitialFilters({ vendors: [], types: ['chat'] })
    expect(resolved.vendors).toBeUndefined()
    expect(resolved.types).toEqual(['chat'])
  })
})

describe('filtersToSearchParams', () => {
  it('writes vendors/types arrays and never emits the legacy vendor key', () => {
    const params = filtersToSearchParams({
      vendors: ['OpenAI', 'Anthropic'],
      types: ['chat', 'image'],
    })
    expect(params.vendors).toEqual(['OpenAI', 'Anthropic'])
    expect(params.types).toEqual(['chat', 'image'])
    expect(params.vendor).toBeUndefined()
    expect('vendor' in params).toBe(false)
  })

  it('drops defaults and empty selections so the URL stays clean', () => {
    const params = filtersToSearchParams({
      sort: 'name',
      vendors: [],
      types: [],
      group: 'all',
      quotaType: 'all',
      endpointType: 'all',
      tag: 'all',
      tokenUnit: 'M',
      view: 'card',
      rechargePrice: false,
    })
    expect(params).toEqual({})
  })

  it('keeps non-default values', () => {
    const params: PricingSearchParams = filtersToSearchParams({
      search: 'gpt',
      sort: 'price-low',
      group: 'premium',
      quotaType: 'token',
      tag: 'chat',
      tokenUnit: 'K',
      view: 'table',
      rechargePrice: true,
    })
    expect(params.search).toBe('gpt')
    expect(params.sort).toBe('price-low')
    expect(params.group).toBe('premium')
    expect(params.quotaType).toBe('token')
    expect(params.tag).toBe('chat')
    expect(params.tokenUnit).toBe('K')
    expect(params.view).toBe('table')
    expect(params.rechargePrice).toBe(true)
  })
})
