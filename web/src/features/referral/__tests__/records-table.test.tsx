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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RecordsTable } from '../components/tables'

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api')>()
  const record = {
    id: 1,
    program: 'referral',
    source_type: 'topup',
    source_id: 42,
    base_quota: 500000,
    // Backend returns the paid amount as a decimal string (varchar).
    paid_money: '10.00',
    currency: 'CNY',
    rate_bps: 2000,
    rate_source: 'default',
    commission_quota: 100000,
    status: 'settled',
    display_status: 'settled',
    hold_days: 0,
    available_at: 1700000000,
    reversed_quota: 0,
    terms_version: 1,
    created_at: 1700000000,
  }
  const zeroRecord = { ...record, id: 2, paid_money: '0.00' }
  return {
    ...mod,
    getReferralRecords: vi
      .fn()
      .mockResolvedValue({ items: [record, zeroRecord], total: 2 }),
  }
})

function renderTable() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RecordsTable />
    </QueryClientProvider>
  )
}

describe('referral commission records table', () => {
  it('renders a string paid_money with its currency without throwing', async () => {
    renderTable()
    expect(await screen.findByText('CNY 10.00')).toBeInTheDocument()
  })

  it('renders a dash for zero paid amounts', async () => {
    renderTable()
    await screen.findByText('CNY 10.00')
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
