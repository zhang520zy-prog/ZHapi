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
import { describe, expect, test } from 'vitest'

import { formatFeeRateBps, formatQuoteMoney } from './format'

describe('formatFeeRateBps', () => {
  test('renders whole-number rates without decimals', () => {
    expect(formatFeeRateBps(300)).toBe('3%')
  })

  test('renders fractional rates with two decimals', () => {
    expect(formatFeeRateBps(150)).toBe('1.5%')
    expect(formatFeeRateBps(25)).toBe('0.25%')
  })

  test('renders zero and undefined as 0%', () => {
    expect(formatFeeRateBps(0)).toBe('0%')
    expect(formatFeeRateBps(undefined)).toBe('0%')
  })
})

describe('formatQuoteMoney', () => {
  test('prefixes known currency symbols', () => {
    expect(formatQuoteMoney('101.50', 'CNY')).toBe('¥101.50')
    expect(formatQuoteMoney('10.00', 'usd')).toBe('$10.00')
    expect(formatQuoteMoney('5.00', 'EUR')).toBe('€5.00')
  })

  test('falls back to currency code for unknown currencies', () => {
    expect(formatQuoteMoney('100', 'JPY')).toBe('JPY 100')
  })
})
