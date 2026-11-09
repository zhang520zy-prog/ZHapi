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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useCallback, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'

import {
  FILTER_ALL,
  SORT_OPTIONS,
  QUOTA_TYPES,
  ENDPOINT_TYPES,
  DEFAULT_TOKEN_UNIT,
  VIEW_MODES,
  type ViewMode,
} from '../constants'
import { filterAndSortModels, extractAllTags } from '../lib/filters'
import type { PricingModel, TokenUnit } from '../types'

export type PricingFilterState = {
  search?: string
  sort?: string
  vendors?: string[]
  types?: string[]
  group?: string
  quotaType?: string
  endpointType?: string
  tag?: string
  tokenUnit?: TokenUnit
  view?: ViewMode
  rechargePrice?: boolean
}

/** Search params as parsed by the route schema (includes legacy `vendor`). */
export type PricingSearchParams = PricingFilterState & {
  vendor?: string
}

function normalizeViewMode(value: unknown): ViewMode {
  if (value === VIEW_MODES.TABLE) {
    return VIEW_MODES.TABLE
  }
  return VIEW_MODES.CARD
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
}

/**
 * Build the initial filter state from parsed search params. The legacy
 * single-value `vendor` param is merged into `vendors`.
 */
export function resolveInitialFilters(
  search: PricingSearchParams
): PricingFilterState {
  const vendors = [...(search.vendors ?? [])]
  if (search.vendor && !vendors.includes(search.vendor)) {
    vendors.push(search.vendor)
  }
  return {
    search: search.search,
    sort: search.sort,
    vendors: vendors.length > 0 ? vendors : undefined,
    types: search.types && search.types.length > 0 ? search.types : undefined,
    group: search.group,
    quotaType: search.quotaType,
    endpointType: search.endpointType,
    tag: search.tag,
    tokenUnit: search.tokenUnit,
    view: search.view,
    rechargePrice: search.rechargePrice,
  }
}

/** Serialize filter state to URL search params (defaults/empty are dropped). */
export function filtersToSearchParams(
  state: PricingFilterState
): PricingSearchParams {
  const params: PricingSearchParams = {}
  if (state.search) params.search = state.search
  if (state.sort && state.sort !== SORT_OPTIONS.NAME) params.sort = state.sort
  if (state.vendors && state.vendors.length > 0) {
    params.vendors = state.vendors
  }
  if (state.types && state.types.length > 0) params.types = state.types
  if (state.group && state.group !== FILTER_ALL) params.group = state.group
  if (state.quotaType && state.quotaType !== QUOTA_TYPES.ALL) {
    params.quotaType = state.quotaType
  }
  if (state.endpointType && state.endpointType !== ENDPOINT_TYPES.ALL) {
    params.endpointType = state.endpointType
  }
  if (state.tag && state.tag !== FILTER_ALL) params.tag = state.tag
  if (state.tokenUnit && state.tokenUnit !== DEFAULT_TOKEN_UNIT) {
    params.tokenUnit = state.tokenUnit
  }
  if (state.view && state.view !== VIEW_MODES.CARD) params.view = state.view
  if (state.rechargePrice) params.rechargePrice = true
  return params
}

export function useFilters(models: PricingModel[]) {
  const search = useSearch({ from: '/pricing/' })
  const navigate = useNavigate({ from: '/pricing/' })
  const [filterState, setFilterState] = useState<PricingFilterState>(() =>
    resolveInitialFilters(search)
  )

  const searchInput = filterState.search || ''
  const debouncedSearchInput = useDebounce(searchInput, 200)
  const sortBy = filterState.sort || SORT_OPTIONS.NAME
  const vendorFilters = useMemo(
    () => filterState.vendors ?? [],
    [filterState.vendors]
  )
  const typeFilters = useMemo(
    () => filterState.types ?? [],
    [filterState.types]
  )
  const groupFilter = filterState.group || FILTER_ALL
  const quotaTypeFilter = filterState.quotaType || QUOTA_TYPES.ALL
  const endpointTypeFilter = filterState.endpointType || ENDPOINT_TYPES.ALL
  const tagFilter = filterState.tag || FILTER_ALL
  const tokenUnit: TokenUnit =
    filterState.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT
  const viewMode = normalizeViewMode(filterState.view)
  const showRechargePrice = filterState.rechargePrice === true

  const updateFilters = useCallback(
    (updates: Partial<PricingFilterState>) => {
      setFilterState((prev) => {
        const next: PricingFilterState = { ...prev, ...updates }
        for (const key of Object.keys(next) as (keyof PricingFilterState)[]) {
          const value = next[key]
          if (
            value === undefined ||
            value === null ||
            (Array.isArray(value) && value.length === 0)
          ) {
            delete next[key]
          }
        }
        navigate({ search: filtersToSearchParams(next), replace: true })
        return next
      })
    },
    [navigate]
  )

  const setSearchInput = useCallback(
    (v: string) => updateFilters({ search: v || undefined }),
    [updateFilters]
  )
  const setSortBy = useCallback(
    (v: string) =>
      updateFilters({ sort: v === SORT_OPTIONS.NAME ? undefined : v }),
    [updateFilters]
  )
  const toggleVendorFilter = useCallback(
    (vendor: string) =>
      updateFilters({ vendors: toggleInList(vendorFilters, vendor) }),
    [updateFilters, vendorFilters]
  )
  const toggleTypeFilter = useCallback(
    (typeId: string) =>
      updateFilters({ types: toggleInList(typeFilters, typeId) }),
    [updateFilters, typeFilters]
  )
  const clearVendorFilters = useCallback(
    () => updateFilters({ vendors: undefined }),
    [updateFilters]
  )
  const clearTypeFilters = useCallback(
    () => updateFilters({ types: undefined }),
    [updateFilters]
  )
  const setGroupFilter = useCallback(
    (v: string) => updateFilters({ group: v === FILTER_ALL ? undefined : v }),
    [updateFilters]
  )
  const setQuotaTypeFilter = useCallback(
    (v: string) =>
      updateFilters({ quotaType: v === QUOTA_TYPES.ALL ? undefined : v }),
    [updateFilters]
  )
  const setTagFilter = useCallback(
    (v: string) => updateFilters({ tag: v === FILTER_ALL ? undefined : v }),
    [updateFilters]
  )
  const setTokenUnit = useCallback(
    (v: TokenUnit) =>
      updateFilters({ tokenUnit: v === DEFAULT_TOKEN_UNIT ? undefined : v }),
    [updateFilters]
  )
  const setViewMode = useCallback(
    (v: ViewMode) =>
      updateFilters({ view: v === VIEW_MODES.CARD ? undefined : v }),
    [updateFilters]
  )
  const setShowRechargePrice = useCallback(
    (v: boolean) => updateFilters({ rechargePrice: v || undefined }),
    [updateFilters]
  )

  const availableTags = useMemo(() => {
    if (!models || models.length === 0) return []
    return extractAllTags(models)
  }, [models])

  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return []

    return filterAndSortModels(models, {
      search: debouncedSearchInput,
      vendors: vendorFilters,
      types: typeFilters,
      group: groupFilter,
      quotaType: quotaTypeFilter,
      endpointType: endpointTypeFilter,
      tag: tagFilter,
      sortBy,
    })
  }, [
    models,
    debouncedSearchInput,
    vendorFilters,
    typeFilters,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    sortBy,
  ])

  const hasActiveFilters = useMemo(
    () =>
      vendorFilters.length > 0 ||
      typeFilters.length > 0 ||
      groupFilter !== FILTER_ALL ||
      quotaTypeFilter !== QUOTA_TYPES.ALL ||
      endpointTypeFilter !== ENDPOINT_TYPES.ALL ||
      tagFilter !== FILTER_ALL,
    [
      vendorFilters,
      typeFilters,
      groupFilter,
      quotaTypeFilter,
      endpointTypeFilter,
      tagFilter,
    ]
  )

  const activeFilterCount = useMemo(
    () =>
      vendorFilters.length +
      typeFilters.length +
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0) +
      (endpointTypeFilter !== ENDPOINT_TYPES.ALL ? 1 : 0) +
      (tagFilter !== FILTER_ALL ? 1 : 0),
    [
      vendorFilters,
      typeFilters,
      groupFilter,
      quotaTypeFilter,
      endpointTypeFilter,
      tagFilter,
    ]
  )

  const clearFilters = useCallback(() => {
    updateFilters({
      vendors: undefined,
      types: undefined,
      group: undefined,
      quotaType: undefined,
      endpointType: undefined,
      tag: undefined,
    })
  }, [updateFilters])

  const clearSearch = useCallback(() => {
    updateFilters({ search: undefined })
  }, [updateFilters])

  return {
    searchInput,
    sortBy,
    vendorFilters,
    typeFilters,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    toggleVendorFilter,
    toggleTypeFilter,
    clearVendorFilters,
    clearTypeFilters,
    setGroupFilter,
    setQuotaTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  }
}
