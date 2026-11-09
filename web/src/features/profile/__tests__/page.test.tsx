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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Profile } from '@/features/profile'
import {
  profileSearchSchema,
  redirectToSecuritySection,
} from '@/features/profile/lib/profile-search'
import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  setting: JSON.stringify({
    notify_type: 'email',
    quota_warning_threshold: 500000,
  }),
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  useAuthStore
    .getState()
    .auth.setUser({ ...profile, permissions: { sidebar_settings: false } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/token/status') {
      return {
        data: {
          success: true,
          data: {
            exists: false,
            token_ref: '',
            created_at: null,
            last_used_at: null,
            last_used_ip: '',
          },
        },
      }
    }
    if (url === '/api/user/self') {
      return { data: { success: true, data: profile } }
    }
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
    if (url === '/api/user/sessions') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/user/oauth/bindings') {
      return { data: { success: true, data: [] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

async function renderPage(path = '/profile') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    checkin_enabled: false,
    wechat_login: true,
    github_oauth: true,
    google_oauth: true,
    oidc_enabled: true,
    passkey_login: true,
    custom_oauth_providers: [
      {
        id: 1,
        name: 'Gitea',
        slug: 'gitea',
        client_id: 'test-client',
        authorization_endpoint: 'https://example.com/oauth/authorize',
        scopes: 'openid',
      },
    ],
  })
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  // Mirror the profile/index.tsx file-route shape (layout + index child) so
  // the index route id '/_authenticated/profile/' matches useSearch({ from }).
  const profileLayout = createRoute({
    getParentRoute: () => authenticated,
    path: 'profile',
  })
  const personal = createRoute({
    getParentRoute: () => profileLayout,
    path: '/',
    validateSearch: profileSearchSchema,
    component: Profile,
  })
  const legacy = createRoute({
    getParentRoute: () => authenticated,
    path: 'security',
    beforeLoad: () => {
      redirectToSecuritySection()
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([
      authenticated.addChildren([
        profileLayout.addChildren([personal]),
        legacy,
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { ...rendered, router }
}

describe('merged personal settings page', () => {
  it('shows account bindings by default without mounting security controls', async () => {
    await renderPage('/profile')
    const bindings = await screen.findByRole('list', {
      name: 'Account Bindings',
    })
    expect(within(bindings).getByText('GitHub')).toBeVisible()
    expect(
      within(bindings).getByText('Google', { selector: 'p' })
    ).toBeVisible()
    expect(within(bindings).getByText('Gitea')).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Security settings/ })
    ).toBeVisible()
    expect(screen.getByText('Security score')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Change Password' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete Account' })
    ).not.toBeInTheDocument()
    // The score card shares the passkey/2FA queries; sessions only load on the
    // security section.
    expect(api.get).not.toHaveBeenCalledWith('/api/user/sessions')
  })

  it('highlights the default category on desktop without a section param', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('min-width'),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList
    )
    await renderPage('/profile')
    const bindings = await screen.findByRole('link', {
      name: /Account bindings/,
    })
    expect(bindings).toHaveAttribute('aria-current', 'page')
  })

  it('shows no selected category on mobile without a section param', async () => {
    await renderPage('/profile')
    await screen.findByRole('list', { name: 'Account Bindings' })
    expect(
      screen.queryByRole('link', { current: 'page' })
    ).not.toBeInTheDocument()
  })

  it('falls back to the bindings section for an invalid section param', async () => {
    const { router } = await renderPage('/profile?section=bogus')
    expect(
      await screen.findByRole('list', { name: 'Account Bindings' })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/profile')
  })

  it('redirects the legacy /security URL to the security section', async () => {
    const { router } = await renderPage('/security')
    expect(
      await screen.findByRole('button', { name: 'Change Password' })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/profile')
    expect(router.state.location.search).toEqual({ section: 'security' })
  })

  it('renders the security controls under the security section', async () => {
    await renderPage('/profile?section=security')
    expect(
      await screen.findByRole('button', { name: 'Change Password' })
    ).toBeVisible()
    expect(await screen.findByText('Passkey Login')).toBeVisible()
    expect(await screen.findByText('Two-Factor Authentication')).toBeVisible()
    expect(await screen.findByText('No active login sessions')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Access Token' })).toBeVisible()
    expect(
      screen.queryByRole('switch', { name: 'Record IP Address' })
    ).not.toBeInTheDocument()
  })

  it('renders privacy controls and account deletion under privacy', async () => {
    await renderPage('/profile?section=privacy')
    expect(
      await screen.findByRole('switch', { name: 'Record IP Address' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete Account' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Change Password' })
    ).not.toBeInTheDocument()
  })

  it('renders notification settings under notifications', async () => {
    await renderPage('/profile?section=notifications')
    expect(
      await screen.findByText('Notifications & alerts', {
        selector: '[data-slot="card-title"]',
      })
    ).toBeVisible()
    expect(
      screen.queryByText('Settings', { selector: '[data-slot="card-title"]' })
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Save Settings' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Change Password' })
    ).not.toBeInTheDocument()
  })

  it('opens the password dialog by keyboard and closes it with Escape', async () => {
    const user = userEvent.setup()
    await renderPage('/profile?section=security')
    const action = await screen.findByRole('button', {
      name: 'Change Password',
    })
    action.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', {
      name: 'Change Password',
    })
    expect(within(dialog).getByLabelText('Current Password')).toBeVisible()
    expect(
      within(dialog).getByLabelText('New Password', { exact: true })
    ).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('offers retry before exposing account actions when the profile fails', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/self') {
        return { data: { success: false } }
      }
      return { data: { success: true, data: {} } }
    })
    const user = userEvent.setup()
    await renderPage('/profile?section=privacy')
    expect(await screen.findByText('Failed to load profile')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Delete Account' })
    ).not.toBeInTheDocument()
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/self') {
        return { data: { success: true, data: profile } }
      }
      if (url === '/api/user/sessions') {
        return { data: { success: true, data: [] } }
      }
      if (url === '/api/user/oauth/bindings') {
        return { data: { success: true, data: [] } }
      }
      return { data: { success: true, data: {} } }
    })
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('button', { name: 'Delete Account' })
    ).toBeVisible()
  })
})
