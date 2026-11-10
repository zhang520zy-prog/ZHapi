import { useQuery } from '@tanstack/react-query'

import { payTargetQuoteParams, type PayTarget } from '../lib/pay-target'
import { requestPaymentQuote } from './use-payment'

/**
 * Server-side quote for the current amount + payment target, keyed so a stale
 * response can never overwrite the selection the user just made: changing the
 * method or the amount produces a different query key, and the details panel
 * only ever reads the entry that belongs to the latest inputs.
 *
 * Auto error toast is disabled — quote failures render inline in the details
 * panel where they are actionable.
 */
export function usePaymentQuote(
  amount: number,
  target: PayTarget | null,
  enabled: boolean
) {
  const params = target ? payTargetQuoteParams(target) : null

  return useQuery({
    queryKey: [
      'wallet',
      'topup-quote',
      amount,
      params?.paymentType ?? 'none',
      params?.payMethodIndex ?? -1,
    ],
    queryFn: () => {
      if (params == null) {
        return Promise.reject(new Error('No payment target selected'))
      }
      return requestPaymentQuote(amount, params.paymentType, {
        payMethodIndex: params.payMethodIndex,
      })
    },
    enabled: enabled && params != null && amount > 0,
    retry: false,
    staleTime: 0,
    meta: { errorToast: false },
  })
}
