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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '../button'

describe('button variants', () => {
  it('secondary is a transparent button with a thin border, not a filled surface', () => {
    render(<Button variant='secondary'>Secondary</Button>)
    const button = screen.getByRole('button', { name: 'Secondary' })
    expect(button).toHaveClass('bg-transparent', 'border-border')
    expect(button).not.toHaveClass('bg-secondary')
  })

  it('destructive is a text button with a thin border per the button hierarchy', () => {
    render(<Button variant='destructive'>Remove</Button>)
    const button = screen.getByRole('button', { name: 'Remove' })
    expect(button).toHaveClass(
      'bg-transparent',
      'border-destructive/40',
      'text-destructive'
    )
  })

  it('destructive-solid keeps a filled danger surface for confirm dialogs', () => {
    render(<Button variant='destructive-solid'>Delete</Button>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveClass('bg-destructive', 'text-destructive-foreground')
  })
})
