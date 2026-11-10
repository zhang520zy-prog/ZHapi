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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

import { AnnouncementPopup } from '../announcement-popup'
import type { PopupAnnouncement } from '../types'

const PAST = '2020-01-01T00:00:00Z'
const FUTURE = '2999-01-01T00:00:00Z'
const SUPPRESSED_KEY = 'announcement-popup-suppressed'

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: 'alice',
    role: 1,
    agreement_version: 1,
    announcement_acked_ids: [],
    ...overrides,
  }
}

function setUser(user: AuthUser | null) {
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user },
  }))
}

function eligibleAnnouncement(
  id: number,
  overrides: Partial<PopupAnnouncement> = {}
): PopupAnnouncement {
  return {
    id,
    title: `Notice ${id}`,
    content: `Body ${id}`,
    publishDate: PAST,
    popup: true,
    type: 'default',
    ...overrides,
  }
}

function mockApi(options: {
  announcements?: PopupAnnouncement[]
  announcementsEnabled?: boolean
  agreementVersion?: number
  ackFails?: boolean
  ackedIds?: number[]
}) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url) === '/api/status') {
      return {
        data: {
          success: true,
          data: {
            announcements: options.announcements ?? [],
            announcements_enabled: options.announcementsEnabled ?? true,
            user_agreement_version: options.agreementVersion ?? 0,
          },
        },
      }
    }
    throw new Error(`unexpected GET ${String(url)}`)
  })
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (String(url) === '/api/user/announcements/ack') {
      if (options.ackFails) throw new Error('offline')
      return {
        data: {
          success: true,
          data: {
            announcement_acked_ids: options.ackedIds ?? [],
          },
        },
      }
    }
    throw new Error(`unexpected POST ${String(url)}`)
  })
  return post
}

function renderPopup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncementPopup />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  useNotificationStore.setState({ readAnnouncementKeys: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('shows only popup announcements that are published, unexpired and unseen', async () => {
  setUser(makeUser({ announcement_acked_ids: [4] }))
  mockApi({
    announcements: [
      eligibleAnnouncement(1),
      eligibleAnnouncement(2, { popup: false }),
      eligibleAnnouncement(3, { publishDate: FUTURE }),
      eligibleAnnouncement(4), // already acknowledged
      eligibleAnnouncement(5, { expireDate: '2020-06-01T00:00:00Z' }),
      eligibleAnnouncement(6, {
        publishDate: FUTURE,
        expireDate: '2999-06-01T00:00:00Z',
      }),
    ],
  })
  renderPopup()
  expect(await screen.findByText('Notice 1')).toBeInTheDocument()
  expect(screen.getByText('Body 1')).toBeInTheDocument()
  expect(screen.queryByText('Notice 2')).not.toBeInTheDocument()
  expect(screen.queryByText('Notice 3')).not.toBeInTheDocument()
  expect(screen.queryByText('Notice 4')).not.toBeInTheDocument()
  expect(screen.queryByText('Notice 5')).not.toBeInTheDocument()
  expect(screen.queryByText('Notice 6')).not.toBeInTheDocument()
})

it('stays closed while the agreement confirmation is pending', async () => {
  setUser(makeUser({ agreement_version: 1 }))
  mockApi({
    announcements: [eligibleAnnouncement(1)],
    agreementVersion: 2,
  })
  renderPopup()
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('stays closed when no user is signed in', async () => {
  setUser(null)
  mockApi({ announcements: [eligibleAnnouncement(1)] })
  renderPopup()
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('navigates multiple announcements with a counter', async () => {
  setUser(makeUser())
  mockApi({
    announcements: [
      eligibleAnnouncement(1, { publishDate: '2020-01-03T00:00:00Z' }),
      eligibleAnnouncement(2, { publishDate: '2020-01-02T00:00:00Z' }),
      eligibleAnnouncement(3, { publishDate: '2020-01-01T00:00:00Z' }),
    ],
  })
  renderPopup()
  expect(await screen.findByText('1 / 3')).toBeInTheDocument()
  // Newest publishDate first
  expect(screen.getByText('Notice 1')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
  expect(screen.getByText('Notice 2')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('3 / 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
})

it.each(['Got it', 'Close'])(
  'closing via %s acknowledges every displayed id once',
  async (buttonName) => {
    setUser(makeUser())
    const post = mockApi({
      announcements: [
        eligibleAnnouncement(1, { publishDate: '2020-01-02T00:00:00Z' }),
        eligibleAnnouncement(2, { publishDate: '2020-01-01T00:00:00Z' }),
      ],
      ackedIds: [1, 2],
    })
    renderPopup()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: buttonName }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(post).toHaveBeenCalledWith('/api/user/announcements/ack', {
      ids: [1, 2],
    })
    expect(post).toHaveBeenCalledTimes(1)
  }
)

it('marks acknowledged announcements read in the notification store on success', async () => {
  setUser(makeUser({ announcement_acked_ids: [9] }))
  mockApi({
    announcements: [eligibleAnnouncement(1)],
    ackedIds: [9, 1],
  })
  renderPopup()
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
  await waitFor(() =>
    expect(useNotificationStore.getState().readAnnouncementKeys).toContain(
      'id:1'
    )
  )
  expect(useAuthStore.getState().auth.user?.announcement_acked_ids).toEqual([
    9, 1,
  ])
})

it('closes on Escape and acknowledges the displayed ids', async () => {
  setUser(makeUser())
  const post = mockApi({
    announcements: [eligibleAnnouncement(7)],
    ackedIds: [7],
  })
  renderPopup()
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(post).toHaveBeenCalledWith('/api/user/announcements/ack', {
    ids: [7],
  })
})

it('still closes on ack failure and suppresses repeat display this session', async () => {
  setUser(makeUser())
  mockApi({
    announcements: [eligibleAnnouncement(1)],
    ackFails: true,
  })
  const first = renderPopup()
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(
    JSON.parse(window.sessionStorage.getItem(SUPPRESSED_KEY) ?? '[]')
  ).toEqual([1])

  // Remount (e.g. navigating back into the console): no second popup.
  first.unmount()
  renderPopup()
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('renders content through the sanitizer', async () => {
  setUser(makeUser())
  mockApi({
    announcements: [
      eligibleAnnouncement(1, {
        content:
          'Hello <script>alert(1)</script><img src="x" onerror="alert(2)">',
      }),
    ],
  })
  renderPopup()
  expect(await screen.findByText(/Hello/)).toBeInTheDocument()
  const dialog = screen.getByRole('dialog')
  expect(dialog.querySelector('script')).toBeNull()
  expect(dialog.querySelector('[onerror]')).toBeNull()
})
