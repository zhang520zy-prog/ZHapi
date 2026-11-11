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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { SystemInfoSection } from '../system-info-section'

type FixtureProps = {
  agreement?: string
  version?: number
}

function Fixture({ agreement = 'existing terms', version = 0 }: FixtureProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <SystemInfoSection
          defaultValues={{
            SystemName: 'RelayDesk',
            ServerAddress: '',
            TaskPublicAddress: '',
            Logo: '',
            Footer: '',
            About: '',
            HomePageContent: '',
            general_setting: { docs_link: '' },
            legal: {
              user_agreement: agreement,
              privacy_policy: '',
              user_agreement_version: version,
            },
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

async function renderSection(fixtureProps?: FixtureProps) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Fixture {...fixtureProps} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('textbox', { name: 'User Agreement' })
}

type OptionCall = { key: string; value: unknown }

function mockOptions() {
  const calls: OptionCall[] = []
  vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
    calls.push(body as OptionCall)
    return { data: { success: true } }
  })
  return calls
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('checkbox is disabled while the agreement field is empty', async () => {
  await renderSection({ agreement: '', version: 0 })
  expect(
    screen.getByRole('checkbox', { name: 'Require all users to re-confirm' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText('Fill in the user agreement first')).toBeInTheDocument()
})

test('confirming bumps the version only after the body is saved', async () => {
  const calls = mockOptions()
  const user = userEvent.setup()
  const input = await renderSection({ agreement: 'old terms', version: 0 })
  await user.clear(input)
  await user.type(input, 'new terms')
  await user.click(
    screen.getByRole('checkbox', { name: 'Require all users to re-confirm' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm and save' })
  )
  await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2))
  expect(calls[0]).toEqual({ key: 'legal.user_agreement', value: 'new terms' })
  expect(calls.at(-1)).toEqual({
    key: 'legal.user_agreement_version',
    value: '1',
  })
})

test('without the checkbox no version request is sent', async () => {
  const calls = mockOptions()
  const user = userEvent.setup()
  const input = await renderSection({ agreement: 'old terms', version: 0 })
  await user.clear(input)
  await user.type(input, 'new terms')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1))
  expect(
    calls.some((call) => call.key === 'legal.user_agreement_version')
  ).toBe(false)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('canceling the confirmation saves nothing', async () => {
  const calls = mockOptions()
  const user = userEvent.setup()
  const input = await renderSection({ agreement: 'old terms', version: 0 })
  await user.clear(input)
  await user.type(input, 'new terms')
  await user.click(
    screen.getByRole('checkbox', { name: 'Require all users to re-confirm' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
  expect(calls).toHaveLength(0)
})

test('a failed version save keeps the checkbox checked for retry', async () => {
  const calls: OptionCall[] = []
  vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
    const request = body as OptionCall
    if (request.key === 'legal.user_agreement_version') {
      return { data: { success: false, message: 'version rejected' } }
    }
    calls.push(request)
    return { data: { success: true } }
  })
  const user = userEvent.setup()
  await renderSection({ agreement: 'old terms', version: 0 })
  const checkbox = screen.getByRole('checkbox', {
    name: 'Require all users to re-confirm',
  })
  await user.click(checkbox)
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm and save' })
  )
  await waitFor(() => expect(checkbox).toBeChecked())
  // 字段无改动时仅版本请求失败，版本请求之后未出现成功复位
  expect(checkbox).toBeChecked()
})

test('checking alone without editing the body still saves the bump', async () => {
  const calls = mockOptions()
  const user = userEvent.setup()
  await renderSection({ agreement: 'old terms', version: 1 })
  await user.click(
    screen.getByRole('checkbox', { name: 'Require all users to re-confirm' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Confirm and save' })
  )
  await waitFor(() => expect(calls.length).toBe(1))
  expect(calls[0]).toEqual({
    key: 'legal.user_agreement_version',
    value: '2',
  })
})
