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
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { isHttpUrl } from '@/lib/content-format'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
  submitPaymentForm,
} from '../lib'
import type { AmountRequest, AmountResponse, PaymentQuote } from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

type AmountCalculator = (request: AmountRequest) => Promise<AmountResponse>

export interface PaymentAmountCalculators {
  regular: AmountCalculator
  stripe: AmountCalculator
  waffo: AmountCalculator
  waffoPancake: AmountCalculator
}

const defaultPaymentAmountCalculators: PaymentAmountCalculators = {
  regular: calculateAmount,
  stripe: calculateStripeAmount,
  waffo: calculateWaffoAmount,
  waffoPancake: calculateWaffoPancakeAmount,
}

export interface PaymentAmountOptions {
  /** Server-side Waffo payment method index */
  payMethodIndex?: number
  calculators?: PaymentAmountCalculators
}

export interface PaymentAmountResult {
  /** Total amount to pay */
  amount: number
  /** Server-side quote (credited / fee / total) */
  quote?: PaymentQuote
}

export interface PaymentQuoteResult {
  /** Total amount to pay, derived from the server response for control flow only */
  amount: number
  /** Server-side quote (credited / fee / total), displayed verbatim */
  quote: PaymentQuote | null
}

/**
 * Request a server-side payment quote for the given top-up amount and payment
 * type. Rejects with a server-aware error (`createServerError`) when the
 * backend reports failure or returns no data, so React Query callers can show
 * the server message inline instead of a toast.
 */
export async function requestPaymentQuote(
  topupAmount: number,
  paymentType: string,
  options: PaymentAmountOptions = {}
): Promise<PaymentQuoteResult> {
  const calculators = options.calculators ?? defaultPaymentAmountCalculators
  let calculator = calculators.regular
  if (isStripePayment(paymentType)) {
    calculator = calculators.stripe
  } else if (isWaffoPayment(paymentType)) {
    calculator = calculators.waffo
  } else if (isWaffoPancakePayment(paymentType)) {
    calculator = calculators.waffoPancake
  }

  const request: AmountRequest = { amount: topupAmount }
  if (isWaffoPayment(paymentType)) {
    request.pay_method_index = options.payMethodIndex
  } else {
    request.payment_method = paymentType
  }

  const response = await calculator(request)
  if (!isApiSuccess(response) || !response.data) {
    throw createServerError(response, i18next.t('Failed to calculate amount'))
  }

  return {
    amount: Number.parseFloat(response.data),
    quote: response.quote ?? null,
  }
}

export async function requestPaymentAmount(
  topupAmount: number,
  paymentType: string,
  options: PaymentAmountOptions = {}
): Promise<PaymentAmountResult> {
  try {
    const result = await requestPaymentQuote(topupAmount, paymentType, options)
    return { amount: result.amount, quote: result.quote ?? undefined }
  } catch {
    return { amount: 0 }
  }
}

export function usePayment() {
  const [processing, setProcessing] = useState(false)

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          handleServerError(response, i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        if (isStripe && response.data?.pay_link) {
          const payLink = response.data.pay_link as string
          if (!isHttpUrl(payLink)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
          window.open(payLink, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        // Handle non-Stripe payment
        if (!isStripe && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            if (!isHttpUrl(url)) {
              toast.error(i18next.t('Invalid payment redirect URL'))
              return false
            }
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    processing,
    processPayment,
  }
}
