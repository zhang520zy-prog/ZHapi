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
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import {
  useBoundBindingsCount,
  useSecurityScore,
} from '../hooks/use-security-score'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  ...overrides,
})

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    passkey_login: true,
    github_oauth: true,
    google_oauth: true,
    custom_oauth_providers: [
      { id: 1, name: 'Gitea', slug: 'gitea' },
      { id: 2, name: 'GitLab', slug: 'gitlab' },
    ],
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/passkey') {
      return { data: { success: true, data: { enabled: false } } }
    }
    if (url === '/api/user/2fa/status') {
      return {
        data: {
          success: true,
          data: { enabled: false, locked: false, backup_codes_remaining: 0 },
        },
      }
    }
    if (url === '/api/user/oauth/bindings') {
      return {
        data: {
          success: true,
          data: [{ provider_id: 1, provider_user_id: 'octo' }],
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

describe('useSecurityScore', () => {
  it('scores email, passkey and 2FA when passkey login is enabled', async () => {
    const { result } = renderHook(
      () => useSecurityScore(profile({ email: 'a@b.c' })),
      { wrapper }
    )
    await waitFor(() => expect(result.current.total).toBe(3))
    expect(result.current.items.map((item) => item.key)).toEqual([
      'email',
      'passkey',
      'two-fa',
    ])
    expect(result.current.completed).toBe(1)
  })

  it('drops the passkey item when the site disables passkey login', async () => {
    client.setQueryData(STATUS_QUERY_KEY, { passkey_login: false })
    const { result } = renderHook(() => useSecurityScore(profile()), {
      wrapper,
    })
    await waitFor(() => expect(result.current.total).toBe(2))
    expect(result.current.items.some((item) => item.key === 'passkey')).toBe(
      false
    )
    expect(api.get).not.toHaveBeenCalledWith('/api/user/passkey')
  })

  it('counts enabled factors towards the score', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/passkey') {
        return { data: { success: true, data: { enabled: true } } }
      }
      if (url === '/api/user/2fa/status') {
        return {
          data: {
            success: true,
            data: { enabled: true, locked: false, backup_codes_remaining: 3 },
          },
        }
      }
      return { data: { success: true, data: [] } }
    })
    const { result } = renderHook(
      () => useSecurityScore(profile({ email: 'a@b.c' })),
      { wrapper }
    )
    await waitFor(() => expect(result.current.completed).toBe(3))
  })

  it('shares one fetch per endpoint across concurrent hook consumers', async () => {
    const first = renderHook(() => useSecurityScore(profile()), { wrapper })
    const second = renderHook(() => useSecurityScore(profile()), { wrapper })
    await waitFor(() => {
      expect(first.result.current.total).toBe(3)
      expect(second.result.current.total).toBe(3)
    })
    const calls = vi
      .mocked(api.get)
      .mock.calls.map(([url]) => url)
      .filter(
        (url) => url === '/api/user/passkey' || url === '/api/user/2fa/status'
      )
    expect(calls).toHaveLength(2)
  })
})

describe('useBoundBindingsCount', () => {
  it('counts bound built-ins and custom providers', async () => {
    const { result } = renderHook(
      () =>
        useBoundBindingsCount(
          profile({ github_id: 'gh', google_id: 'g', wechat_id: 'w' })
        ),
      { wrapper }
    )
    // github + google bound (wechat is disabled in status), plus 1 custom.
    await waitFor(() => expect(result.current).toBe(3))
  })
})
