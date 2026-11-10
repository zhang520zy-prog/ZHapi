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
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import dayjs from '@/lib/dayjs'
import { useAuthStore } from '@/stores/auth-store'

import { MESSAGE_STATUS } from '../../../constants'
import type { Message } from '../../../types'
import { MessageError } from '../message-error'

const restrictedUntil = Math.floor(Date.now() / 1000) + 600
const SERVER_MESSAGE = `API access restricted until ${dayjs
  .unix(restrictedUntil)
  .toISOString()}; view risk events or submit an appeal`

function errorMessage(code: string, content = SERVER_MESSAGE): Message {
  return {
    key: 'm-1',
    from: 'assistant',
    status: MESSAGE_STATUS.ERROR,
    errorCode: code,
    versions: [{ id: 'v1', content }],
  }
}

function mockState(restricted: number | null) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url) === '/api/risk/self/state') {
      return {
        data: {
          success: true,
          data: {
            level: 1,
            hits: 1,
            disabled: false,
            restricted_until: restricted ?? 0,
          },
        },
      }
    }
    throw new Error(`unexpected GET ${String(url)}`)
  })
}

async function renderError(message: Message) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <MessageError message={message} />,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'account', role: 1 })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('renders the localized release time instead of the raw server message', async () => {
  mockState(restrictedUntil)
  await renderError(errorMessage('risk_restricted'))
  expect(
    await screen.findByText('Account API access is restricted')
  ).toBeVisible()
  expect(
    screen.getByText(
      'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.'
    )
  ).toBeVisible()
  const expectedTime = dayjs.unix(restrictedUntil).format('YYYY-MM-DD HH:mm:ss')
  expect(
    await screen.findByText(`Expected release at ${expectedTime}`)
  ).toBeVisible()
  expect(screen.queryByText(SERVER_MESSAGE)).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'View risk events' })
  ).toHaveAttribute('href', '/risk-events')
})

it('omits the release time when the state query has no active restriction', async () => {
  mockState(null)
  await renderError(errorMessage('risk_restricted'))
  expect(
    await screen.findByText('Account API access is restricted')
  ).toBeVisible()
  expect(screen.queryByText(/Expected release at/)).not.toBeInTheDocument()
  expect(screen.queryByText(SERVER_MESSAGE)).not.toBeInTheDocument()
})

it('renders the content-inspection notice for sensitive word blocks', async () => {
  mockState(null)
  await renderError(
    errorMessage('sensitive_words_detected', 'Request blocked by content check')
  )
  expect(await screen.findByText('Content inspection')).toBeVisible()
  expect(
    screen.getByText(
      'Request content did not pass content inspection and this request was stopped'
    )
  ).toBeVisible()
  expect(
    screen.queryByText('Request blocked by content check')
  ).not.toBeInTheDocument()
})
