import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { SignUpForm } from '../../sign-up/components/sign-up-form'
import { OAuthProviders } from '../oauth-providers'

const status = {
  email_verification: true,
  github_oauth: true,
  github_client_id: 'test-client',
  oauth_register_enabled: true,
}

async function renderSignup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/sign-up',
        component: SignUpForm,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/sign-in',
        component: () => <p>Sign-in destination</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
  })
  await act(async () => {
    await router.load()
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  notifyManager.setScheduler(queueMicrotask)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: status },
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } })
  useAuthStore.getState().auth.reset('complete')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  useAuthStore.getState().auth.reset('idle')
})

it('keeps credentials, verification and OAuth unavailable until the notice is acknowledged', async () => {
  await renderSignup()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Send code' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Continue with GitHub/ })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
  expect(api.post).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByLabelText('Username')).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: /Continue with GitHub/ })
  ).toBeVisible()
  expect(api.post).not.toHaveBeenCalled()
})

it('requires a new reading interval after returning from the registration form', async () => {
  await renderSignup()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'test-user' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Review notice' }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})

it('submits through the existing registration API only after consent', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { email_verification: false } },
  })
  await renderSignup()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
  vi.useRealTimers()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username'), 'test-user')
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'Test-only-password-2026'
  )
  await user.type(
    screen.getByLabelText('Confirm password', { exact: true }),
    'Test-only-password-2026'
  )
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(api.post).toHaveBeenCalledWith(
    '/api/user/register',
    expect.objectContaining({ username: 'test-user' }),
    expect.any(Object)
  )
  expect(await screen.findByText('Sign-in destination')).toBeVisible()
})

it('gates third-party sign-in that can create accounts and cancels without invoking its action', async () => {
  const onWeChatLogin = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <OAuthProviders
        status={{ wechat_login: true }}
        requireRegistrationNotice
        onWeChatLogin={onWeChatLogin}
      />
    </QueryClientProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /Continue with WeChat/ }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(onWeChatLogin).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), {
    key: 'Escape',
    code: 'Escape',
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(onWeChatLogin).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Continue with WeChat/ }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
  expect(onWeChatLogin).toHaveBeenCalledOnce()
})
