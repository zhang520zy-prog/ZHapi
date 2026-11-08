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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { notifyManager } from '@tanstack/query-core'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { InvoicePage } from '../index'

const invoiceOptions = {
  enabled: true,
  min_cny: '1.00',
  max_cny: '1000000.00',
  types: [
    { key: 'normal_fast', rate_bps: 1100 },
    { key: 'normal', rate_bps: 1000 },
    { key: 'vat', rate_bps: 1600 },
  ],
}

async function renderInvoicePage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/invoice',
        component: InvoicePage,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/invoice'] }),
  })
  await act(async () => {
    await router.load()
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  notifyManager.setScheduler(queueMicrotask)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url === '/api/user/invoices/options') {
      return Promise.resolve({ data: { success: true, data: invoiceOptions } })
    }
    return Promise.resolve({
      data: { success: true, data: { items: [], total: 0 } },
    })
  })
  useAuthStore.getState().auth.reset('complete')
  useAuthStore.setState((s) => ({
    auth: {
      ...s.auth,
      user: { id: 1, username: 'u', email: 'u@x.com', quota: 5000000, role: 1 },
    },
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  useAuthStore.getState().auth.reset('idle')
})

it('opens the apply dialog when clicking Apply for invoice', async () => {
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  const button = screen.getByRole('button', { name: /Apply for invoice/ })
  await act(async () => {
    fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByLabelText(/Buyer name/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Receiving email/)).toBeInTheDocument()
})
