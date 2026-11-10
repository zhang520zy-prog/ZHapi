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
import type { StatusBadgeProps } from '@/components/status-badge'
import { formatTimestampToDate } from '@/lib/format'

import type { TopupStatus } from '../types'

// ============================================================================
// Billing Utility Functions
// ============================================================================

interface StatusConfig {
  variant: StatusBadgeProps['variant']
  label: string
}

/**
 * Status badge configuration
 */
export const STATUS_CONFIG: Record<TopupStatus, StatusConfig> = {
  success: {
    variant: 'success',
    label: 'Success',
  },
  pending: {
    variant: 'warning',
    label: 'Pending',
  },
  expired: {
    variant: 'danger',
    label: 'Expired',
  },
}

/**
 * Get status badge configuration
 */
export function getStatusConfig(status: TopupStatus): StatusConfig {
  return STATUS_CONFIG[status] || STATUS_CONFIG.pending
}

// ============================================================================
// Merged billing entries (GET /api/user/billing/self)
// ============================================================================

/** Filter chip values — `all` maps to the unfiltered list. */
export const BILLING_KINDS = [
  'all',
  'topup',
  'subscription',
  'invoice_fee',
] as const
export type BillingKindFilter = (typeof BILLING_KINDS)[number]

export const BILLING_KIND_LABELS: Record<BillingKindFilter, string> = {
  all: 'All',
  topup: 'Top Up',
  subscription: 'Subscription',
  invoice_fee: 'Invoice fee',
}

/**
 * Merged-entry status mapping per the N3 spec: success → success, pending →
 * warning, failed/expired → danger, everything else → neutral.
 */
const BILLING_STATUS_VARIANTS: Record<string, StatusConfig['variant']> = {
  success: 'success',
  pending: 'warning',
  awaiting_payment: 'warning',
  processing: 'warning',
  issued: 'success',
  failed: 'danger',
  expired: 'danger',
}

const BILLING_STATUS_LABELS: Record<string, string> = {
  success: 'Success',
  pending: 'Pending',
  awaiting_payment: 'Awaiting payment',
  processing: 'Processing',
  issued: 'Issued',
  rejected: 'Rejected',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function getBillingStatusConfig(status: string): StatusConfig {
  return {
    variant: BILLING_STATUS_VARIANTS[status] ?? 'neutral',
    label: BILLING_STATUS_LABELS[status] ?? status,
  }
}

/**
 * Payment method display names
 */
export const PAYMENT_METHOD_NAMES: Record<string, string> = {
  stripe: 'Stripe',
  alipay: 'Alipay',
  wxpay: 'WeChat Pay',
  waffo: 'Waffo',
  waffo_pancake: 'Waffo Pancake',
  balance: 'Balance',
  invoice_fee: 'Invoice fee',
  creem: 'Creem',
}

/**
 * Get payment method display name
 */
export function getPaymentMethodName(
  method: string,
  t?: (key: string) => string
): string {
  const name = PAYMENT_METHOD_NAMES[method] || method
  return t ? t(name) : name
}

/**
 * Format timestamp to readable date string
 */
export function formatTimestamp(timestamp: number): string {
  return formatTimestampToDate(timestamp)
}
