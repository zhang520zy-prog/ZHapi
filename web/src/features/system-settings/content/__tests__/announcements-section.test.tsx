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
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { AnnouncementsSection } from '../announcements-section'

const EXISTING = JSON.stringify([
  {
    id: 1,
    content: 'old a',
    publishDate: '2026-11-01T00:00:00Z',
    type: 'default',
  },
  {
    id: 2,
    content: 'old b',
    publishDate: '2026-11-02T00:00:00Z',
    type: 'default',
  },
])

function renderSection(data = EXISTING) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncementsSection enabled data={data} />
    </QueryClientProvider>
  )
}

function mockPut() {
  return vi.spyOn(api, 'put').mockImplementation(async (url) => {
    if (String(url) === '/api/option/') {
      return { data: { success: true, data: {} } }
    }
    throw new Error(`unexpected PUT ${String(url)}`)
  })
}

async function addViaDialog(content: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Add Announcement' }))
  await user.type(
    screen.getByPlaceholderText(/Enter announcement content/),
    content
  )
  await user.click(screen.getByRole('button', { name: 'Add' }))
  return user
}

function savedPayload(put: ReturnType<typeof mockPut>) {
  const call = put.mock.calls.find(([url]) => String(url) === '/api/option/')
  expect(call).toBeDefined()
  const request = call?.[1] as { key: string; value: string }
  expect(request.key).toBe('console_setting.announcements')
  return JSON.parse(request.value) as Record<string, unknown>[]
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('submits new announcements without an id even after deleting the latest row in the same save', async () => {
  const put = mockPut()
  renderSection()
  const user = userEvent.setup()

  // Delete the latest announcement (id 2 — newest publishDate sorts first)
  // via its row checkbox + batch delete. Index 0 is the select-all box.
  const checkboxes = screen.getAllByRole('checkbox')
  await user.click(checkboxes[1])
  await user.click(screen.getByRole('button', { name: /Delete \(/ }))
  const confirmDialog = await screen.findByRole('alertdialog')
  await user.click(
    within(confirmDialog).getByRole('button', { name: 'Delete' })
  )

  await addViaDialog('brand new')
  await user.click(screen.getByRole('button', { name: 'Save Settings' }))

  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = savedPayload(put)
  expect(payload).toHaveLength(2)
  expect(payload[0].id).toBe(1)
  expect(payload[1].content).toBe('brand new')
  expect('id' in payload[1]).toBe(false)
})

it('strips the server id when Remind again is checked on a popup announcement', async () => {
  const put = mockPut()
  renderSection(
    JSON.stringify([
      {
        id: 5,
        content: 'popup notice',
        publishDate: '2026-11-01T00:00:00Z',
        type: 'default',
        popup: true,
      },
    ])
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Edit' }))

  const remindAgain = await screen.findByRole('checkbox', {
    name: 'Remind again',
  })
  await user.click(remindAgain)
  await user.click(screen.getByRole('button', { name: 'Update' }))
  await user.click(screen.getByRole('button', { name: 'Save Settings' }))

  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = savedPayload(put)
  expect(payload).toHaveLength(1)
  expect('id' in payload[0]).toBe(false)
  expect(payload[0].popup).toBe(true)
})

it('hides Remind again when editing a non-popup announcement', async () => {
  renderSection()
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  await waitFor(() => screen.getByRole('dialog'))
  expect(
    screen.queryByRole('checkbox', { name: 'Remind again' })
  ).not.toBeInTheDocument()
})

it('persists popup flag and shows title and expiry fields in the form', async () => {
  const put = mockPut()
  renderSection('[]')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Add Announcement' }))

  expect(screen.getByText('Title (Optional)')).toBeInTheDocument()
  expect(screen.getByText('Expiry (Optional)')).toBeInTheDocument()

  await user.type(screen.getByPlaceholderText(/popup title/), 'Hello')
  await user.click(
    screen.getByRole('switch', { name: 'Popup on console entry' })
  )
  await user.type(
    screen.getByPlaceholderText(/Enter announcement content/),
    'new content'
  )
  await user.click(screen.getByRole('button', { name: 'Add' }))
  await user.click(screen.getByRole('button', { name: 'Save Settings' }))

  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = savedPayload(put)
  expect(payload).toHaveLength(1)
  expect(payload[0]).toMatchObject({
    title: 'Hello',
    popup: true,
    content: 'new content',
  })
  expect('id' in payload[0]).toBe(false)
})

it('opens the shared popup preview without calling the ack endpoint', async () => {
  const post = vi.spyOn(api, 'post')
  renderSection()
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  await user.click(screen.getByRole('button', { name: 'Preview' }))

  expect(await screen.findByText('old a')).toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
})

it('shows popup and expired badges in the list', async () => {
  renderSection(
    JSON.stringify([
      {
        id: 1,
        content: 'expired popup',
        publishDate: '2026-01-01T00:00:00Z',
        expireDate: '2026-02-01T00:00:00Z',
        type: 'default',
        popup: true,
      },
      {
        id: 2,
        content: 'live popup',
        publishDate: '2026-01-01T00:00:00Z',
        type: 'default',
        popup: true,
      },
    ])
  )
  expect(screen.getAllByText('Popup')).toHaveLength(2)
  expect(screen.getByText('Expired')).toBeInTheDocument()
})
