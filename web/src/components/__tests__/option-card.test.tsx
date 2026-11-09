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
import { Wallet } from 'lucide-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OptionCard } from '../option-card'

describe('OptionCard', () => {
  it('renders title, description and trailing meta', () => {
    render(
      <OptionCard
        icon={Wallet}
        title='Credit card'
        description='Stripe checkout'
        meta={<span>fee 2%</span>}
      />
    )
    expect(
      screen.getByRole('button', { name: /credit card/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Stripe checkout')).toBeInTheDocument()
    expect(screen.getByText('fee 2%')).toBeInTheDocument()
  })

  it('marks the selected card pressed and applies accent selection styles', () => {
    render(<OptionCard title='Package A' selected />)
    const card = screen.getByRole('button', { name: 'Package A' })
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(card).toHaveClass(
      'aria-pressed:shadow-[inset_0_0_0_2px_var(--primary)]'
    )
    expect(card).toHaveClass('aria-pressed:bg-primary/6')
    const check = card.querySelector('svg.text-primary')
    expect(check).not.toBeNull()
    expect(check).toHaveAttribute('aria-hidden', 'true')
  })

  it('hides the selection check when not selected', () => {
    const { container } = render(<OptionCard title='Package A' />)
    expect(container.querySelector('svg.text-primary')).toBeNull()
  })

  it('uses the option-card radius token instead of a hardcoded radius', () => {
    render(<OptionCard title='Package A' />)
    expect(screen.getByRole('button', { name: 'Package A' })).toHaveClass(
      'rounded-[var(--rd-radius-option)]'
    )
  })

  it('invokes onSelect when clicked and stays inert when disabled', async () => {
    const onSelect = vi.fn()
    const { unmount } = render(
      <OptionCard title='Package A' onSelect={onSelect} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Package A' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    unmount()

    const onDisabledSelect = vi.fn()
    render(
      <OptionCard title='Package B' disabled onSelect={onDisabledSelect} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Package B' }))
    expect(onDisabledSelect).not.toHaveBeenCalled()
  })

  it('activates on Enter via keyboard focus', async () => {
    const onSelect = vi.fn()
    render(<OptionCard title='Package A' onSelect={onSelect} />)
    const card = screen.getByRole('button', { name: 'Package A' })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
