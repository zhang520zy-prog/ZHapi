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
import { ShieldCheck } from 'lucide-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  SettingsCategoryItem,
  SettingsCategoryList,
} from '../settings-category-list'

describe('SettingsCategoryItem', () => {
  it('renders icon, title, one-line description and a right badge', () => {
    render(
      <SettingsCategoryList>
        <SettingsCategoryItem
          icon={ShieldCheck}
          title='Security'
          description='Passkeys and two-factor sign-in'
          badge={<span>2</span>}
        />
      </SettingsCategoryList>
    )
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Passkeys and two-factor sign-in')
    ).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('invokes onClick from keyboard and pointer', async () => {
    const onClick = vi.fn()
    render(<SettingsCategoryItem title='Security' onClick={onClick} />)
    const item = screen.getByRole('button', { name: 'Security' })
    item.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(item)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('renders as the provided element so navigation stays type-safe', () => {
    render(
      <SettingsCategoryItem
        title='Security'
        render={<a href='/settings/security' />}
      />
    )
    const link = screen.getByRole('link', { name: 'Security' })
    expect(link).toHaveAttribute('href', '/settings/security')
  })

  it('marks the selected item with aria-current and accent styling', () => {
    render(<SettingsCategoryItem title='Security' selected />)
    const item = screen.getByRole('button', { name: 'Security' })
    expect(item).toHaveAttribute('aria-current', 'page')
    expect(item).toHaveClass('bg-accent', 'text-accent-foreground')
    expect(item).toHaveClass('shadow-[inset_3px_0_0_var(--primary)]')
  })
})
