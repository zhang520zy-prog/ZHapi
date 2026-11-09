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
import { describe, expect, it } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { NavGroup } from '../nav-group'

const items = [
  {
    title: 'Group',
    items: [
      { title: 'Active child', url: '/group/sub-a' },
      { title: 'Other child', url: '/group/sub-b' },
    ],
  },
]

async function renderCollapsedNav() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <SidebarProvider open={false}>
          <NavGroup title='Section' items={items} />
        </SidebarProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/group/sub-a'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('collapsed sidebar dropdown', () => {
  it('marks the current item with accent tint, accent text and a 3px left bar', async () => {
    await renderCollapsedNav()
    await userEvent.click(
      screen.getByRole('button', { name: /group/i })
    )
    const active = (await screen.findByText('Active child')).closest('a')
    expect(active).not.toBeNull()
    expect(active).toHaveClass('bg-accent')
    expect(active).toHaveClass('text-accent-foreground')
    expect(active).toHaveClass('shadow-[inset_3px_0_0_var(--primary)]')
    expect(active).not.toHaveClass('bg-secondary')

    const inactive = screen.getByText('Other child').closest('a')
    expect(inactive).not.toHaveClass('bg-accent')
  })
})
