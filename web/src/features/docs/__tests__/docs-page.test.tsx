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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { Docs } from '..'

vi.mock('@/features/pricing/api', () => ({
  getPricing: vi.fn().mockResolvedValue({
    success: true,
    data: [{ model_name: 'gpt-4o-mini' }, { model_name: 'claude-sonnet-4' }],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...mod,
    getUserModels: vi.fn().mockResolvedValue({
      success: true,
      data: ['user-only-model'],
    }),
  }
})

let client: QueryClient

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    server_address: 'https://api.example.com/',
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.clearAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderDocs() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Docs }),
    history: createMemoryHistory({ initialEntries: ['/docs'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('sends guests to sign-in from the create-key step', async () => {
  await renderDocs()
  const link = screen.getByRole('link', { name: 'Create an API key' })
  expect(link).toHaveAttribute('href', '/sign-in')
})

it('sends logged-in users to the keys page and shows their model list', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
    permissions: {},
  } as never)
  await renderDocs()
  const link = screen.getByRole('link', { name: 'Create an API key' })
  expect(link).toHaveAttribute('href', '/keys')
  await waitFor(() => {
    expect(document.querySelector('#docs-model-select')).toHaveTextContent(
      'user-only-model'
    )
  })
})

it('renders the resolved base URL without a trailing slash and no upstream docs links', async () => {
  await renderDocs()
  const quickStart = document.querySelector('#quick-start')
  expect(quickStart).not.toBeNull()
  expect(quickStart).toHaveTextContent('https://api.example.com')
  expect(quickStart).not.toHaveTextContent('https://api.example.com/')
  expect(document.body.innerHTML).not.toContain('docs.newapi.pro')
})

it('renders the admin extra notes section only when configured', async () => {
  await renderDocs()
  expect(
    screen.queryByRole('heading', { name: 'Notes' })
  ).not.toBeInTheDocument()

  cleanup()
  client.setQueryData(['status'], {
    server_address: 'https://api.example.com',
    docs_guide_extra: '## Extra\n\nUse `/v1` paths.',
  })
  await renderDocs()
  expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument()
})
