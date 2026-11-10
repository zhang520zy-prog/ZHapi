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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api } from '@/lib/api'

import { Wallet } from '../..'

const userData = {
  id: 7,
  username: 'alice',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  aff_count: 0,
  group: 'default',
}

const quote = {
  credited_money: '100.00',
  fee_rate_bps: 150,
  fee: '1.50',
  total: '101.50',
  currency: 'CNY',
  fee_included: false,
}

const topupInfoData = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  enable_creem_topup: true,
  enable_waffo_topup: true,
  enable_waffo_pancake_topup: true,
  min_topup: 10,
  stripe_min_topup: 1,
  waffo_min_topup: 5,
  waffo_pancake_min_topup: 1,
  waffo_pancake_fee_rate_bps: 150,
  pay_methods: [
    { name: 'Alipay', type: 'alipay', fee_rate_bps: 150 },
    { name: 'WeChat', type: 'wxpay' },
  ],
  amount_options: [10, 50, 100],
  discount: {},
  creem_products: [
    {
      name: 'Small Pack',
      productId: 'prod_1',
      price: 9.9,
      quota: 100000,
      currency: 'USD',
      fee_included: true,
    },
  ],
  waffo_pay_methods: [
    {
      name: 'Waffo Card',
      payMethodType: 'card',
      payMethodName: 'card',
      fee_rate_bps: 200,
    },
  ],
}

function statusData(sidebarModulesAdmin = '') {
  return {
    price: 7.3,
    user_agreement_enabled: true,
    SidebarModulesAdmin: sidebarModulesAdmin,
    quota_display_type: 'USD',
    quota_per_unit: 500000,
    usd_exchange_rate: 1,
  }
}

const walletSearchSchema = z.object({
  tab: z.enum(['topup', 'subscription', 'billing']).optional(),
  show_history: z.boolean().optional(),
})

async function renderPage(path = '/wallet') {
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

type PostHandler = (
  url: string,
  body: Record<string, unknown>
) => { data: unknown } | Promise<{ data: unknown }> | null | undefined

function mockApi(
  options: {
    topupInfo?: Record<string, unknown>
    plans?: unknown[]
    sidebarModulesAdmin?: string
    post?: PostHandler
  } = {}
) {
  const payloads: Record<string, unknown> = {
    '/api/user/topup/info': options.topupInfo ?? topupInfoData,
    '/api/user/self': userData,
    '/api/subscription/plans': options.plans ?? [],
    '/api/subscription/self': null,
    '/api/status': statusData(options.sidebarModulesAdmin),
    '/api/user/topup/self': { items: [], total: 0 },
    '/api/user/topup': { items: [], total: 0 },
    '/api/user/aff': 'AFFCODE',
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
    .mockImplementation(async (url: string, body?: unknown) => {
      const custom = await options.post?.(
        url,
        (body ?? {}) as Record<string, unknown>
      )
      if (custom) return custom
      if (url.endsWith('/amount')) {
        return { data: { success: true, data: '101.50', quote } }
      }
      if (url === '/api/user/creem/pay') {
        return {
          data: {
            success: true,
            data: { checkout_url: 'https://checkout.example.com/x' },
          },
        }
      }
      return {
        data: { success: true, url: 'https://pay.example.com', data: {} },
      }
    })
  return { getSpy, postSpy }
}

function confirmButton() {
  return screen.getByRole('button', { name: 'Confirm topup' })
}

async function clickMethod(name: RegExp | string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('defaults to the topup tab and keeps confirm disabled until a method is chosen', async () => {
  mockApi()
  await renderPage()

  await screen.findByRole('button', { name: /Alipay/ })
  expect(screen.getByText(/\$2/)).toBeInTheDocument()
  expect(screen.getByText('alice')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Waffo Card/ })).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Waffo Pancake/ })
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Creem/ })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Top Up' })).toBeInTheDocument()
  expect(
    screen.getByRole('tab', { name: 'Billing History' })
  ).toBeInTheDocument()

  expect(confirmButton()).toBeDisabled()
  expect(
    screen
      .getAllByText('Select a payment method')
      .some((el) => el.tagName === 'P')
  ).toBe(true)
})

it('renders the server quote strings verbatim after selecting a method', async () => {
  const { postSpy } = mockApi()
  await renderPage()
  await clickMethod(/Alipay/)

  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/user/amount',
      expect.objectContaining({ amount: 10, payment_method: 'alipay' }),
      expect.anything()
    )
  )
  const dl = (await screen.findByText('Credited')).closest('dl') as HTMLElement
  expect(dl).toHaveTextContent('¥100.00')
  expect(dl).toHaveTextContent('¥1.50')
  expect(dl).toHaveTextContent('¥101.50')
  expect(confirmButton()).toBeEnabled()
})

it('shows the included-in-price note instead of an added fee', async () => {
  mockApi({
    post: (url) =>
      url === '/api/user/amount'
        ? {
            data: {
              success: true,
              data: '101.50',
              quote: { ...quote, fee_included: true },
            },
          }
        : null,
  })
  await renderPage()
  await clickMethod(/Alipay/)

  expect(
    await screen.findByText('Service fee is already included in the price')
  ).toBeInTheDocument()
})

it('shows dashes when the quote payload has no quote object', async () => {
  mockApi({
    post: (url) =>
      url === '/api/user/amount'
        ? { data: { success: true, data: '101.50' } }
        : null,
  })
  await renderPage()
  await clickMethod(/Alipay/)

  await screen.findByText('Credited')
  await waitFor(() => {
    const dl = screen.getByText('Credited').closest('dl') as HTMLElement
    const dds = [...dl.querySelectorAll('dd')].map((d) => d.textContent)
    expect(dds).toEqual(['—', '—', '—'])
  })
})

it('keeps the newest quote when an older request resolves late', async () => {
  const resolvers = new Map<string, () => void>()
  mockApi({
    post: (url, body) => {
      if (url !== '/api/user/amount') return null
      const method = body.payment_method as string
      return new Promise((resolve) => {
        resolvers.set(method, () =>
          resolve({
            data: {
              success: true,
              data: '0',
              quote: {
                ...quote,
                fee: '0',
                total: method === 'wxpay' ? '202.20' : '111.11',
              },
            },
          })
        )
      })
    },
  })
  await renderPage()

  await clickMethod(/Alipay/)
  await clickMethod(/WeChat/)

  // The newest selection resolves first.
  resolvers.get('wxpay')?.()
  const dl = (await screen.findByText('Credited')).closest('dl') as HTMLElement
  await waitFor(() => expect(dl).toHaveTextContent('¥202.20'))

  // The earlier request resolving afterwards must not overwrite the details.
  resolvers.get('alipay')?.()
  await act(async () => {
    await Promise.resolve()
  })
  const currentDl = screen.getByText('Credited').closest('dl') as HTMLElement
  expect(currentDl).toHaveTextContent('¥202.20')
  expect(currentDl).not.toHaveTextContent('111.11')
})

it('switches to Creem products and submits the creem payment without a quote call', async () => {
  const { postSpy } = mockApi()
  await renderPage()

  await clickMethod(/Creem/)
  expect(
    screen.queryByRole('button', { name: /Enter a custom amount/ })
  ).not.toBeInTheDocument()

  const product = await screen.findByRole('button', { name: /Small Pack/ })
  expect(confirmButton()).toBeDisabled()
  expect(
    screen.getAllByText('Select a product').some((el) => el.tagName === 'P')
  ).toBe(true)

  const user = userEvent.setup()
  await user.click(product)
  const dl = (await screen.findByText('Credited')).closest('dl') as HTMLElement
  expect(dl).toHaveTextContent('$9.90')
  expect(dl).toHaveTextContent('Service fee is already included in the price')
  expect(confirmButton()).toBeEnabled()

  await user.click(confirmButton())
  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/user/creem/pay',
      expect.objectContaining({ product_id: 'prod_1' }),
      expect.anything()
    )
  )
  expect(postSpy).not.toHaveBeenCalledWith(
    '/api/user/amount',
    expect.anything(),
    expect.anything()
  )
})

it('sends the Waffo method index with its quote request', async () => {
  const { postSpy } = mockApi()
  await renderPage()

  await clickMethod(/Waffo Card/)
  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/user/waffo/amount',
      expect.objectContaining({ amount: 10, pay_method_index: 0 }),
      expect.anything()
    )
  )
})

it('disables confirm below the minimum and shows the reason', async () => {
  mockApi()
  const user = userEvent.setup()
  await renderPage()

  await clickMethod(/Alipay/)
  await user.click(
    await screen.findByRole('button', { name: /Enter a custom amount/ })
  )
  const input = screen.getByLabelText('Custom Amount')
  await user.clear(input)
  await user.type(input, '5')

  const hints = await screen.findAllByText('Minimum topup amount: 10')
  expect(hints.some((el) => el.className.includes('text-destructive'))).toBe(
    true
  )
  await waitFor(() => expect(confirmButton()).toBeDisabled())
})

it('disables confirm while a quote is being fetched', async () => {
  let resolveQuote: (() => void) | null = null
  mockApi({
    post: (url) =>
      url === '/api/user/amount'
        ? new Promise((resolve) => {
            resolveQuote = () =>
              resolve({ data: { success: true, data: '0', quote } })
          })
        : null,
  })
  await renderPage()

  await clickMethod(/Alipay/)
  await waitFor(() => expect(confirmButton()).toBeDisabled())
  expect(screen.getByText('Loading...')).toBeInTheDocument()

  resolveQuote?.()
  await waitFor(() => expect(confirmButton()).toBeEnabled())
})

it('redirects the legacy show_history flag to the billing tab', async () => {
  mockApi()
  const router = await renderPage('/wallet?show_history=true')

  await waitFor(() =>
    expect(router.state.location.search).toEqual({ tab: 'billing' })
  )
  expect(
    await screen.findByPlaceholderText('Search by order number...')
  ).toBeInTheDocument()
})

it('hides the subscription tab when no plans are enabled', async () => {
  mockApi({ plans: [] })
  await renderPage()

  await screen.findByRole('button', { name: /Alipay/ })
  await waitFor(() =>
    expect(
      screen.queryByRole('tab', { name: 'Subscription Plans' })
    ).not.toBeInTheDocument()
  )
})

it('shows the subscription tab when plans exist', async () => {
  mockApi({ plans: [{ id: 1, name: 'Pro' }] })
  const router = await renderPage('/wallet?tab=subscription')
  expect(
    await screen.findByRole('tab', { name: 'Subscription Plans' })
  ).toBeInTheDocument()
  expect(router.state.location.search).toEqual({ tab: 'subscription' })
})

it('falls back to topup when subscription is requested without plans', async () => {
  mockApi({ plans: [] })
  const router = await renderPage('/wallet?tab=subscription')
  await waitFor(() => expect(router.state.location.search).toEqual({}))
})

it('hides the redemption section unless the admin enables the module', async () => {
  mockApi()
  await renderPage()
  await screen.findByRole('button', { name: /Alipay/ })
  expect(screen.queryByText('Have a Code?')).not.toBeInTheDocument()
})

it('shows the redemption section when the admin module is enabled', async () => {
  mockApi({
    sidebarModulesAdmin: '{"admin":{"enabled":true,"redemption":true}}',
  })
  await renderPage()
  expect(await screen.findByText('Have a Code?')).toBeInTheDocument()
})

it('shows the empty state when no online method is enabled', async () => {
  mockApi({
    topupInfo: {
      ...topupInfoData,
      enable_online_topup: false,
      enable_stripe_topup: false,
      enable_creem_topup: false,
      enable_waffo_topup: false,
      enable_waffo_pancake_topup: false,
      pay_methods: [],
      creem_products: [],
      waffo_pay_methods: [],
    },
  })
  await renderPage()

  expect(
    await screen.findByText('Online topup is not enabled')
  ).toBeInTheDocument()
  expect(confirmButton()).toBeDisabled()
})

it('shows the agreement link when the user agreement is enabled', async () => {
  mockApi()
  await renderPage()

  await screen.findByRole('button', { name: /Alipay/ })
  const link = await screen.findByRole('link', { name: 'User Agreement' })
  expect(link).toHaveAttribute('href', '/user-agreement')
})
