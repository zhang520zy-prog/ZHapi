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
import i18n from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import dayjs from '@/lib/dayjs'

import { CompactDateTimeRangePicker } from '../compact-date-time-range-picker'

async function clickThisWeek() {
  const onChange = vi.fn()
  render(<CompactDateTimeRangePicker onChange={onChange} />)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await user.click(screen.getByRole('button', { name: 'Date Range' }))
  await user.click(await screen.findByRole('button', { name: 'This week' }))
  expect(onChange).toHaveBeenCalledTimes(1)
  return onChange.mock.calls[0][0] as { start?: Date; end?: Date }
}

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('This week preset', () => {
  it.each(['en', 'zhCN', 'zhTW'])(
    'runs Monday 00:00 to Sunday 23:59:59.999 in %s',
    async (lang) => {
      // 2026-11-11 is a Wednesday; ISO week is 11-09 (Mon) → 11-15 (Sun).
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date('2026-11-11T12:00:00'))
      await i18n.changeLanguage(lang)

      const range = await clickThisWeek()

      expect(dayjs(range.start).format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
        '2026-11-09 00:00:00.000'
      )
      expect(dayjs(range.end).format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
        '2026-11-15 23:59:59.999'
      )
    }
  )

  it('starts on the Monday six days ago when today is Sunday', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // A locale-based week starting Sunday would collapse to just today; the
    // ISO week must reach back to Monday 2026-11-09.
    vi.setSystemTime(new Date('2026-11-15T12:00:00'))

    const range = await clickThisWeek()

    expect(dayjs(range.start).format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
      '2026-11-09 00:00:00.000'
    )
    expect(dayjs(range.end).format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
      '2026-11-15 23:59:59.999'
    )
  })
})
