import { notifyManager } from '@tanstack/query-core'
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
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { InvoicePage } from '../index'

const invoiceOptions = {
  enabled: true,
  min_cny: '1.00',
  max_cny: '1000000.00',
  received_cny: '5000.00',
  invoiced_cny: '1200.50',
  invoiceable_cny: '3800.00',
  types: [
    { key: 'normal_fast', rate_bps: 1100 },
    { key: 'normal', rate_bps: 1000 },
    { key: 'vat', rate_bps: 1600 },
  ],
}

let optionsFixture: Record<string, unknown> = invoiceOptions
let invoiceListFixture: { items: unknown[]; total: number } = {
  items: [],
  total: 0,
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
  optionsFixture = invoiceOptions
  invoiceListFixture = { items: [], total: 0 }
  vi.useFakeTimers()
  notifyManager.setScheduler(queueMicrotask)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url === '/api/user/invoices/options') {
      return Promise.resolve({ data: { success: true, data: optionsFixture } })
    }
    return Promise.resolve({
      data: { success: true, data: invoiceListFixture },
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

it('renders the three quota metric values from server strings', async () => {
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(screen.getByText('Received (CNY)')).toBeInTheDocument()
  expect(screen.getByText('¥5000.00')).toBeInTheDocument()
  expect(screen.getByText('Invoiced (incl. processing)')).toBeInTheDocument()
  expect(screen.getByText('¥1200.50')).toBeInTheDocument()
  expect(screen.getByText('Invoiceable')).toBeInTheDocument()
  expect(screen.getByText('¥3800.00')).toBeInTheDocument()
})

it('disables the apply button and shows a notice when invoiceable is zero', async () => {
  optionsFixture = { ...invoiceOptions, invoiceable_cny: '0.00' }
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(
    screen.getByText('No invoiceable amount available')
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Apply for invoice/ })
  ).toBeDisabled()
})

it('caps the dialog amount range at the smaller of max and invoiceable', async () => {
  optionsFixture = {
    ...invoiceOptions,
    max_cny: '1000000.00',
    invoiceable_cny: '200.00',
  }
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Apply for invoice/ }))
    await vi.advanceTimersByTimeAsync(0)
  })
  // Allowed range shows the invoiceable cap, not the configured max.
  const range = screen.getByText(/Amount range/)
  expect(range).toHaveTextContent('¥1.00 – ¥200.00')
  expect(range).not.toHaveTextContent('1000000')

  // Over-cap amount is rejected client-side against the invoiceable bound.
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Invoice amount/), {
      target: { value: '300.00' },
    })
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByText('Amount is out of range')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Review & submit' })).toBeDisabled()
})

it('does not render unsafe invoice file URLs as links', async () => {
  invoiceListFixture = {
    total: 1,
    items: [
      {
        id: 5,
        user_id: 1,
        buyer_name: 'Acme',
        tax_no: '',
        amount_cny: '100.00',
        fee_rate_bps: 50,
        fee_cny: '0.50',
        invoice_type: 'normal',
        category: '',
        item: 'Technical service fee',
        email: 'u@x.com',
        details: '',
        status: 'issued',
        review_note: '',
        file_url: 'javascript:alert(1)',
        version: 1,
        created_at: 1730000000,
        updated_at: 1730000000,
      },
    ],
  }
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(screen.getByText('Invoice file link is invalid')).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Download' })
  ).not.toBeInTheDocument()
  // 50 bps renders as a fractional rate, not rounded to 0.
  expect(screen.getByText(/0\.5%/)).toBeInTheDocument()
})

it('renders a valid download link for http invoice files', async () => {
  invoiceListFixture = {
    total: 1,
    items: [
      {
        id: 6,
        user_id: 1,
        buyer_name: 'Acme',
        tax_no: '',
        amount_cny: '100.00',
        fee_rate_bps: 100,
        fee_cny: '1.00',
        invoice_type: 'normal',
        category: '',
        item: 'Technical service fee',
        email: 'u@x.com',
        details: '',
        status: 'issued',
        review_note: '',
        file_url: 'https://files.example.com/inv-6.pdf',
        version: 1,
        created_at: 1730000000,
        updated_at: 1730000000,
      },
    ],
  }
  await renderInvoicePage()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  const link = screen.getByRole('link', { name: 'Download' })
  expect(link).toHaveAttribute('href', 'https://files.example.com/inv-6.pdf')
})
