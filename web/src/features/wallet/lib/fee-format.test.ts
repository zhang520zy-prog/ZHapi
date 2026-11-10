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

import { formatServerMoney } from '@/lib/currency'

import { formatFeeRateBps } from './format'

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

describe('formatServerMoney', () => {
  test('prefixes known currency symbols without reparsing the amount', () => {
    expect(formatServerMoney('101.50', 'CNY')).toBe('¥101.50')
    expect(formatServerMoney('10.00', 'usd')).toBe('$10.00')
    expect(formatServerMoney('5.00', 'EUR')).toBe('€5.00')
  })

  test('falls back to the currency code for unknown currencies', () => {
    expect(formatServerMoney('100', 'ABC')).toBe('ABC 100')
  })

  test('keeps the server string when currency is missing or amount absent', () => {
    expect(formatServerMoney('9.99', '')).toBe('9.99')
    expect(formatServerMoney(null, 'CNY')).toBe('-')
    expect(formatServerMoney('', 'CNY')).toBe('-')
  })
})
