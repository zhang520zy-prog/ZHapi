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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AgreementConfirmDialog } from '../agreement-confirm-dialog'

const AGREEMENT_DOC = '# Terms\n\n1. Be nice.\n'

function mockApi(options: { version?: number; acceptFails?: boolean }) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url) === '/api/status') {
      return {
        data: {
          success: true,
          data: { user_agreement_version: options.version ?? 0 },
        },
      }
    }
    if (String(url) === '/api/user-agreement') {
      return { data: { success: true, data: AGREEMENT_DOC } }
    }
    throw new Error(`unexpected GET ${String(url)}`)
  })
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (String(url) === '/api/user/agreement/accept') {
      if (options.acceptFails) throw new Error('offline')
      return { data: { success: true, data: { agreement_version: 2 } } }
    }
    if (String(url) === '/api/user/auth/logout') {
      return { data: { success: true } }
    }
    throw new Error(`unexpected POST ${String(url)}`)
  })
  return post
}

async function renderDialog(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: AgreementConfirmDialog,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/sign-in',
        component: () => <div>sign in page</div>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return queryClient
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

it('stays hidden when the current agreement version is 0', async () => {
  mockApi({ version: 0 })
  await renderDialog()
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/status'))
  expect(
    screen.queryByRole('dialog', { name: 'User agreement updated' })
  ).not.toBeInTheDocument()
  expect(api.get).not.toHaveBeenCalledWith(
    '/api/user-agreement',
    expect.anything()
  )
})

it('stays hidden for a newly registered user already on the current version', async () => {
  mockApi({ version: 2 })
  useAuthStore.getState().auth.setUser({
    id: 2,
    username: 'fresh',
    role: 1,
    agreement_version: 2,
  })
  await renderDialog()
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/status'))
  expect(
    screen.queryByRole('dialog', { name: 'User agreement updated' })
  ).not.toBeInTheDocument()
})

it('shows the agreement to an existing user after a version bump and closes on accept', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'account',
    role: 1,
    agreement_version: 1,
  })
  const post = mockApi({ version: 2 })
  await renderDialog()
  const dialog = await screen.findByRole('dialog', {
    name: 'User agreement updated',
  })
  expect(await within(dialog).findByText('Be nice.')).toBeVisible()
  expect(
    within(dialog).queryByRole('button', { name: 'Close' })
  ).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(
    within(dialog).getByRole('button', { name: 'Agree and continue' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/agreement/accept', {
      version: 2,
    })
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'User agreement updated' })
    ).not.toBeInTheDocument()
  )
  expect(useAuthStore.getState().auth.user?.agreement_version).toBe(2)
})

it('keeps the dialog open on failure, allows retry and never removes log out', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'account',
    role: 1,
    agreement_version: 1,
  })
  const post = mockApi({ version: 2, acceptFails: true })
  await renderDialog()
  const dialog = await screen.findByRole('dialog', {
    name: 'User agreement updated',
  })
  const user = userEvent.setup()
  await user.click(
    within(dialog).getByRole('button', { name: 'Agree and continue' })
  )
  expect(
    await within(dialog).findByText(
      'Failed to confirm the user agreement. Check your connection and try again.'
    )
  ).toBeVisible()
  expect(
    within(dialog).getByRole('button', { name: 'Agree and continue' })
  ).toBeEnabled()
  expect(within(dialog).getByRole('button', { name: 'Log out' })).toBeEnabled()
  expect(post).toHaveBeenCalledWith('/api/user/agreement/accept', {
    version: 2,
  })
})

it('logs out and navigates to sign-in when the user declines', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'account',
    role: 1,
    agreement_version: 1,
  })
  const post = mockApi({ version: 2 })
  await renderDialog()
  const dialog = await screen.findByRole('dialog', {
    name: 'User agreement updated',
  })
  const user = userEvent.setup()
  await user.click(within(dialog).getByRole('button', { name: 'Log out' }))
  expect(post).toHaveBeenCalledWith('/api/user/auth/logout', undefined, {
    headers: undefined,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  expect(await screen.findByText('sign in page')).toBeVisible()
  expect(
    screen.queryByRole('dialog', { name: 'User agreement updated' })
  ).not.toBeInTheDocument()
})
