/**
 * The unified "what the user is paying with" selection for the recharge tab.
 * One payment-method card maps to exactly one target kind; Creem additionally
 * requires picking a product from the amount step.
 */
import { PAYMENT_TYPES } from '../constants'
import type { PaymentMethod, TopupInfo, WaffoPayMethod } from '../types'

export type PayTarget =
  | { kind: 'standard'; method: PaymentMethod }
  | { kind: 'waffo'; method: WaffoPayMethod; index: number }
  | { kind: 'waffoPancake' }
  | { kind: 'creem' }

/** Stable identity used for `aria-pressed` state and as part of the quote query key. */
export function payTargetId(target: PayTarget): string {
  switch (target.kind) {
    case 'standard':
      return `std:${target.method.type}`
    case 'waffo':
      return `waffo:${target.index}`
    case 'waffoPancake':
      return 'waffo_pancake'
    case 'creem':
      return 'creem'
  }
}

/**
 * Quote-request parameters for a target, or `null` when the target does not
 * hit the server quote endpoints (Creem prices come from the product itself).
 */
export function payTargetQuoteParams(
  target: PayTarget
): { paymentType: string; payMethodIndex?: number } | null {
  switch (target.kind) {
    case 'standard':
      return { paymentType: target.method.type }
    case 'waffo':
      return { paymentType: PAYMENT_TYPES.WAFFO, payMethodIndex: target.index }
    case 'waffoPancake':
      return { paymentType: PAYMENT_TYPES.WAFFO_PANCAKE }
    case 'creem':
      return null
  }
}

export function isCreemTarget(
  target: PayTarget | null
): target is { kind: 'creem' } {
  return target?.kind === 'creem'
}

/** Whether any online top-up channel is enabled for this account. */
export function hasAnyTopupMethod(topupInfo: TopupInfo | null): boolean {
  if (!topupInfo) return false
  return (
    topupInfo.enable_online_topup === true ||
    topupInfo.enable_stripe_topup === true ||
    topupInfo.enable_creem_topup === true ||
    topupInfo.enable_waffo_topup === true ||
    topupInfo.enable_waffo_pancake_topup === true
  )
}
