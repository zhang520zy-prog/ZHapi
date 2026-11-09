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
import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { getAvailableTypeChips } from '../lib/model-types'
import type { PricingModel, PricingVendor } from '../types'

// ----------------------------------------------------------------------------
// Top filter bar: brand chips + model-type chips (multi-select, intersecting)
// ----------------------------------------------------------------------------

const CHIP_BASE =
  'inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'
const CHIP_ACTIVE = 'bg-accent border-primary text-primary'
const CHIP_INACTIVE =
  'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'

function FilterChip(props: {
  label: string
  icon?: ReactNode
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={props.active}
      onClick={props.onClick}
      title={props.label}
      className={cn(CHIP_BASE, props.active ? CHIP_ACTIVE : CHIP_INACTIVE)}
    >
      {props.icon && <span className='shrink-0'>{props.icon}</span>}
      <span className='truncate'>{props.label}</span>
      {props.count != null && (
        <span
          className={cn(
            'shrink-0 tabular-nums',
            props.active ? 'text-primary/70' : 'text-muted-foreground/60'
          )}
        >
          {props.count}
        </span>
      )}
    </button>
  )
}

function ChipRow(props: {
  label: string
  allLabel: string
  children: ReactNode
  allSelected: boolean
  onSelectAll: () => void
}) {
  return (
    <div className='flex min-w-0 items-start gap-2'>
      <span className='text-muted-foreground w-10 shrink-0 pt-[7px] text-xs font-medium'>
        {props.label}
      </span>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
        <FilterChip
          label={props.allLabel}
          active={props.allSelected}
          onClick={props.onSelectAll}
        />
        {props.children}
      </div>
    </div>
  )
}

export interface PricingFilterBarProps {
  models: PricingModel[]
  vendors: PricingVendor[]
  selectedVendors: string[]
  onToggleVendor: (vendor: string) => void
  onClearVendors: () => void
  selectedTypes: string[]
  onToggleType: (typeId: string) => void
  onClearTypes: () => void
}

export const PricingFilterBar = memo(function PricingFilterBar(
  props: PricingFilterBarProps
) {
  const { t } = useTranslation()

  const vendorCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const model of props.models) {
      if (model.vendor_name) {
        counts.set(model.vendor_name, (counts.get(model.vendor_name) ?? 0) + 1)
      }
    }
    return counts
  }, [props.models])

  const vendorChips = useMemo(
    () =>
      props.vendors
        .map((vendor) => ({
          vendor,
          count: vendorCounts.get(vendor.name) ?? 0,
        }))
        .filter(({ count }) => count > 0),
    [props.vendors, vendorCounts]
  )

  const typeChips = useMemo(
    () => getAvailableTypeChips(props.models),
    [props.models]
  )

  if (vendorChips.length === 0 && typeChips.length === 0) {
    return null
  }

  return (
    <div className='space-y-2'>
      {vendorChips.length > 0 && (
        <ChipRow
          label={t('Brand')}
          allLabel={t('All')}
          allSelected={props.selectedVendors.length === 0}
          onSelectAll={props.onClearVendors}
        >
          {vendorChips.map(({ vendor, count }) => (
            <FilterChip
              key={vendor.name}
              label={vendor.name}
              icon={vendor.icon ? getLobeIcon(vendor.icon, 14) : undefined}
              count={count}
              active={props.selectedVendors.includes(vendor.name)}
              onClick={() => props.onToggleVendor(vendor.name)}
            />
          ))}
        </ChipRow>
      )}
      {typeChips.length > 0 && (
        <ChipRow
          label={t('Type')}
          allLabel={t('All')}
          allSelected={props.selectedTypes.length === 0}
          onSelectAll={props.onClearTypes}
        >
          {typeChips.map(({ chip, count }) => (
            <FilterChip
              key={chip.id}
              label={t(chip.labelKey)}
              count={count}
              active={props.selectedTypes.includes(chip.id)}
              onClick={() => props.onToggleType(chip.id)}
            />
          ))}
        </ChipRow>
      )}
    </div>
  )
})
