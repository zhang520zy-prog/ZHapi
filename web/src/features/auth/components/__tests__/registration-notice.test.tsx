import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { RegistrationNotice } from '../registration-notice'

function renderNotice() {
  const onContinue = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <RegistrationNotice onContinue={onContinue} />
    </QueryClientProvider>
  )
  return { onContinue, client, ...view }
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  notifyManager.setScheduler(queueMicrotask)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
})

it('requires six visible seconds and explicit consent before continuing', async () => {
  const { onContinue } = renderNotice()
  await advance(0)
  const checkbox = screen.getByRole('checkbox')
  const next = screen.getByRole('button', { name: 'Agree and continue' })
  expect(checkbox).not.toBeChecked()
  expect(checkbox).toHaveAttribute('aria-disabled', 'true')
  expect(next).toBeDisabled()
  fireEvent.click(next)
  expect(onContinue).not.toHaveBeenCalled()
  await advance(5999)
  expect(checkbox).toHaveAttribute('aria-disabled', 'true')
  await advance(1)
  expect(checkbox).not.toHaveAttribute('aria-disabled', 'true')
  expect(next).toBeDisabled()
  fireEvent.click(checkbox)
  expect(next).toBeEnabled()
  fireEvent.click(next)
  expect(onContinue).toHaveBeenCalledOnce()
})

it('pauses hidden-tab time and resumes the remaining reading interval', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  renderNotice()
  await advance(0)
  await advance(2000)
  visibility.mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  await advance(20000)
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  visibility.mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  await advance(3999)
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  await advance(1)
  expect(screen.getByRole('checkbox')).not.toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it('does not skip the minimum when the user immediately scrolls to the end', async () => {
  renderNotice()
  await advance(0)
  const reader = screen.getByRole('region', { name: 'Registration notice' })
  expect(reader).toHaveAttribute('tabindex', '0')
  fireEvent.scroll(reader, { target: { scrollTop: 10000 } })
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
})

it('resets reading time and consent after leaving and reopening the notice', async () => {
  const first = renderNotice()
  await advance(0)
  await advance(6000)
  fireEvent.click(screen.getByRole('checkbox'))
  first.unmount()
  renderNotice()
  await advance(0)
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

it('fails closed when an enabled legal document cannot be loaded', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { data: { success: true, data: { user_agreement_enabled: true } } }
    }
    throw new Error('document unavailable')
  })
  const { onContinue } = renderNotice()
  await advance(10000)
  expect(
    screen.getByText('Unable to load the registration notice')
  ).toBeVisible()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(onContinue).not.toHaveBeenCalled()
})

it('does not count loading time and renders configured full text before starting the timer', async () => {
  let resolveDocument!: (response: unknown) => void
  const pending = new Promise((resolve) => {
    resolveDocument = resolve
  })
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { data: { success: true, data: { user_agreement_enabled: true } } }
    }
    return pending
  })
  renderNotice()
  await advance(20000)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await act(async () => {
    resolveDocument({
      data: {
        success: true,
        data: '# Published terms\n\nThe full operator-provided text.',
      },
    })
    await pending
  })
  await advance(0)
  expect(screen.getByText('The full operator-provided text.')).toBeVisible()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  await advance(6000)
  expect(screen.getByRole('checkbox')).not.toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it.each(['', '   '])(
  'blocks an enabled document with empty content %j',
  async (data) => {
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url === '/api/status' ? { privacy_policy_enabled: true } : data,
      },
    }))
    renderNotice()
    await advance(10000)
    expect(
      screen.getByText('Unable to load the registration notice')
    ).toBeVisible()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  }
)

it('retries a failed document and starts a fresh reading interval', async () => {
  const get = vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { data: { success: true, data: { privacy_policy_enabled: true } } }
    }
    return { data: { success: false } }
  })
  renderNotice()
  await advance(0)
  expect(
    screen.getByText('Unable to load the registration notice')
  ).toBeVisible()
  get.mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/status'
          ? { privacy_policy_enabled: true }
          : 'Published privacy information.',
    },
  }))
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await advance(0)
  expect(screen.getByText('Published privacy information.')).toBeVisible()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
})

it('provides a safe full-text link for externally hosted terms', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/status'
          ? { user_agreement_enabled: true }
          : 'https://terms.example.test/agreement',
    },
  }))
  renderNotice()
  await advance(0)
  const link = screen.getByRole('link', {
    name: 'View document — User Agreement',
  })
  expect(link).toHaveAttribute('href', 'https://terms.example.test/agreement')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
})

it('supports keyboard acknowledgment and revoking the checkbox before continuing', async () => {
  renderNotice()
  await advance(0)
  await advance(6000)
  vi.useRealTimers()
  const user = userEvent.setup()
  const checkbox = screen.getByRole('checkbox')
  checkbox.focus()
  await user.keyboard(' ')
  expect(checkbox).toBeChecked()
  expect(
    screen.getByRole('button', { name: 'Agree and continue' })
  ).toBeEnabled()
  await user.keyboard(' ')
  expect(checkbox).not.toBeChecked()
  expect(
    screen.getByRole('button', { name: 'Agree and continue' })
  ).toBeDisabled()
})

it('resets acknowledgment when the display language changes', async () => {
  renderNotice()
  await advance(0)
  await advance(6000)
  fireEvent.click(screen.getByRole('checkbox'))
  await act(async () => {
    await i18next.changeLanguage('zhCN')
  })
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  await act(async () => {
    await i18next.changeLanguage('en')
  })
})

it('does not permit continuing when the site configuration is unavailable', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('offline'))
  const { onContinue } = renderNotice()
  await advance(10000)
  expect(
    screen.getByText('Unable to load the registration notice')
  ).toBeVisible()
  expect(onContinue).not.toHaveBeenCalled()
})

it.each([
  ['en', en, 'Registration notice', 'Agree and continue'],
  ['zhCN', zhCN, '注册使用与风险声明', '同意并继续'],
  ['zhTW', zhTW, '註冊使用與風險聲明', '同意並繼續'],
] as const)(
  'renders the notice and acknowledgment in %s',
  async (language, resource, title, button) => {
    i18next.addResourceBundle(language, 'translation', resource.translation)
    await act(async () => {
      await i18next.changeLanguage(language)
    })
    renderNotice()
    await advance(0)
    expect(screen.getByRole('heading', { name: title })).toBeVisible()
    expect(screen.getByRole('button', { name: button })).toBeDisabled()
    expect(screen.getByRole('checkbox')).toHaveAccessibleName()
    await act(async () => {
      await i18next.changeLanguage('en')
    })
  }
)
