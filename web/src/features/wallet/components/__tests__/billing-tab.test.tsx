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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Wallet } from '../..'

const billingItems = [
  {
    kind: 'topup',
    trade_no: 'TU2026001',
    status: 'success',
    create_time: 1730000000,
    complete_time: 1730000100,
    title: '',
    payment_provider: 'epay',
    payment_method: 'alipay',
    credited_money: '100.00',
    fee_money: '1.50',
    total_money: '101.50',
    fee_rate_bps: 150,
    currency: 'CNY',
    quota: 500000,
  },
  {
    kind: 'subscription',
    trade_no: 'SUB2026001',
    status: 'success',
    create_time: 1730000500,
    complete_time: 1730000600,
    title: 'Pro Monthly',
    payment_provider: 'balance',
    payment_method: 'balance',
    credited_money: '29.90',
    fee_money: '0.00',
    total_money: '29.90',
    fee_rate_bps: 0,
    currency: 'CNY',
    quota: 4100000,
  },
  {
    kind: 'invoice_fee',
    trade_no: 'INV2026001',
    status: 'expired',
    create_time: 1730000700,
    complete_time: 0,
    title: '',
    payment_provider: 'balance',
    payment_method: 'invoice_fee',
    credited_money: '0.00',
    fee_money: null,
    total_money: '5.00',
    fee_rate_bps: 0,
    currency: 'CNY',
    quota: null,
  },
]

const adminTopupItems = [
  {
    id: 9,
    user_id: 42,
    amount: 500000,
    money: 7.3,
    trade_no: 'ADMINTOPUP1',
    payment_method: 'wxpay',
    create_time: 1730000000,
    complete_time: 0,
    status: 'pending',
  },
]

function statusData() {
  return {
    price: 7.3,
    user_agreement_enabled: false,
    SidebarModulesAdmin: '',
    quota_display_type: 'USD',
    quota_per_unit: 500000,
    usd_exchange_rate: 1,
  }
}

const walletSearchSchema = z.object({
  tab: z.enum(['topup', 'subscription', 'billing']).optional(),
  show_history: z.boolean().optional(),
  kind: z
    .enum(['all', 'topup', 'subscription', 'invoice_fee'])
    .optional()
    .catch('all'),
  keyword: z.string().optional().catch(undefined),
  p: z.number().int().min(1).optional().catch(1),
})

async function renderPage(path = '/wallet?tab=billing') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  const layout = createRoute({
    getParentRoute: () => authenticated,
    path: 'wallet',
  })
  const index = createRoute({
    getParentRoute: () => layout,
    path: '/',
    validateSearch: walletSearchSchema,
    component: Wallet,
  })
  const router = createRouter({
    routeTree: root.addChildren([
      authenticated.addChildren([layout.addChildren([index])]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

function mockApi(
  options: { billingItems?: unknown[]; billingTotal?: number } = {}
) {
  const payloads: Record<string, unknown> = {
    '/api/user/topup/info': {},
    '/api/user/self': { id: 7, username: 'alice', quota: 0 },
    '/api/subscription/plans': [],
    '/api/subscription/self': null,
    '/api/status': statusData(),
    '/api/user/billing/self': {
      items: options.billingItems ?? billingItems,
      total: options.billingTotal ?? billingItems.length,
    },
    '/api/user/topup': { items: adminTopupItems, total: 1 },
  }
  const getSpy = vi
    .spyOn(api, 'get')
    .mockImplementation(async (url: string) => {
      const hit = Object.entries(payloads)
        .sort((a, b) => b[0].length - a[0].length)
        .find(([prefix]) => url.startsWith(prefix))
      return { data: { success: true, data: hit?.[1] ?? null } }
    })
  const postSpy = vi
    .spyOn(api, 'post')
    .mockImplementation(async () => ({ data: { success: true } }))
  return { getSpy, postSpy }
}

type GetSpy = ReturnType<typeof mockApi>['getSpy']

function billingSelfCalls(getSpy: GetSpy) {
  return getSpy.mock.calls.filter(
    (call) => call[0] === '/api/user/billing/self'
  )
}

function setAdminUser() {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'admin',
    role: 10,
  } as never)
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('renders merged billing entries from /api/user/billing/self', async () => {
  mockApi()
  await renderPage('/wallet?tab=billing')

  // All three kinds render — table + mobile card both contain them.
  await screen.findAllByText('TU2026001')
  expect(screen.getAllByText('TU2026001').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('Pro Monthly').length).toBeGreaterThanOrEqual(1)
  // Kind badges
  expect(screen.getAllByText('Top Up').length).toBeGreaterThanOrEqual(2)
  expect(screen.getAllByText('Subscription').length).toBeGreaterThanOrEqual(2)
  expect(screen.getAllByText('Invoice fee').length).toBeGreaterThanOrEqual(2)
  // Server money strings with currency symbols — no recalculation.
  expect(screen.getAllByText('¥101.50').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('¥1.50').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('¥29.90').length).toBeGreaterThanOrEqual(1)
  // Nullable fee renders as a dash.
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  // Status mapping.
  expect(screen.getAllByText('Success').length).toBeGreaterThanOrEqual(2)
  expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(1)
  // Localised payment method names.
  expect(screen.getAllByText('Alipay').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('Balance').length).toBeGreaterThanOrEqual(1)
})

it('sends kind and page from the URL to the merged endpoint', async () => {
  const { getSpy } = mockApi()
  await renderPage('/wallet?tab=billing&kind=subscription&p=2')

  await waitFor(() => {
    expect(billingSelfCalls(getSpy).length).toBeGreaterThan(0)
  })
  const params = billingSelfCalls(getSpy).at(-1)?.[1]?.params
  expect(params).toMatchObject({
    p: 2,
    kind: 'subscription',
    page_size: 10,
  })
})

it('chip click updates kind in the URL and refetches', async () => {
  const { getSpy } = mockApi()
  const router = await renderPage('/wallet?tab=billing')
  const user = userEvent.setup()

  await screen.findAllByText('TU2026001')
  await user.click(screen.getByRole('button', { name: 'Subscription' }))

  await waitFor(() => {
    expect(router.state.location.search.kind).toBe('subscription')
    expect(router.state.location.search.p).toBe(1)
  })
  await waitFor(() => {
    const last = billingSelfCalls(getSpy).at(-1)?.[1]?.params
    expect(last).toMatchObject({ kind: 'subscription', p: 1 })
  })
  // Chip shows pressed state.
  expect(screen.getByRole('button', { name: 'Subscription' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

it('debounced keyword search persists to the URL and request', async () => {
  const { getSpy } = mockApi()
  const router = await renderPage('/wallet?tab=billing')
  const user = userEvent.setup()

  await screen.findAllByText('TU2026001')
  await user.type(
    screen.getByPlaceholderText('Search by order number...'),
    'INV2026'
  )

  await waitFor(
    () => {
      expect(router.state.location.search.keyword).toBe('INV2026')
    },
    { timeout: 2000 }
  )
  await waitFor(() => {
    const last = billingSelfCalls(getSpy).at(-1)?.[1]?.params
    expect(last).toMatchObject({ keyword: 'INV2026' })
  })
})

it('shows the empty state when the merged list is empty', async () => {
  mockApi({ billingItems: [], billingTotal: 0 })
  await renderPage('/wallet?tab=billing')

  expect(await screen.findByText('No billing records')).toBeInTheDocument()
})

it('does not render the admin switch for regular users', async () => {
  mockApi()
  await renderPage('/wallet?tab=billing')
  await screen.findAllByText('TU2026001')
  expect(screen.queryByText('All users')).not.toBeInTheDocument()
})

it('admin switch swaps to the all-users view with complete-order flow', async () => {
  setAdminUser()
  const { getSpy, postSpy } = mockApi()
  await renderPage('/wallet?tab=billing')
  const user = userEvent.setup()

  await screen.findAllByText('TU2026001')
  await user.click(screen.getByRole('switch', { name: 'All users' }))

  // Admin list calls the legacy admin endpoint, not billing/self.
  await screen.findAllByText('ADMINTOPUP1')
  await waitFor(() => {
    expect(
      getSpy.mock.calls.some(([url]) => url.startsWith('/api/user/topup?'))
    ).toBe(true)
  })
  expect(screen.getAllByText('ADMINTOPUP1').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('User ID: 42')).toBeInTheDocument()

  // Complete-order confirmation.
  await user.click(screen.getByRole('button', { name: 'Complete Order' }))
  await user.click(await screen.findByRole('button', { name: 'Confirm' }))
  await waitFor(() => {
    expect(postSpy).toHaveBeenCalledWith('/api/user/topup/complete', {
      trade_no: 'ADMINTOPUP1',
    })
  })
})
