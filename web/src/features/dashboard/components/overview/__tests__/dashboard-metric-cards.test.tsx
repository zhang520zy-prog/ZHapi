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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DashboardMetricCards } from '../dashboard-metric-cards'

const DAY_SEC = 86400

async function renderCards(props: {
  data?: Parameters<typeof DashboardMetricCards>[0]['data']
  remainQuota?: number
  runwayUsage?: number
  runwayLoading?: boolean
}) {
  const end = 1_700_000_000
  const Cards = () => (
    <DashboardMetricCards
      data={props.data ?? []}
      loading={false}
      rangeStartSec={end - DAY_SEC}
      rangeEndSec={end}
      granularity='hour'
      remainQuota={props.remainQuota ?? 0}
      usedQuota={500000}
      requestCount={4321}
      runwayUsage={props.runwayUsage}
      runwayLoading={props.runwayLoading ?? false}
    />
  )
  const router = createRouter({
    routeTree: createRootRoute({ component: Cards }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('dashboard metric cards', () => {
  it('renders the four metric card titles', async () => {
    await renderCards({})
    expect(screen.getByText('Performance metrics')).toBeInTheDocument()
    expect(screen.getByText('Historical consumption')).toBeInTheDocument()
    expect(screen.getByText('Request Count')).toBeInTheDocument()
    expect(screen.getByText('Remaining balance')).toBeInTheDocument()
  })

  it('shows lifetime consumption and lifetime request count, not range sums', async () => {
    await renderCards({
      data: [
        {
          created_at: 1_700_000_000 - 3600,
          quota: 100,
          count: 7,
          token_used: 200,
        },
      ],
    })
    // used_quota = 500000 units = $1; the single range row would be $0.0002.
    expect(screen.getByText('$1')).toBeInTheDocument()
    expect(screen.getByText(/Total requests: 4,321/)).toBeInTheDocument()
    expect(
      screen.getByText(/Consumed in the selected range:/)
    ).toBeInTheDocument()
  })

  it('derives average RPM from range requests divided by range minutes', async () => {
    await renderCards({
      data: [
        {
          created_at: 1_700_000_000 - 3600,
          quota: 0,
          count: 1440,
          token_used: 144_000,
        },
      ],
    })
    // 1440 requests over 1440 minutes -> 1 RPM; 144000 tokens -> 100 TPM.
    const card = screen
      .getByText('Performance metrics')
      .closest('[data-slot="metric-card"]')
    if (!card) throw new Error('metric card not found')
    expect(card).toHaveTextContent('1')
    expect(screen.getByText(/Avg TPM: 100/)).toBeInTheDocument()
  })

  it('marks an empty balance as insufficient', async () => {
    await renderCards({ remainQuota: 0, runwayUsage: 700 })
    expect(screen.getByText('Insufficient')).toBeInTheDocument()
    expect(screen.getByText(/Less than 1 day/)).toBeInTheDocument()
  })

  it('marks a healthy runway as normal with day estimate', async () => {
    // 700 quota vs 70 quota used over 7 days -> 70 days left.
    await renderCards({ remainQuota: 700, runwayUsage: 70 })
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText(/Approx. 70 days/)).toBeInTheDocument()
  })

  it('marks a short runway as low', async () => {
    // 40 quota vs 70 over 7 days -> 4 days left.
    await renderCards({ remainQuota: 40, runwayUsage: 70 })
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('shows no-consumption text when there is no recent usage', async () => {
    await renderCards({ remainQuota: 500, runwayUsage: 0 })
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText(/No usage records/)).toBeInTheDocument()
  })

  it('links to the wallet from the remaining-quota card', async () => {
    await renderCards({})
    const link = screen.getByRole('link', { name: 'My Wallet' })
    expect(link).toHaveAttribute('href', '/wallet')
  })
})
