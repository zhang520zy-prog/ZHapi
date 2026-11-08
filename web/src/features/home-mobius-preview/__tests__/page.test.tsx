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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { MobiusHomePreview } from '..'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

const renderPage = () =>
  render(
    <QueryClientProvider client={client}>
      <MobiusHomePreview />
    </QueryClientProvider>
  )

it('without canvas every section is in the document flow and reachable, in reading order', () => {
  renderPage()
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

it('the homepage shows its own brand and keeps the required upstream attribution in the footer', () => {
  renderPage()
  expect(screen.getByRole('link', { name: 'Go to home' })).toHaveTextContent(
    'ZH Api'
  )
  expect(
    within(screen.getByRole('contentinfo')).getByRole('link', {
      name: 'Frontend design and development by New API contributors.',
    })
  ).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
})

it('in-page navigation targets real sections instead of switching chapters', () => {
  renderPage()
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

it('keyboard users can tab from the hero call to action into later sections without any timer', async () => {
  renderPage()
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

it('the pause control is disabled when the sculpture cannot draw', () => {
  renderPage()
  expect(
    screen.getByRole('button', { name: 'Pause visual effects' })
  ).toBeDisabled()
})
