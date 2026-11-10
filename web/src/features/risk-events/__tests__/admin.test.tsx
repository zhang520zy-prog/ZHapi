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
  user_id: 7,
  model: 'chat-model',
  request_id: 'request-42',
  category: 'sensitive_keyword',
  category_name: 'Sensitive keyword',
  action: 'restrict',
  restriction_until: 2000000000,
  created_at: 1788600600,
  review_status: 'pending',
  reviewed_at: 0,
  version: 3,
  level: 1,
  stage: 'input',
}
const categories = [
  {
    id: 1,
    key: 'general',
    name: 'General',
    action: 'block',
    word_count: 12,
    status: 1,
    version: 4,
    updated_at: 1788600000,
    updated_by: 1,
  },
  {
    id: 2,
    key: 'test_category',
    name: 'Test category',
    action: 'block_restrict',
    word_count: 3,
    status: 2,
    version: 2,
    updated_at: 1788600000,
    updated_by: 1,
  },
]
const userState = {
  level: 1,
  hits: 2,
  restricted_until: 2000000000,
  disabled: false,
  category_hits: { general: 2 },
}
const systemOptions = {
  success: true,
  data: [
    { key: 'CheckSensitiveEnabled', value: 'true' },
    { key: 'CheckSensitiveOnPromptEnabled', value: 'true' },
    { key: 'CheckSensitiveOnCompletionEnabled', value: 'true' },
    { key: 'risk_setting.hit_threshold', value: '3' },
    { key: 'risk_setting.level_durations_seconds', value: '[600,3600,86400]' },
    { key: 'risk_setting.notify_levels', value: '[3,4]' },
  ],
}

function setUser(permissions: Record<string, boolean> | undefined, role = 10) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'admin',
    role,
    permissions: permissions
      ? { admin_permissions: { risk: permissions } }
      : undefined,
  } as never)
}

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
  const layout = createRoute({
    getParentRoute: () => authenticated,
    path: 'risk-events',
  })
  const index = createRoute({
    getParentRoute: () => layout,
    path: '/',
    validateSearch: riskEventsSearchSchema,
    component: RiskEvents,
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

function mockApi(overrides: Record<string, unknown> = {}) {
  const payloads: Record<string, unknown> = {
    '/api/risk/': { items: [event], total: 1 },
    '/api/risk/categories': categories,
    '/api/risk/users/7/state': userState,
    '/api/risk/risk-42': { event, appeals: [], changes: [] },
    '/api/option/': systemOptions.data,
    ...overrides,
  }
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    const hit = Object.entries(payloads)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([prefix]) => url.startsWith(prefix))
    if (hit?.[0] === '/api/option/') {
      return { data: { success: true, data: systemOptions.data } }
    }
    return {
      data: { success: true, data: hit?.[1] ?? { items: [], total: 0 } },
    }
  })
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

it('shows events and word library tabs but not settings for read-only', async () => {
  setUser({ read: true })
  mockApi()
  await renderPage()
  await screen.findByText('chat-model')
  expect(screen.getByRole('tab', { name: 'Risk events' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Word library' })).toBeInTheDocument()
  expect(
    screen.queryByRole('tab', { name: 'Risk settings' })
  ).not.toBeInTheDocument()
})

it('renders the word library read-only without manage permission', async () => {
  setUser({ read: true })
  mockApi()
  await renderPage('/risk-events?tab=words')
  await screen.findByText('General')
  expect(screen.getByText('Test category')).toBeInTheDocument()
  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(screen.getByText('Disabled')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'New category' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Import' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Export' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Delete' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})

it('shows the word library tab for risk.manage and settings for root', async () => {
  setUser({ read: true, manage: true })
  mockApi()
  await renderPage()
  await screen.findByText('chat-model')
  expect(screen.getByRole('tab', { name: 'Word library' })).toBeInTheDocument()
  expect(
    screen.queryByRole('tab', { name: 'Risk settings' })
  ).not.toBeInTheDocument()
})

it('redirects an unauthorized words URL back to events', async () => {
  setUser(undefined)
  mockApi()
  const router = await renderPage('/risk-events?tab=words')
  await screen.findByText('chat-model')
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ tab: 'events' })
  )
})

it('renders admin columns and the auto marker on events', async () => {
  setUser({ read: true, review: true })
  mockApi()
  await renderPage()
  await screen.findByText('chat-model')
  expect(
    screen.getByRole('columnheader', { name: 'Level' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Stage' })
  ).toBeInTheDocument()
  expect(screen.getByText('Auto')).toBeInTheDocument()
  expect(screen.getByText('Input')).toBeInTheDocument()
})

it('requires a reason and second confirmation for review actions', async () => {
  setUser({ read: true, review: true })
  mockApi()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: event } })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  await within(dialog).findByText('User risk state')
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm violation' })
  )
  expect(
    await within(dialog).findByText(
      'Enter a reason between 1 and 1000 characters.'
    )
  ).toBeInTheDocument()
  expect(post).not.toHaveBeenCalledWith(
    '/api/risk/risk-42/review',
    expect.anything()
  )
  await user.type(within(dialog).getByLabelText('Review reason'), 'confirmed')
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm violation' })
  )
  const confirm = await screen.findByRole('alertdialog')
  expect(within(confirm).getByText(/user 7/)).toBeInTheDocument()
  await user.click(
    within(confirm).getByRole('button', { name: 'Confirm violation' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/risk/risk-42/review',
      expect.objectContaining({ status: 'confirmed', reason: 'confirmed' })
    )
  )
})

it('revokes a restriction with reason and confirmation', async () => {
  setUser({ read: true, review: true })
  mockApi()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  const revoke = await within(dialog).findByRole('button', {
    name: 'Revoke restriction',
  })
  await user.click(revoke)
  expect(
    await within(dialog).findByText(
      'Enter a reason between 1 and 1000 characters.'
    )
  ).toBeInTheDocument()
  const reasonBox = within(dialog).getByLabelText('Reason')
  await user.type(reasonBox, 'false alarm')
  await user.click(
    within(dialog).getByRole('button', { name: 'Revoke restriction' })
  )
  const confirm = await screen.findByRole('alertdialog')
  expect(within(confirm).getByText(/user 7/)).toBeInTheDocument()
  await user.click(
    within(confirm).getByRole('button', { name: 'Revoke restriction' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/risk/users/7/restriction/revoke', {
      reason: 'false alarm',
    })
  )
})

it('refreshes detail data after a 409 conflict', async () => {
  setUser({ read: true, review: true })
  const get = mockApi()
  vi.spyOn(api, 'post').mockRejectedValue({
    isAxiosError: true,
    response: { status: 409 },
  })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  await within(dialog).findByText('User risk state')
  await user.type(within(dialog).getByLabelText('Review reason'), 'retry')
  await user.click(
    within(dialog).getByRole('button', { name: 'Mark false positive' })
  )
  const confirm = await screen.findByRole('alertdialog')
  await user.click(
    within(confirm).getByRole('button', { name: 'Mark false positive' })
  )
  await waitFor(() => {
    const detailCalls = get.mock.calls.filter(([url]) =>
      String(url).includes('/api/risk/risk-42')
    )
    expect(detailCalls.length).toBeGreaterThanOrEqual(2)
  })
})

it('lists categories without a delete button for general', async () => {
  setUser({ read: true, manage: true })
  mockApi()
  await renderPage('/risk-events?tab=words')
  const generalRow = (await screen.findByText('General')).closest(
    'tr'
  ) as HTMLElement
  expect(within(generalRow).getByText('12')).toBeInTheDocument()
  expect(
    within(generalRow).queryByRole('button', { name: 'Delete' })
  ).not.toBeInTheDocument()
  const testRow = screen.getByText('Test category').closest('tr') as HTMLElement
  expect(
    within(testRow).getByRole('button', { name: 'Delete' })
  ).toBeInTheDocument()
})

it('downloads the export through the blob endpoint without rendering words', async () => {
  setUser({ read: true, manage: true })
  mockApi()
  const createUrl = vi.fn(() => 'blob:mock')
  const revokeUrl = vi.fn()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createUrl,
    revokeObjectURL: revokeUrl,
  })
  await renderPage('/risk-events?tab=words')
  const row = (await screen.findByText('Test category')).closest(
    'tr'
  ) as HTMLElement
  const user = userEvent.setup()
  await user.click(within(row).getByRole('button', { name: 'Export' }))
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/api/risk/categories/2/export', {
      responseType: 'blob',
    })
  )
  await waitFor(() => expect(createUrl).toHaveBeenCalled())
})

it('re-enables a disabled account with reason and confirmation', async () => {
  setUser({ read: true, review: true })
  mockApi({
    '/api/risk/users/7/state': {
      level: 4,
      hits: 9,
      restricted_until: 0,
      disabled: true,
      category_hits: { general: 9 },
    },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  await renderPage()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Details' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Risk event details',
  })
  const reenable = await within(dialog).findByRole('button', {
    name: 'Re-enable account',
  })
  await user.click(reenable)
  expect(
    await within(dialog).findByText(
      'Enter a reason between 1 and 1000 characters.'
    )
  ).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('Reason'), 'mistaken disable')
  await user.click(
    within(dialog).getByRole('button', { name: 'Re-enable account' })
  )
  const confirm = await screen.findByRole('alertdialog')
  expect(within(confirm).getByText(/user 7/)).toBeInTheDocument()
  await user.click(
    within(confirm).getByRole('button', { name: 'Re-enable account' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/risk/users/7/reenable', {
      reason: 'mistaken disable',
    })
  )
})

it('blocks oversized import files before any request', async () => {
  setUser({ read: true, manage: true })
  mockApi()
  const post = vi.spyOn(api, 'post')
  await renderPage('/risk-events?tab=words')
  const row = (await screen.findByText('Test category')).closest(
    'tr'
  ) as HTMLElement
  const user = userEvent.setup()
  await user.click(within(row).getByRole('button', { name: 'Import' }))
  const dialog = await screen.findByRole('dialog')
  const input = dialog.querySelector('input[type="file"]') as HTMLElement
  const big = new File(['x'.repeat(3 * 1024 * 1024)], 'big.txt', {
    type: 'text/plain',
  })
  await user.upload(input as HTMLElement, big)
  expect(
    await within(dialog).findByText('The file exceeds the 2 MB limit.')
  ).toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
})

it('shows only counts in the import preview and double-confirms replace', async () => {
  setUser({ read: true, manage: true })
  mockApi()
  const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
    if (url.endsWith('import/preview')) {
      return {
        data: {
          success: true,
          data: {
            total: 4,
            added: 3,
            duplicate: 1,
            invalid: 0,
            preview_id: 'p1',
          },
        },
      }
    }
    return {
      data: { success: true, data: { added: 3, duplicate: 1, invalid: 0 } },
    }
  })
  await renderPage('/risk-events?tab=words')
  const row = (await screen.findByText('Test category')).closest(
    'tr'
  ) as HTMLElement
  const user = userEvent.setup()
  await user.click(within(row).getByRole('button', { name: 'Import' }))
  const dialog = await screen.findByRole('dialog')
  const input = dialog.querySelector('input[type="file"]') as HTMLElement
  const file = new File(['rd-test-word-1\nrd-test-word-2'], 'words.txt', {
    type: 'text/plain',
  })
  await user.upload(input as HTMLElement, file)
  expect(await within(dialog).findByText('New words')).toBeInTheDocument()
  expect(within(dialog).getByText('3')).toBeInTheDocument()
  expect(within(dialog).queryByText('rd-test-word-1')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('radio', { name: /Replace:/ }))
  await user.click(
    within(dialog).getByRole('button', { name: 'Replace words' })
  )
  const confirm = await screen.findByRole('alertdialog')
  expect(within(confirm).getByText('Replace all words?')).toBeInTheDocument()
  await user.click(
    within(confirm).getByRole('button', { name: 'Replace words' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/risk/categories/2/import/commit',
      expect.objectContaining({
        preview_id: 'p1',
        mode: 'replace',
        expected_version: 2,
      })
    )
  )
})

it('rejects non-increasing durations and only submits changed keys', async () => {
  setUser(undefined, 100)
  mockApi()
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  await renderPage('/risk-events?tab=settings')
  const user = userEvent.setup()
  // 把第 2 级改小，破坏递增
  const levelInputs = await screen.findAllByRole('spinbutton')
  // threshold + three windows + three duration slots；最后一组是三个时长槽
  const durationInputs = levelInputs.slice(-3)
  // 第 1 级调成 120 分钟（7200 秒）> 第 2 级 3600 秒，破坏递增
  await user.clear(durationInputs[0])
  await user.type(durationInputs[0], '120')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(
    await screen.findByText('Durations must be strictly increasing.')
  ).toBeInTheDocument()
  expect(put).not.toHaveBeenCalled()
  // 恢复 10 分钟回到基线，然后只改命中阈值
  await user.clear(durationInputs[0])
  await user.type(durationInputs[0], '10')
  const threshold = screen.getByLabelText('Hit threshold')
  await user.clear(threshold)
  await user.type(threshold, '5')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'risk_setting.hit_threshold',
      value: '5',
    })
  )
  expect(put).toHaveBeenCalledTimes(1)
})
