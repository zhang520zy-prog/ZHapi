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
import { requestPaymentAmount } from './use-payment'

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const result = await requestPaymentAmount(120, PAYMENT_TYPES.WAFFO, {
      payMethodIndex: 1,
      calculators: {
        regular: async () => {
          calls.push('regular')
          return { success: true, data: '1' }
        },
        stripe: async () => {
          calls.push('stripe')
          return { success: true, data: '2' }
        },
        waffo: async (request) => {
          calls.push(`waffo:${request.amount}:${request.pay_method_index}`)
          return { success: true, data: '18.75' }
        },
        waffoPancake: async () => {
          calls.push('pancake')
          return { success: true, data: '4' }
        },
      },
    })

    expect(result.amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120:1'])
  })

  test('returns the server quote and payment_method for regular payments', async () => {
    const requests: string[] = []
    const result = await requestPaymentAmount(100, 'alipay', {
      calculators: {
        regular: async (request) => {
          requests.push(`${request.amount}:${request.payment_method}`)
          return {
            success: true,
            data: '101.50',
            quote: {
              credited_money: '100.00',
              fee_rate_bps: 150,
              fee: '1.50',
              total: '101.50',
              currency: 'CNY',
              fee_included: false,
            },
          }
        },
        stripe: async () => ({ success: true, data: '2' }),
        waffo: async () => ({ success: true, data: '3' }),
        waffoPancake: async () => ({ success: true, data: '4' }),
      },
    })

    expect(requests).toEqual(['100:alipay'])
    expect(result.amount).toBe(101.5)
    expect(result.quote?.fee).toBe('1.50')
    expect(result.quote?.total).toBe('101.50')
  })
})
