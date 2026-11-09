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

import { TitledCard } from '../titled-card'

describe('TitledCard section card', () => {
  it('renders the title at 16px without a header divider', () => {
    const { container } = render(
      <TitledCard title='Section' description='desc'>
        <p>body</p>
      </TitledCard>
    )
    const title = screen.getByText('Section')
    expect(title).toHaveClass('text-base', 'font-semibold')
    const header = container.querySelector('[data-slot=card-header]')
    expect(header).not.toBeNull()
    expect(header).not.toHaveClass('border-b')
  })

  it('keeps a 16px gap between the title row and the content', () => {
    const { container } = render(
      <TitledCard title='Section'>
        <p>body</p>
      </TitledCard>
    )
    const header = container.querySelector('[data-slot=card-header]')
    const content = container.querySelector('[data-slot=card-content]')
    expect(header).toHaveClass('pb-0')
    expect(content).toHaveClass('pt-4')
  })

  it('keeps the right-side action slot', () => {
    render(
      <TitledCard title='Section' action={<button type='button'>Edit</button>}>
        <p>body</p>
      </TitledCard>
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
