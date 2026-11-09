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
import { ArrowUpDown, Check, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import { getSortLabels, type SortOption } from '../constants'
import type { PricingModel } from '../types'
import { PricingSidebar } from './pricing-sidebar'

export interface PricingToolbarProps {
  sortBy: string
  onSortChange: (value: string) => void
  showRechargePrice: boolean
  onRechargePriceChange: (value: boolean) => void
  quotaTypeFilter: string
  groupFilter: string
  tagFilter: string
  onQuotaTypeChange: (value: string) => void
  onGroupChange: (value: string) => void
  onTagChange: (value: string) => void
  groups: string[]
  groupRatios?: Record<string, number>
  tags: string[]
  models: PricingModel[]
  hasActiveFilters: boolean
  activeFilterCount: number
  onClearFilters: () => void
}

export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const sortLabels = getSortLabels(t)

  return (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setFiltersOpen(true)}
          className='h-[30px] gap-1.5'
        >
          <SlidersHorizontal className='size-4' />
          {t('More filters')}
          {props.activeFilterCount > 0 && (
            <Badge className='ml-0.5 size-5 justify-center p-0 text-xs'>
              {props.activeFilterCount}
            </Badge>
          )}
        </Button>
        {props.hasActiveFilters && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={props.onClearFilters}
            className='h-[30px] px-2 text-xs'
          >
            {t('Reset')}
          </Button>
        )}
      </div>

      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <ToggleGroup
          value={[props.showRechargePrice ? 'recharge' : 'standard']}
          onValueChange={(values) => {
            if (values.length > 0) {
              props.onRechargePriceChange(values[0] === 'recharge')
            }
          }}
          variant='outline'
          size='sm'
          aria-label={t('Price display mode')}
        >
          <ToggleGroupItem value='standard'>{t('Standard')}</ToggleGroupItem>
          <ToggleGroupItem value='recharge'>{t('Recharge')}</ToggleGroupItem>
        </ToggleGroup>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-[30px] gap-1.5 px-3 text-xs'
              />
            }
          >
            <ArrowUpDown className='size-3.5' />
            <span>{sortLabels[props.sortBy as SortOption] || t('Sort')}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44'>
            <DropdownMenuGroup>
              {Object.entries(sortLabels).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => props.onSortChange(value)}
                  className='gap-2'
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      props.sortBy === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side='right'
          className={sideDrawerContentClassName('sm:max-w-[480px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('More filters')}</SheetTitle>
            <SheetDescription>
              {t('Filter models by group, pricing type, and tags.')}
            </SheetDescription>
          </SheetHeader>
          <div className={sideDrawerFormClassName('gap-0')}>
            <PricingSidebar
              quotaTypeFilter={props.quotaTypeFilter}
              groupFilter={props.groupFilter}
              tagFilter={props.tagFilter}
              onQuotaTypeChange={props.onQuotaTypeChange}
              onGroupChange={props.onGroupChange}
              onTagChange={props.onTagChange}
              groups={props.groups}
              groupRatios={props.groupRatios}
              tags={props.tags}
              models={props.models}
              hasActiveFilters={props.hasActiveFilters}
              onClearFilters={props.onClearFilters}
              className='border-0 bg-transparent p-0 shadow-none'
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
