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
import { useAuthStore } from '@/stores/auth-store'

import { DatabaseHealthPanel } from '../components/database-health-panel'

const health = {
  main_healthy: true,
  log_healthy: false,
  independent_log: true,
  main_engine: 'mysql',
  log_engine: 'postgresql',
  recovery_healthy: true,
  audit_pending: 3,
  audit_needs_review: 1,
  audit_write_failures: 4,
}
const clients: QueryClient[] = []
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <DatabaseHealthPanel />
    </QueryClientProvider>
  )
}

it('shows independent log failure and retained audit backlog without marking the main database unhealthy', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: health },
  })
  renderPanel()
  const main = await screen.findByRole('group', { name: 'Main database' })
  expect(within(main).getByText('Healthy')).toBeVisible()
  expect(
    within(screen.getByRole('group', { name: 'Log database' })).getByText(
      'Unavailable'
    )
  ).toBeVisible()
  expect(screen.getByText('Independent log database')).toBeVisible()
  expect(
    within(
      screen.getByRole('group', { name: 'Audit pending delivery' })
    ).getByText('3')
  ).toBeVisible()
  expect(
    within(screen.getByRole('group', { name: 'Audit needs review' })).getByText(
      '1'
    )
  ).toBeVisible()
})
it('shows unknown backlog counts when audit recovery storage is unavailable', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { ...health, recovery_healthy: false, audit_pending: 0 },
    },
  })
  renderPanel()
  const pending = await screen.findByRole('group', {
    name: 'Audit pending delivery',
  })
  expect(within(pending).getByText('Unknown')).toBeVisible()
  expect(within(pending).queryByText('0')).not.toBeInTheDocument()
})
it('retries a failed health query and replaces the error with current database status', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: { success: false, message: 'Health temporarily unavailable' },
    })
    .mockResolvedValue({ data: { success: true, data: health } })
  renderPanel()
  expect(
    await screen.findByText('Health temporarily unavailable')
  ).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('group', { name: 'Main database' })
  expect(get).toHaveBeenLastCalledWith('/api/system-info/database-health')
})
it('does not request database health for an ordinary administrator', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
  const get = vi.spyOn(api, 'get')
  renderPanel()
  expect(get).not.toHaveBeenCalled()
  expect(screen.queryByText('Database health')).not.toBeInTheDocument()
})
it('hides cached health when root access is revoked', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: health } })
  renderPanel()
  await screen.findByRole('group', { name: 'Main database' })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
  await waitFor(() =>
    expect(screen.queryByText('Database health')).not.toBeInTheDocument()
  )
  expect(get).toHaveBeenCalledTimes(1)
})
