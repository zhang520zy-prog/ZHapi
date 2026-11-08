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
import { t } from 'i18next'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export interface PaymentEvent {
  id: number
  event_id: string
  trade_no: string
  provider: string
  event_type: string
  status: string
  attempts: number
  created_at: number
  last_error_code: string
  version: number
  paid_minor?: number
  currency?: string
  payment_intent?: string
  related_trade_no?: string
  refunded_minor?: number
  dispute_status?: string
  payment_receipt_id?: number
}
export interface PaymentReceipt {
  id: number
  trade_no: string
  paid_minor: number
  currency: string
  credited_quota: number
  refunded_minor: number
  dispute_loss_minor: number
  reversed_quota: number
  waived_quota: number
  user_subscription_id: number
}
export interface PaymentEventAction {
  id: number
  action: string
  actor_id: number
  reason: string
  attempt: number
  error_code: string
  created_at: number
}
export async function getPaymentEventDetail(id: number, p: number) {
  const response = await api.get<
    ApiResponse<{
      event: PaymentEvent
      receipt?: PaymentReceipt | null
      history: { items: PaymentEventAction[]; total: number }
    }>
  >(`/api/payment-events/${id}`, { params: { p, page_size: 20 } })
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Payment history unavailable'))
  }
  return response.data.data
}
export async function getPaymentEvents(params: {
  p: number
  page_size: number
  status?: string
  trade_no?: string
}) {
  const response = await api.get<
    ApiResponse<{ items: PaymentEvent[]; total: number }>
  >('/api/payment-events/', { params })
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load payment events'))
  }
  return response.data.data
}
export async function retryPaymentEvent(event: PaymentEvent, reason: string) {
  const response = await api.post<ApiResponse<unknown>>(
    `/api/payment-events/${event.id}/retry`,
    { expected_version: event.version, reason }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Payment retry failed'))
  }
}
export async function reviewPaymentEvent(
  event: PaymentEvent,
  input: { reason: string; action: string }
) {
  const response = await api.post<ApiResponse<unknown>>(
    `/api/payment-events/${event.id}/review`,
    { expected_version: event.version, ...input }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Financial review failed'))
  }
}
