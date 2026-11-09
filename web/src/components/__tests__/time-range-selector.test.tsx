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
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TimeRangeSelector } from '../time-range-selector'

describe('TimeRangeSelector', () => {
  it('offers the four spec options in order', () => {
    render(<TimeRangeSelector value='7d' onChange={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Time range' })
    const labels = [...group.querySelectorAll('button')].map(
      (button) => button.textContent
    )
    expect(labels).toEqual(['24 Hours', '7 Days', '30 Days', 'Custom'])
  })

  it('marks the current value pressed with accent-selected styling', () => {
    render(<TimeRangeSelector value='7d' onChange={() => undefined} />)
    const selected = screen.getByRole('button', { name: '7 Days' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveClass('aria-pressed:bg-accent')
    expect(selected).toHaveClass('aria-pressed:text-accent-foreground')
    expect(screen.getByRole('button', { name: '24 Hours' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('reports the picked range through onChange', async () => {
    const onChange = vi.fn()
    render(<TimeRangeSelector value='24h' onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '30 Days' }))
    expect(onChange).toHaveBeenCalledWith('30d')
  })

  it('fires onCustomSelect for custom clicks, including re-clicks', async () => {
    const onChange = vi.fn()
    const onCustomSelect = vi.fn()
    render(
      <TimeRangeSelector
        value='custom'
        onChange={onChange}
        onCustomSelect={onCustomSelect}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(onCustomSelect).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})
