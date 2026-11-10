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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { RiskEvents } from '..'

const event = {
  event_id: 'risk-42',
  model: 'chat-model',
  request_id: 'request-42',
  category: 'sensitive_keyword',
  category_name: 'Sensitive keyword',
  action: 'block',
  created_at: 1788600600,
  review_status: 'pending',
  reviewed_at: 0,
  version: 3,
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
const riskEventsSearchSchema = z.object({
  tab: z.enum(['events', 'words', 'settings']).optional().catch(undefined),
})

async function renderPage(path = '/risk-events') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  const riskEventsLayout = createRoute({
    getParentRoute: () => authenticated,
    path: 'risk-events',
  })
  const index = createRoute({
    getParentRoute: () => riskEventsLayout,
    path: '/',
    validateSearch: riskEventsSearchSchema,
    component: RiskEvents,
  })
  const router = createRouter({
    routeTree: root.addChildren([
      authenticated.addChildren([riskEventsLayout.addChildren([index])]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return client
}
function mockRecords() {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: String(url).endsWith('risk-42')
        ? { event, appeals: [], changes: [] }
        : { items: [event], total: 1 },
    },
  }))
}
it('ordinary users see only their risk records and can appeal without submitting conversation content', async () => {
  const get = mockRecords()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { id: 1 } } })
  await renderPage()
  await screen.findByText('chat-model')
  expect(get).toHaveBeenCalledWith('/api/risk/self', expect.anything())
  expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  expect(await within(dialog).findByText('request-42')).toBeVisible()
  expect(
    within(dialog).queryByRole('button', { name: 'Confirm violation' })
  ).not.toBeInTheDocument()
  await user.type(
    within(dialog).getByLabelText('Appeal reason'),
    'This was a legitimate technical question.'
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Submit appeal' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/risk/self/risk-42/appeals', {
      reason: 'This was a legitimate technical question.',
    })
  )
  expect(await within(dialog).findByText('Appeal submitted')).toBeVisible()
})
it('shows category name, action and appeal summary in list and detail', async () => {
  mockRecords()
  await renderPage()
  const row = await screen.findByText('chat-model')
  const rowEl = row.closest('tr') as HTMLElement
  expect(within(rowEl).getByText('Sensitive keyword')).toBeVisible()
  expect(within(rowEl).getByText('Blocked')).toBeVisible()
  await userEvent.click(within(rowEl).getByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  expect(await within(dialog).findByText('Not appealed')).toBeVisible()
  expect(within(dialog).getByText('Sensitive keyword')).toBeVisible()
  expect(within(dialog).getByText('Blocked')).toBeVisible()
})
it('a pending appeal disables further appeals in the detail dialog', async () => {
  const pendingAppeal = {
    id: 7,
    reason: 'Please review',
    created_at: 1788600601,
    status: 'pending',
    outcome: '',
    version: 1,
  }
  const rejectedAppeal = {
    id: 3,
    reason: 'Earlier attempt',
    created_at: 1788600500,
    status: 'resolved',
    outcome: 'confirmed',
    version: 1,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: String(url).endsWith('risk-42')
        ? { event, appeals: [pendingAppeal, rejectedAppeal], changes: [] }
        : { items: [event], total: 1 },
    },
  }))
  await renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  expect(await within(dialog).findByText('Appeal in progress')).toBeVisible()
  expect(
    await within(dialog).findByText('Your appeal is already being processed.')
  ).toBeVisible()
  expect(
    within(dialog).queryByLabelText('Appeal reason')
  ).not.toBeInTheDocument()
})
it('uses the newest appeal when a rejected one follows a pending entry', async () => {
  const rejectedAppeal = {
    id: 9,
    reason: 'Latest attempt',
    created_at: 1788600700,
    status: 'resolved',
    outcome: 'confirmed',
    version: 1,
  }
  const stalePendingAppeal = {
    id: 4,
    reason: 'Older attempt',
    created_at: 1788600500,
    status: 'pending',
    outcome: '',
    version: 1,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: String(url).endsWith('risk-42')
        ? { event, appeals: [rejectedAppeal, stalePendingAppeal], changes: [] }
        : { items: [event], total: 1 },
    },
  }))
  await renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  expect(await within(dialog).findByText('Appeal rejected')).toBeVisible()
  expect(within(dialog).getByLabelText('Appeal reason')).toBeInTheDocument()
})
it('review permission allows a versioned decision with a required reason', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'reviewer',
    role: 10,
    permissions: {
      admin_permissions: { risk: { read: true, review: true } },
    },
  })
  const get = mockRecords()
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: { ...event, review_status: 'false_positive', version: 4 },
    },
  })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  expect(get).toHaveBeenCalledWith('/api/risk/', expect.anything())
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  await within(dialog).findByLabelText('Review reason')
  await user.click(
    within(dialog).getByRole('button', { name: 'Mark false positive' })
  )
  expect(post).not.toHaveBeenCalled()
  await user.type(
    within(dialog).getByLabelText('Review reason'),
    'Allowed business context confirmed.'
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Mark false positive' })
  )
  const confirm = await screen.findByRole('alertdialog')
  await user.click(
    within(confirm).getByRole('button', { name: 'Mark false positive' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/risk/risk-42/review', {
      expected_version: 3,
      status: 'false_positive',
      reason: 'Allowed business context confirmed.',
    })
  )
  expect(await within(dialog).findByText('Review saved')).toBeVisible()
})
it('a read-only operator can view events but cannot review them', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'viewer',
    role: 10,
    permissions: {
      admin_permissions: { risk: { read: true, review: false } },
    },
  })
  mockRecords()
  await renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  await within(dialog).findByText('request-42')
  expect(
    within(dialog).queryByLabelText('Review reason')
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByLabelText('Appeal reason')
  ).not.toBeInTheDocument()
})
it('a timed restriction requires confirmation and sends its duration with the versioned review', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'reviewer',
    role: 10,
    permissions: {
      admin_permissions: { risk: { read: true, review: true } },
    },
  })
  mockRecords()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: event } })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  await user.type(
    await within(dialog).findByLabelText('Review reason'),
    'Confirmed misuse; temporary restriction.'
  )
  expect(
    within(dialog).getByRole('combobox', { name: 'Restriction duration' })
  ).toHaveTextContent('No restriction')
  await user.click(
    within(dialog).getByRole('combobox', { name: 'Restriction duration' })
  )
  await user.click(await screen.findByRole('option', { name: '1 hour' }))
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm violation' })
  )
  const confirmation = await screen.findByRole('alertdialog', {
    name: 'Restrict API access?',
  })
  expect(post).not.toHaveBeenCalled()
  await user.click(
    within(confirmation).getByRole('button', { name: 'Apply restriction' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/risk/risk-42/review', {
      expected_version: 3,
      status: 'confirmed',
      reason: 'Confirmed misuse; temporary restriction.',
      restriction_seconds: 3600,
    })
  )
})
it('a failed list request shows an error and retry instead of an empty success state', async () => {
  vi.spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      data: { success: true, data: { items: [], total: 0 } },
    })
  await renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to load risk events'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No risk events')).toBeVisible()
})
