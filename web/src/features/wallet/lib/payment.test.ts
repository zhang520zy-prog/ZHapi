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

import { PAYMENT_TYPES } from '../constants'
import { payTargetId, payTargetQuoteParams } from './pay-target'
import {
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
} from './payment'

describe('payment type classification', () => {
  test('keeps Waffo and Waffo Pancake on their dedicated flows', () => {
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO)).toBe(true)
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(false)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(true)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO)).toBe(false)
    expect(isStripePayment(PAYMENT_TYPES.STRIPE)).toBe(true)
  })
})

describe('pay target', () => {
  test('gives each selection a stable, distinct id', () => {
    expect(
      payTargetId({
        kind: 'standard',
        method: { name: 'Alipay', type: 'alipay' },
      })
    ).toBe('std:alipay')
    expect(
      payTargetId({
        kind: 'waffo',
        method: { name: 'Waffo Card' },
        index: 3,
      })
    ).toBe('waffo:3')
    expect(payTargetId({ kind: 'waffoPancake' })).toBe('waffo_pancake')
    expect(payTargetId({ kind: 'creem' })).toBe('creem')
  })

  test('keeps the Waffo method index in the quote request params', () => {
    expect(
      payTargetQuoteParams({
        kind: 'waffo',
        method: { name: 'Waffo Card' },
        index: 3,
      })
    ).toEqual({ paymentType: PAYMENT_TYPES.WAFFO, payMethodIndex: 3 })
  })

  test('passes the method type for standard methods', () => {
    expect(
      payTargetQuoteParams({
        kind: 'standard',
        method: { name: 'Alipay', type: 'alipay' },
      })
    ).toEqual({ paymentType: 'alipay' })
    expect(payTargetQuoteParams({ kind: 'waffoPancake' })).toEqual({
      paymentType: PAYMENT_TYPES.WAFFO_PANCAKE,
    })
  })

  test('returns no quote params for Creem product pricing', () => {
    expect(payTargetQuoteParams({ kind: 'creem' })).toBeNull()
  })
})
