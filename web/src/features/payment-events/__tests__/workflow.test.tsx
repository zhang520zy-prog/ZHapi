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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { PaymentEvents } from '..'

const event = {
  id: 42,
  event_id: 'evt_42',
  trade_no: 'trade-42',
  provider: 'stripe',
  event_type: 'checkout.session.completed',
  status: 'needs_review',
  attempts: 8,
  version: 5,
  created_at: 1791319096,
  last_error_code: 'order_state_conflict',
}
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'finance',
    role: 10,
    permissions: {
      admin_permissions: { payment: { read: true, operate: true } },
    },
  })
})
afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <PaymentEvents />
    </QueryClientProvider>
  )
}
it('a finance operator retries verified payment evidence only after entering a reason and confirming', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [event], total: 1 } },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { status: 'retry' } } })
  renderPage()
  const user = userEvent.setup()
  expect(
    await screen.findByRole('combobox', { name: 'Status' })
  ).toHaveTextContent('All')
  await user.click(
    await screen.findByRole('button', { name: 'Retry fulfillment' })
  )
  const confirmation = await screen.findByRole('alertdialog', {
    name: 'Retry this payment?',
  })
  await user.click(
    within(confirmation).getByRole('button', { name: 'Retry fulfillment' })
  )
  expect(post).not.toHaveBeenCalled()
  await user.type(
    within(confirmation).getByLabelText('Retry reason'),
    'Order verified with the payment provider.'
  )
  await user.click(
    within(confirmation).getByRole('button', { name: 'Retry fulfillment' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/payment-events/42/retry', {
      expected_version: 5,
      reason: 'Order verified with the payment provider.',
    })
  )
  expect(await screen.findByRole('status')).toHaveTextContent('Retry queued')
})
it('a read-only finance operator cannot trigger fulfillment', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'viewer',
    role: 10,
    permissions: {
      admin_permissions: { payment: { read: true, operate: false } },
    },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [event], total: 1 } },
  })
  renderPage()
  expect(await screen.findByText('trade-42')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Retry fulfillment' })
  ).not.toBeInTheDocument()
})
it('ordinary users cannot request the payment exception ledger', () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'customer', role: 1 })
  const get = vi.spyOn(api, 'get')
  renderPage()
  expect(screen.getByText('Payment permission required')).toBeVisible()
  expect(get).not.toHaveBeenCalled()
})
it('a revoked finance read permission hides cached payment rows and retry actions', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: { success: true, data: { items: [event], total: 1 } },
    })
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 403 } })
  renderPage()
  const user = userEvent.setup()
  expect(await screen.findByText('trade-42')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(
    await screen.findByText(
      'Payment access changed. Refresh your account permissions.'
    )
  ).toBeVisible()
  expect(screen.queryByText('trade-42')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Retry fulfillment' })
  ).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledTimes(2)
})
it('an operator can inspect safe payment history without requesting it until details are opened', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/payment-events/42'
          ? {
              event,
              history: {
                items: [
                  {
                    id: 1,
                    action: 'retry_requested',
                    actor_id: 9,
                    reason: 'Verified original transaction',
                    attempt: 0,
                    error_code: '',
                    created_at: event.created_at,
                  },
                ],
                total: 1,
              },
            }
          : { items: [event], total: 1 },
    },
  }))
  renderPage()
  const user = userEvent.setup()
  expect(await screen.findByText('trade-42')).toBeVisible()
  expect(get).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', { name: 'Payment history' })
  expect(
    await within(dialog).findByText('Verified original transaction')
  ).toBeVisible()
  expect(get).toHaveBeenCalledWith('/api/payment-events/42', {
    params: { p: 1, page_size: 20 },
  })
})
it('a finance reviewer resolves a partial subscription refund with an explicit entitlement decision and reason', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'finance',
    role: 10,
    permissions: {
      admin_permissions: { payment: { read: true, review: true } },
    },
  })
  const refundEvent = {
    ...event,
    event_type: 'charge.refunded',
    paid_minor: 200,
    refunded_minor: 100,
  }
  const receipt = {
    id: 1,
    trade_no: 'subscription-42',
    paid_minor: 200,
    currency: 'USD',
    credited_quota: 0,
    reversed_quota: 0,
    waived_quota: 0,
    refunded_minor: 0,
    dispute_loss_minor: 0,
    user_subscription_id: 11,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/payment-events/42'
          ? { event: refundEvent, receipt, history: { items: [], total: 0 } }
          : { items: [refundEvent], total: 1 },
    },
  }))
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const details = await screen.findByRole('dialog', { name: 'Payment history' })
  await user.click(
    await within(details).findByRole('button', {
      name: 'Review financial outcome',
    })
  )
  const confirmation = await screen.findByRole('alertdialog', {
    name: 'Resolve this payment exception?',
  })
  expect(
    within(confirmation).getByRole('combobox', { name: 'Financial decision' })
  ).toHaveTextContent('Keep the remaining entitlement')
  expect(
    within(confirmation).getByRole('button', { name: 'Save financial review' })
  ).toBeDisabled()
  await user.type(
    within(confirmation).getByLabelText('Review reason'),
    'Keep the remaining plan entitlement after provider refund.'
  )
  await user.click(
    within(confirmation).getByRole('button', { name: 'Save financial review' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/payment-events/42/review', {
      expected_version: 5,
      reason: 'Keep the remaining plan entitlement after provider refund.',
      action: 'keep_entitlement',
    })
  )
})
