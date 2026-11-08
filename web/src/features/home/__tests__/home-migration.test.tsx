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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

it('a guest enters the dashboard through Get Started and keeps the configured site identity', async () => {
  await renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
    'Gateway Example'
  )
  const hero = screen.getByRole('region', { name: /Gateway Example/ })
  expect(
    within(hero).getByRole('link', { name: 'Get Started' })
  ).toHaveAttribute('href', '/dashboard')
  expect(
    within(hero).getByRole('link', { name: 'Download RelayDesk' })
  ).toHaveAttribute('href', '#relaydesk')
  expect(
    within(hero).queryByRole('link', { name: 'Docs' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'RelayDesk' })[0]).toHaveAttribute(
    'href',
    '/#relaydesk'
  )
})

it('the desktop companion follows the hero and links only to the official release listing', async () => {
  await renderHome()
  await screen.findByRole('heading', { level: 1 })
  const regions = within(screen.getByRole('main')).getAllByRole('region')
  expect(
    regions.map((region) => region.getAttribute('aria-labelledby'))
  ).toEqual([
    'relaydesk-hero-title',
    'relaydesk-heading',
    'capabilities-heading',
  ])
  const companion = screen.getByRole('region', { name: 'RelayDesk' })
  for (const link of within(companion).getAllByRole('link')) {
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/zhang520zy-prog/RelayDesk/releases'
    )
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(within(companion).getByText('01 / INSTALL')).toBeVisible()
  expect(within(companion).getByText('02 / CHECK')).toBeVisible()
  expect(within(companion).getByText('03 / APPLY')).toBeVisible()
})

it('the visual-effects control toggles with the keyboard without changing navigation', async () => {
  await renderHome()
  const toggle = await screen.findByRole('button', {
    name: 'Pause visual effects',
  })
  const user = userEvent.setup()
  toggle.focus()
  await user.keyboard('{Enter}')
  expect(
    screen.getByRole('button', { name: 'Play visual effects' })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.getByRole('button', { name: 'Play visual effects' })
  ).toHaveFocus()
  await user.keyboard(' ')
  expect(
    screen.getByRole('button', { name: 'Pause visual effects' })
  ).toHaveAttribute('aria-pressed', 'false')
  const hero = screen.getByRole('region', { name: /Gateway Example/ })
  expect(
    within(hero).getByRole('link', { name: 'Get Started' })
  ).toHaveAttribute('href', '/dashboard')
})

it('an administrator-provided homepage URL keeps the sandbox and replaces the default visual', async () => {
  customContent = 'https://homepage.example.com/'
  await renderHome()
  const iframe = await screen.findByTitle('Custom Home Page')
  expect(iframe).toHaveAttribute('src', customContent)
  expect(iframe).toHaveAttribute(
    'sandbox',
    'allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
  )
  expect(
    screen.queryByRole('region', { name: 'RelayDesk' })
  ).not.toBeInTheDocument()
})

it('opening mobile navigation exposes the three-language switcher and closing it removes the menu from interaction', async () => {
  await renderHome()
  await screen.findByRole('heading', { level: 1 })
  const user = userEvent.setup()
  const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const menuId = toggle.getAttribute('aria-controls')
  expect(menuId).toBeTruthy()
  const menu = document.querySelector<HTMLElement>(`[id="${menuId}"]`)
  expect(menu).toBeInTheDocument()
  if (!menu) throw new Error('Mobile navigation target is missing')
  expect(menu).toHaveAttribute('inert')
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(menu).not.toHaveAttribute('inert')
  await user.click(
    within(menu).getByRole('button', { name: 'Change language' })
  )
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent)
  ).toEqual(['简体中文', '繁體中文', 'English'])
  await user.keyboard('{Escape}')
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(menu).toHaveAttribute('inert')
})

it('an administrator-provided Markdown homepage preserves its content', async () => {
  customContent =
    '# Site announcement\n\nGateway configuration remains available.'
  await renderHome()
  expect(
    await screen.findByRole('heading', { name: 'Site announcement' })
  ).toBeVisible()
  expect(
    screen.getByText('Gateway configuration remains available.')
  ).toBeVisible()
  expect(
    screen.queryByRole('region', { name: 'RelayDesk' })
  ).not.toBeInTheDocument()
})
