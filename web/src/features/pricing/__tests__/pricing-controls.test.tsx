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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PricingFilterBar } from '../components/pricing-filter-bar'
import { PricingSidebar } from '../components/pricing-sidebar'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import type { PricingModel, PricingVendor } from '../types'

function toolbarProps(): PricingToolbarProps {
  return {
    sortBy: 'name',
    showRechargePrice: false,
    quotaTypeFilter: 'all',
    groupFilter: 'all',
    tagFilter: 'all',
    onSortChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
    onQuotaTypeChange: vi.fn(),
    onGroupChange: vi.fn(),
    onTagChange: vi.fn(),
    groups: ['default', 'premium'],
    groupRatios: { default: 1, premium: 3 },
    tags: [],
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

const baseModel: PricingModel = {
  id: 1,
  model_name: 'text-model',
  vendor_name: 'Vendor A',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  tags: 'Chat,chat',
  supported_endpoint_types: ['openai', 'openai'],
}

const fixtureModels: PricingModel[] = [
  baseModel,
  {
    ...baseModel,
    id: 2,
    model_name: 'image-model',
    quota_type: 1,
    tags: 'chat,Image',
    supported_endpoint_types: ['image-generation'],
  },
  {
    ...baseModel,
    id: 3,
    model_name: 'task-model',
    vendor_name: 'Vendor B',
    tags: 'Video',
    supported_endpoint_types: ['openai-video'],
    billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
  },
]

const fixtureVendors: PricingVendor[] = [
  { id: 1, name: 'Vendor A' },
  { id: 2, name: 'Vendor B' },
  { id: 3, name: 'Vendor C (no models)' },
]

function filterBarProps() {
  return {
    models: fixtureModels,
    vendors: fixtureVendors,
    selectedVendors: [] as string[],
    onToggleVendor: vi.fn(),
    onClearVendors: vi.fn(),
    selectedTypes: [] as string[],
    onToggleType: vi.fn(),
    onClearTypes: vi.fn(),
  }
}

describe('pricing filter bar', () => {
  it('counts each model once per vendor and hides vendors without models', () => {
    render(<PricingFilterBar {...filterBarProps()} />)

    expect(screen.getByRole('button', { name: /^Vendor A\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor B\s*1$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Vendor C/ })).toBeNull()
  })

  it('shows type chips only for categories that have models', () => {
    render(<PricingFilterBar {...filterBarProps()} />)

    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Image\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Video\s*1$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Embeddings/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Rerank/ })).toBeNull()
  })

  it('toggles a brand chip and resets the row through the All chip', async () => {
    const props = filterBarProps()
    const user = userEvent.setup()
    render(<PricingFilterBar {...props} />)

    await user.click(screen.getByRole('button', { name: /^Vendor A/ }))
    expect(props.onToggleVendor).toHaveBeenCalledWith('Vendor A')

    const allButtons = screen.getAllByRole('button', { name: 'All' })
    await user.click(allButtons[0])
    expect(props.onClearVendors).toHaveBeenCalled()
  })

  it('toggles a type chip and exposes pressed state for selections', async () => {
    const props = {
      ...filterBarProps(),
      selectedTypes: ['image'],
    }
    const user = userEvent.setup()
    render(<PricingFilterBar {...props} />)

    const imageChip = screen.getByRole('button', { name: /^Image\s*1$/ })
    expect(imageChip).toHaveAttribute('aria-pressed', 'true')
    await user.click(imageChip)
    expect(props.onToggleType).toHaveBeenCalledWith('image')
  })
})

describe('pricing sidebar filters', () => {
  it('counts tags once per model and keeps quota counts accurate', () => {
    const sidebarProps = {
      quotaTypeFilter: 'all',
      groupFilter: 'all',
      tagFilter: 'all',
      onQuotaTypeChange: vi.fn(),
      onGroupChange: vi.fn(),
      onTagChange: vi.fn(),
      groups: ['default'],
      groupRatios: { default: 1 },
      tags: ['chat', 'image', 'video'],
      models: fixtureModels,
      hasActiveFilters: false,
      onClearFilters: vi.fn(),
    }
    render(<PricingSidebar {...sidebarProps} />)

    expect(screen.getByRole('button', { name: /^chat\s*2$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*1$/ })
    ).toBeVisible()
  })
})

describe('pricing toolbar', () => {
  it('changes the recharge display mode with an accessible selected state', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Recharge' }))
    expect(props.onRechargePriceChange).toHaveBeenCalledWith(true)
    rerender(<PricingToolbar {...props} showRechargePrice />)
    expect(screen.getByRole('button', { name: 'Recharge' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('selects price sorting from the shared dropdown', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Price: Low to High' })
    )
    expect(props.onSortChange).toHaveBeenCalledWith('price-low')
  })

  it('opens more filters from the right, selects a group, and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: /More filters/ }))
    const dialog = await screen.findByRole('dialog', {
      name: 'More filters',
    })
    expect(dialog).toHaveAttribute('data-side', 'right')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /premium/ }))
    expect(props.onGroupChange).toHaveBeenCalledWith('premium')
    rerender(
      <PricingToolbar
        {...props}
        groupFilter='premium'
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('button', { name: /premium/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
    await user.keyboard('{Escape}')
    expect(
      await screen.findByRole('button', { name: /More filters/ })
    ).toHaveFocus()
  })
})
