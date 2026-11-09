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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from '@/components/status-badge'

import { Badge } from '../badge'

describe('status badge shape', () => {
  it('Badge uses a 22px fully rounded pill with 12% status tint', () => {
    render(<Badge variant='destructive'>Failed</Badge>)
    const badge = screen.getByText('Failed')
    expect(badge).toHaveClass('h-5.5', 'rounded-full', 'bg-destructive/12')
  })

  it('StatusBadge badge type carries the same tint, height and shape', () => {
    render(
      <StatusBadge
        type='badge'
        variant='warning'
        label='Needs optimization'
        copyable={false}
      />
    )
    const badge = screen
      .getByText('Needs optimization')
      .closest('[data-slot=status-badge]')
    expect(badge).toHaveClass(
      'h-5.5',
      'rounded-full',
      'bg-warning/12',
      'text-warning',
      'text-xs'
    )
  })

  it('StatusBadge showDot renders the optional 6px status dot', () => {
    const { container } = render(
      <StatusBadge
        variant='success'
        label='Normal'
        showDot
        copyable={false}
      />
    )
    const dot = container.querySelector('span.size-1\\.5.rounded-full')
    expect(dot).not.toBeNull()
    expect(dot).toHaveClass('bg-success')
  })

  it('StatusBadge text and underline types keep no background tint', () => {
    render(
      <StatusBadge
        type='text'
        variant='danger'
        label='Blocked'
        copyable={false}
      />
    )
    const badge = screen
      .getByText('Blocked')
      .closest('[data-slot=status-badge]')
    expect(badge).not.toHaveClass('bg-destructive/12')
    expect(badge).toHaveClass('text-destructive')
  })
})
