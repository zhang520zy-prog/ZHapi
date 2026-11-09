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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'

import { TopNavMenu } from '../top-nav'

const mocks = vi.hoisted(() => ({ setOpen: vi.fn() }))

vi.mock('@/context/search-provider', () => ({
  useSearch: () => ({ open: false, setOpen: mocks.setOpen }),
}))

const links = [
  { title: 'Home', href: '/' },
  { title: 'Model Square', href: '/pricing' },
  { title: 'Console', href: '/dashboard' },
  { title: 'Docs', href: '/docs' },
]

async function renderMenu() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ThemeProvider>
          <TopNavMenu links={links} />
        </ThemeProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
  await userEvent.click(
    screen.getByRole('button', { name: /open navigation menu/i })
  )
}

describe('top navigation hamburger menu', () => {
  beforeEach(() => {
    mocks.setOpen.mockClear()
  })

  it('lists the four navigation links', async () => {
    await renderMenu()
    for (const link of links) {
      expect(await screen.findByText(link.title)).toBeInTheDocument()
    }
  })

  it('offers phone-only fallbacks for search, language and theme', async () => {
    await renderMenu()
    for (const label of ['Search', 'Interface Language', 'Theme']) {
      const entry = await screen.findByText(label)
      expect(
        entry.closest('[class*="sm:hidden"]'),
        `${label} should only render below the sm breakpoint`
      ).not.toBeNull()
    }
  })

  it('opens the command palette from the search entry', async () => {
    await renderMenu()
    await userEvent.click(await screen.findByText('Search'))
    expect(mocks.setOpen).toHaveBeenCalledWith(true)
  })
})
