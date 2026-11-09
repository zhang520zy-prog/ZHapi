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
import { Activity } from 'lucide-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MetricCard } from '../metric-card'

describe('MetricCard', () => {
  it('renders icon, title, large tabular value and subtitle', () => {
    const { container } = render(
      <MetricCard
        icon={Activity}
        title='Requests'
        value='12,340'
        description='in selected range'
      />
    )
    expect(screen.getByText('Requests')).toBeInTheDocument()
    const value = screen.getByText('12,340')
    expect(value).toHaveClass('font-mono', 'tabular-nums')
    expect(value).toHaveClass('text-[22px]/7', 'sm:text-[28px]/[34px]')
    expect(screen.getByText('in selected range')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('tints the round icon badge and the trend with the card chart tone', () => {
    const { container } = render(
      <MetricCard
        icon={Activity}
        tone='chart-2'
        title='Requests'
        value='12,340'
        trend={[1, 3, 2, 5, 4]}
      />
    )
    const iconBadge = container.querySelector('span.rounded-full')
    expect(iconBadge).toHaveClass('bg-chart-2/14', 'text-chart-2', 'size-10')
    const trendSvg = container.querySelector('svg.h-12')
    expect(trendSvg).toHaveClass('text-chart-2')
    expect(trendSvg?.querySelector('path[stroke-width]')).toHaveAttribute(
      'stroke-width',
      '1.5'
    )
    expect(
      trendSvg?.querySelector('stop[offset="0%"]')
    ).toHaveAttribute('stop-opacity', '0.24')
  })

  it('renders an optional status chip with a dot and 12% tint', () => {
    const { container } = render(
      <MetricCard
        title='Relay health'
        value='99.9%'
        status={{ label: 'Normal', variant: 'success' }}
      />
    )
    const chip = screen.getByText('Normal').closest('[data-slot=status-badge]')
    expect(chip).not.toBeNull()
    expect(chip).toHaveClass('bg-success/12', 'h-5.5', 'rounded-full')
    expect(container.querySelector('.rounded-full.size-1\\.5')).not.toBeNull()
  })

  it('shows skeletons while loading and hides the value', () => {
    render(<MetricCard title='Requests' value='12,340' loading />)
    expect(screen.queryByText('12,340')).not.toBeInTheDocument()
  })

  it('renders the area trend without exposing it to assistive tech', () => {
    const { container } = render(
      <MetricCard title='Requests' value='12,340' trend={[1, 3, 2, 5, 4]} />
    )
    const svg = container.querySelector('svg[aria-hidden="true"]')
    expect(svg).not.toBeNull()
  })
})
