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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableViewModeToggle } from '@/components/data-table'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingToolbar,
  PricingFilterBar,
  ModelCardGrid,
  ModelDetailsDrawer,
} from './components'
import { EXCLUDED_GROUPS, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePerfSummary } from './hooks/use-perf-summary'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilters,
    typeFilters,
    groupFilter,
    quotaTypeFilter,
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
  } = useFilters(models || [])

  const { perfMap } = usePerfSummary()

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
          perfMap={perfMap}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
        perfMap={perfMap}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
        <header className='mb-4 flex flex-wrap items-end justify-between gap-4 sm:mb-6'>
          <div className='min-w-0'>
            <h1 className='text-[18px]/[26px] font-semibold tracking-tight sm:text-[22px]/[30px]'>
              {t('Model Square')}
            </h1>
            <p className='text-muted-foreground mt-1.5 text-sm'>
              {t(
                'Discover curated AI models, compare pricing and capabilities, and choose the right model for every scenario.'
              )}
            </p>
            <p className='text-muted-foreground/70 mt-1 text-xs tabular-nums'>
              {filteredModels.length === models?.length
                ? t('This site currently has {{count}} models enabled', {
                    count: models?.length || 0,
                  })
                : t('{{filtered}} of {{total}} models', {
                    filtered: filteredModels.length,
                    total: models?.length || 0,
                  })}
            </p>
          </div>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onClear={clearSearch}
              placeholder={t(
                'Search model name, provider, endpoint, or tag...'
              )}
              className='w-full sm:w-72'
            />
            <ToggleGroup
              value={[tokenUnit]}
              onValueChange={(values) => {
                if (values[0] === 'M' || values[0] === 'K') {
                  setTokenUnit(values[0])
                }
              }}
              variant='outline'
              size='sm'
              aria-label={t('Token unit')}
            >
              <ToggleGroupItem value='M'>/1M</ToggleGroupItem>
              <ToggleGroupItem value='K'>/1K</ToggleGroupItem>
            </ToggleGroup>
            <DataTableViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </header>

        <main className='min-w-0 space-y-4'>
          <PricingFilterBar
            models={models || []}
            vendors={vendors || []}
            selectedVendors={vendorFilters}
            onToggleVendor={toggleVendorFilter}
            onClearVendors={clearVendorFilters}
            selectedTypes={typeFilters}
            onToggleType={toggleTypeFilter}
            onClearTypes={clearTypeFilters}
          />

          <PricingToolbar
            sortBy={sortBy}
            onSortChange={setSortBy}
            showRechargePrice={showRechargePrice}
            onRechargePriceChange={setShowRechargePrice}
            quotaTypeFilter={quotaTypeFilter}
            groupFilter={groupFilter}
            tagFilter={tagFilter}
            onQuotaTypeChange={setQuotaTypeFilter}
            onGroupChange={setGroupFilter}
            onTagChange={setTagFilter}
            groups={availableGroups}
            groupRatios={groupRatio}
            tags={availableTags}
            models={models || []}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
          />

          {renderPricingContent()}
        </main>

        {selectedModel && (
          <ModelDetailsDrawer
            open={Boolean(selectedModel)}
            onOpenChange={(open) => {
              if (!open) setSelectedModelName(null)
            }}
            model={selectedModel}
            groupRatio={groupRatio || {}}
            usableGroup={usableGroup || {}}
            endpointMap={
              (endpointMap as Record<
                string,
                { path?: string; method?: string }
              >) || {}
            }
            autoGroups={autoGroups || []}
            priceRate={priceRate ?? 1}
            usdExchangeRate={usdExchangeRate ?? 1}
            tokenUnit={tokenUnit}
            showRechargePrice={showRechargePrice}
          />
        )}
      </PageTransition>
    </PublicLayout>
  )
}
