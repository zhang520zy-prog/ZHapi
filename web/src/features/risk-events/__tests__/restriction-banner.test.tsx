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
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { emitRiskRestricted } from '@/lib/risk-restricted'
import { useAuthStore } from '@/stores/auth-store'

import { RiskRestrictionBanner } from '../components/restriction-banner'

const futureUntil = Math.floor(Date.now() / 1000) + 600

function mockState(data: {
  restricted_until: number
  event_id?: string
  category_name?: string
  disabled?: boolean
}) {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url) === '/api/risk/self/state') {
      return {
        data: {
          success: true,
          data: { level: 1, hits: 2, disabled: false, ...data },
        },
      }
    }
    return {
      data: {
        success: true,
        data: { event: { event_id: 'evt-1' }, appeals: [], changes: [] },
      },
    }
  })
}

async function renderBanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: RiskRestrictionBanner,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return client
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'account', role: 1 })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows the restriction reason, release time and actions while restricted', async () => {
  mockState({
    restricted_until: futureUntil,
    event_id: 'evt-1',
    category_name: 'Sensitive keyword',
  })
  await renderBanner()
  expect(
    await screen.findByText('Account API access is restricted')
  ).toBeVisible()
  expect(screen.getByText('Reason: Sensitive keyword')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'View risk events' })
  ).toHaveAttribute('href', '/risk-events')
  expect(
    screen.getByRole('button', { name: 'Submit appeal' })
  ).toBeInTheDocument()
})

it('shows the disabled banner without a countdown when the account is disabled', async () => {
  mockState({
    restricted_until: 0,
    disabled: true,
    event_id: 'evt-9',
    category_name: 'Abuse',
  })
  await renderBanner()
  expect(await screen.findByText('Account disabled')).toBeVisible()
  expect(
    screen.getByText(
      'API access is disabled for this account. You can view the risk events or submit an appeal.'
    )
  ).toBeVisible()
  expect(screen.getByText('Reason: Abuse')).toBeVisible()
  expect(screen.queryByText(/Expected release at/)).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'View risk events' })
  ).toBeInTheDocument()
})

it('hides when the account is not restricted', async () => {
  mockState({ restricted_until: 0 })
  const { container } = render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <RiskRestrictionBanner />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/api/risk/self/state')
  )
  expect(container).toBeEmptyDOMElement()
})

it('refreshes the state query when a request reports risk_restricted', async () => {
  const get = mockState({ restricted_until: futureUntil })
  await renderBanner()
  await screen.findByText('Account API access is restricted')
  const callsBefore = get.mock.calls.filter(
    (call) => String(call[0]) === '/api/risk/self/state'
  ).length
  emitRiskRestricted()
  await waitFor(() => {
    const calls = get.mock.calls.filter(
      (call) => String(call[0]) === '/api/risk/self/state'
    ).length
    expect(calls).toBeGreaterThan(callsBefore)
  })
})
