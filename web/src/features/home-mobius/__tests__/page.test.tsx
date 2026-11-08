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

import { useAuthStore } from '@/stores/auth-store'

import { MobiusHome } from '..'

let client: QueryClient
beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

const renderPage = async () => {
  const router = createRouter({
    routeTree: createRootRoute({ component: MobiusHome }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('without canvas every section is in the document flow and reachable, in reading order', async () => {
  await renderPage()
  const main = screen.getByRole('main')
  const regions = within(main).getAllByRole('region')
  expect(
    regions.map((region) => region.getAttribute('aria-labelledby'))
  ).toEqual([
    'mobius-title',
    'model-title',
    'desktop-title',
    'tools-title',
    'closing-title',
  ])
  for (const region of regions) {
    expect(region).not.toHaveAttribute('aria-hidden')
    expect(region).not.toHaveAttribute('inert')
  }
})

it('the homepage shows its own brand and keeps the required upstream attribution in the footer', async () => {
  await renderPage()
  expect(screen.getByRole('link', { name: 'Go to home' })).toHaveTextContent(
    'ZH Api'
  )
  expect(
    within(screen.getByRole('contentinfo')).getByRole('link', {
      name: 'Frontend design and development by New API contributors.',
    })
  ).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
})

it('in-page navigation targets real sections instead of switching chapters', async () => {
  await renderPage()
  const header = within(
    screen.getByRole('navigation', { name: 'Main navigation' })
  )
  const relaydesk = header.getByRole('link', { name: 'RelayDesk' })
  expect(relaydesk).toHaveAttribute('href', '#relaydesk')
  expect(document.querySelector('#relaydesk')).toContainElement(
    screen.getByRole('heading', { name: 'The flow continues.RelayDesk.' })
  )
  expect(screen.getByRole('link', { name: 'Scroll down' })).toHaveAttribute(
    'href',
    '#models'
  )
})

it('site links use in-app routes instead of absolute preview URLs', async () => {
  await renderPage()
  const header = within(
    screen.getByRole('navigation', { name: 'Main navigation' })
  )
  expect(header.getByRole('link', { name: 'Models' })).toHaveAttribute(
    'href',
    '/pricing'
  )
  expect(header.getByRole('link', { name: 'Console' })).toHaveAttribute(
    'href',
    '/dashboard'
  )
  for (const link of screen.getAllByRole('link')) {
    expect(link.getAttribute('href') ?? '').not.toContain('127.0.0.1')
  }
})

it('a guest sees Sign In and Get Started pointing at the auth pages', async () => {
  await renderPage()
  expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute(
    'href',
    '/sign-in'
  )
  for (const link of screen.getAllByRole('link', { name: 'Get Started' })) {
    expect(link).toHaveAttribute('href', '/sign-up')
  }
})

it('a signed-in user sees the console targets instead of auth pages', async () => {
  useAuthStore.setState({
    auth: {
      ...useAuthStore.getState().auth,
      user: { id: 1, username: 'tester', role: 1 },
    },
  })
  await renderPage()
  const header = within(
    screen.getByRole('navigation', { name: 'Main navigation' }).closest(
      'header'
    ) as HTMLElement
  )
  const consoleLinks = header.getAllByRole('link', { name: 'Console' })
  expect(consoleLinks.length).toBeGreaterThanOrEqual(2)
  for (const link of consoleLinks) {
    expect(link).toHaveAttribute('href', '/dashboard')
  }
  expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument()
  for (const link of screen.getAllByRole('link', { name: 'Get Started' })) {
    expect(link).toHaveAttribute('href', '/dashboard')
  }
})

it('keyboard users can tab from the hero call to action into later sections without any timer', async () => {
  await renderPage()
  const user = userEvent.setup()
  const download = screen.getByRole('link', { name: 'Download RelayDesk' })
  for (let step = 0; step < 20 && document.activeElement !== download; step++) {
    await user.tab()
  }
  expect(download).toHaveFocus()
  expect(download).toHaveAttribute(
    'href',
    'https://github.com/zhang520zy-prog/RelayDesk/releases'
  )
})

it('the pause control is disabled when the sculpture cannot draw', async () => {
  await renderPage()
  expect(
    screen.getByRole('button', { name: 'Pause visual effects' })
  ).toBeDisabled()
})
