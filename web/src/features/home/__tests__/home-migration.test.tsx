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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Home } from '..'

let client: QueryClient
let customContent: string

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    system_name: 'Gateway Example',
    docs_link: '',
    announcements_enabled: false,
  })
  customContent = ''
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url === '/api/home_page_content' ? customContent : '',
    },
  }))
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

async function renderHome() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Home }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('renders the Mobius homepage when no custom home page is configured', async () => {
  await renderHome()
  expect(
    await screen.findByRole('link', { name: 'Go to home' })
  ).toHaveTextContent('ZH Api')
  expect(document.querySelector('.mobius-page')).toBeInTheDocument()
})

it('an administrator-provided homepage URL keeps the sandbox and does not render the Mobius homepage', async () => {
  customContent = 'https://homepage.example.com/'
  await renderHome()
  const iframe = await screen.findByTitle('Custom Home Page')
  expect(iframe).toHaveAttribute('src', customContent)
  expect(iframe).toHaveAttribute(
    'sandbox',
    'allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
  )
  expect(document.querySelector('.mobius-page')).not.toBeInTheDocument()
})

it('an administrator-provided Markdown homepage preserves its content and does not render the Mobius homepage', async () => {
  customContent =
    '# Site announcement\n\nGateway configuration remains available.'
  await renderHome()
  expect(
    await screen.findByRole('heading', { name: 'Site announcement' })
  ).toBeVisible()
  expect(
    screen.getByText('Gateway configuration remains available.')
  ).toBeVisible()
  expect(document.querySelector('.mobius-page')).not.toBeInTheDocument()
})
