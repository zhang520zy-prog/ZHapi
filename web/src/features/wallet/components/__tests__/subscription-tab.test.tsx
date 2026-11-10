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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'

import { SubscriptionTab } from '../subscription-tab'

const plan = {
  id: 1,
  title: 'Pro Plan',
  subtitle: 'For pros',
  price_amount: 29.9,
  currency: 'CNY',
  duration_unit: 'month',
  duration_value: 1,
  quota_reset_period: 'monthly',
  enabled: true,
  sort_order: 0,
  allow_balance_pay: true,
  allow_wallet_overflow: true,
  max_purchase_per_user: 0,
  total_amount: 1000000,
  upgrade_group: 'pro',
  stripe_price_id: 'price_1',
  creem_product_id: 'creem_1',
  waffo_pancake_product_id: 'wp_1',
}

const activeSub = {
  subscription: {
    id: 9,
    user_id: 7,
    plan_id: 1,
    status: 'active',
    start_time: 1700000000,
    end_time: 4102444800,
    amount_total: 1000000,
    amount_used: 250000,
    next_reset_time: 1893456000,
  },
}

const selfData = {
  billing_preference: 'subscription_first',
  subscriptions: [activeSub],
  all_subscriptions: [activeSub],
}

const topupInfo = {
  enable_online_topup: true,
  enable_waffo_pancake_topup: true,
  waffo_pancake_fee_rate_bps: 150,
  pay_methods: [
    { name: 'Alipay', type: 'alipay', fee_rate_bps: 300 },
    { name: 'WeChat', type: 'wxpay', fee_rate_bps: 60 },
  ],
}

const balanceQuote = {
  credited_money: '29.90',
  fee_rate_bps: 0,
  fee: '0.00',
  total: '29.90',
  currency: 'CNY',
  fee_included: false,
}

type PostHandler = (
  url: string,
  body: Record<string, unknown>
) => { data: unknown } | Promise<{ data: unknown }> | null | undefined

function mockApi(
  options: {
    plans?: unknown[]
    self?: Record<string, unknown>
    post?: PostHandler
  } = {}
) {
  const payloads: Record<string, unknown> = {
    '/api/subscription/plans': options.plans ?? [{ plan }],
    '/api/subscription/self': options.self ?? selfData,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
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
      if (url === '/api/subscription/quote') {
        return {
          data: {
            success: true,
            data: '29.90',
            quote: balanceQuote,
            quota: 2047946,
          },
        }
      }
      return { data: { success: true, message: 'success', data: {} } }
    })
  return { postSpy }
}

async function renderTab(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SubscriptionTab topupInfo={topupInfo as never} {...props} />
    </QueryClientProvider>
  )
  await screen.findByText('Pro Plan')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('renders the active subscription card and plans with CNY prices', async () => {
  mockApi()
  await renderTab()

  // Active subscription card shows plan name, expiry, progress and reset.
  expect(screen.getByText(/Pro Plan · Subscription #9/)).toBeInTheDocument()
  expect(screen.getByText(/Until/)).toBeInTheDocument()
  expect(screen.getByText(/Next reset/)).toBeInTheDocument()

  // Plan card shows the CNY price verbatim, quota, group and CTA.
  expect(screen.getByText('¥29.90')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Subscribe Now' })
  ).toBeInTheDocument()

  // No fake "recommended" badge.
  expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
})

it('opens the purchase dialog without Creem or Stripe', async () => {
  const { postSpy } = mockApi()
  const user = userEvent.setup()
  await renderTab()

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))

  expect(
    await screen.findByRole('button', { name: /Pay with Balance/ })
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Alipay/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /WeChat/ })).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Waffo Pancake/ })
  ).toBeInTheDocument()
  expect(screen.queryByText('Creem')).not.toBeInTheDocument()
  expect(screen.queryByText('Stripe')).not.toBeInTheDocument()

  // The default selection quotes the balance method.
  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/subscription/quote',
      expect.objectContaining({ plan_id: 1, payment_method: 'balance' })
    )
  )
})

it('shows the server quota and no-fee text for balance payment', async () => {
  mockApi()
  const user = userEvent.setup()
  await renderTab()

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  await screen.findByRole('button', { name: /Pay with Balance/ })

  const dl = (await screen.findByText('Credited')).closest('dl') as HTMLElement
  await waitFor(() => {
    expect(dl).toHaveTextContent('¥29.90')
    expect(dl).toHaveTextContent('No service fee')
    expect(dl).toHaveTextContent('Quota to deduct')
    expect(dl).toHaveTextContent(formatQuota(2047946))
    expect(dl).toHaveTextContent('Current Balance')
  })
})

it('sends epay:<method> and discards a stale balance quote', async () => {
  const resolvers = new Map<string, () => void>()
  const { postSpy } = mockApi({
    post: (url, body) => {
      if (url !== '/api/subscription/quote') return null
      const method = body.payment_method as string
      return new Promise((resolve) => {
        resolvers.set(method, () =>
          resolve({
            data: {
              success: true,
              data: '0',
              quota: 0,
              quote: {
                credited_money: '0.00',
                fee_rate_bps: 300,
                fee: method === 'epay:alipay' ? '0.90' : '0.00',
                total: method === 'epay:alipay' ? '30.80' : '29.90',
                currency: 'CNY',
                fee_included: false,
              },
            },
          })
        )
      })
    },
  })
  const user = userEvent.setup()
  await renderTab()

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  await screen.findByRole('button', { name: /Pay with Balance/ })
  await user.click(screen.getByRole('button', { name: /Alipay/ }))

  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/subscription/quote',
      expect.objectContaining({ payment_method: 'epay:alipay' })
    )
  )

  // Newest selection resolves first.
  resolvers.get('epay:alipay')?.()
  const dl = (await screen.findByText('Credited')).closest('dl') as HTMLElement
  await waitFor(() => expect(dl).toHaveTextContent('¥30.80'))

  // The stale balance response must not overwrite the epay quote.
  resolvers.get('balance')?.()
  await act(async () => {
    await Promise.resolve()
  })
  const currentDl = screen.getByText('Credited').closest('dl') as HTMLElement
  expect(currentDl).toHaveTextContent('¥30.80')
  expect(currentDl).not.toHaveTextContent('¥29.90')
})

it('blocks balance payment when the server quota exceeds the balance', async () => {
  mockApi({
    post: (url) => {
      if (url !== '/api/subscription/quote') return null
      return {
        data: {
          success: true,
          data: '29.90',
          quote: balanceQuote,
          quota: 99999999,
        },
      }
    },
  })
  const user = userEvent.setup()
  await renderTab({ userQuota: 100 })

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  await screen.findByRole('button', { name: /Pay with Balance/ })

  expect(await screen.findByText('Insufficient balance')).toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: 'Confirm Payment' })
  await waitFor(() => expect(confirm).toBeDisabled())
})

it('disables the subscribe button at the purchase limit', async () => {
  mockApi({
    plans: [{ plan: { ...plan, max_purchase_per_user: 1 } }],
  })
  await renderTab()

  const button = screen.getByRole('button', { name: 'Limit Reached' })
  expect(button).toBeDisabled()
  expect(screen.getByText('Purchased 1 / Limit 1')).toBeInTheDocument()
})

it('offers Stripe hosted checkout without a quote', async () => {
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  const { postSpy } = mockApi({
    post: (url) => {
      if (url === '/api/subscription/stripe/pay') {
        return {
          data: {
            message: 'success',
            data: { pay_link: 'https://checkout.stripe.com/cpay_1' },
          },
        }
      }
      return null
    },
  })
  const user = userEvent.setup()
  await renderTab({
    topupInfo: { ...topupInfo, enable_stripe_topup: true },
  })

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  const stripeCard = await screen.findByRole('button', { name: /Stripe/ })
  await user.click(stripeCard)

  // No quote request is issued for Stripe.
  await waitFor(() =>
    expect(stripeCard).toHaveAttribute('aria-pressed', 'true')
  )
  expect(postSpy).not.toHaveBeenCalledWith(
    '/api/subscription/quote',
    expect.objectContaining({ payment_method: 'stripe' })
  )
  expect(
    await screen.findByText('Final amount shown at checkout')
  ).toBeInTheDocument()

  const confirm = screen.getByRole('button', { name: 'Confirm Payment' })
  await waitFor(() => expect(confirm).toBeEnabled())
  await user.click(confirm)

  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/subscription/stripe/pay',
      expect.objectContaining({ plan_id: 1 })
    )
  )
  await waitFor(() =>
    expect(openSpy).toHaveBeenCalledWith(
      'https://checkout.stripe.com/cpay_1',
      '_blank'
    )
  )
})

it('rejects an unsafe Stripe pay_link', async () => {
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  mockApi({
    post: (url) => {
      if (url === '/api/subscription/stripe/pay') {
        return {
          data: {
            message: 'success',
            data: { pay_link: 'javascript:alert(1)' },
          },
        }
      }
      return null
    },
  })
  const user = userEvent.setup()
  await renderTab({
    topupInfo: { ...topupInfo, enable_stripe_topup: true },
  })

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  await user.click(await screen.findByRole('button', { name: /Stripe/ }))
  const confirm = screen.getByRole('button', { name: 'Confirm Payment' })
  await waitFor(() => expect(confirm).toBeEnabled())
  await user.click(confirm)

  await new Promise((r) => setTimeout(r, 50))
  expect(openSpy).not.toHaveBeenCalled()
})

it('completes a balance purchase and refreshes self data', async () => {
  const { postSpy } = mockApi()
  const onPurchaseSuccess = vi.fn()
  const user = userEvent.setup()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SubscriptionTab
        topupInfo={topupInfo as never}
        onPurchaseSuccess={onPurchaseSuccess}
      />
    </QueryClientProvider>
  )
  await screen.findByText('Pro Plan')

  await user.click(screen.getByRole('button', { name: 'Subscribe Now' }))
  await screen.findByRole('button', { name: /Pay with Balance/ })
  const confirm = await screen.findByRole('button', {
    name: 'Confirm Payment',
  })
  await waitFor(() => expect(confirm).toBeEnabled())
  await user.click(confirm)

  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/subscription/balance/pay',
      expect.objectContaining({ plan_id: 1 })
    )
  )
  await waitFor(() => expect(onPurchaseSuccess).toHaveBeenCalled())
})
