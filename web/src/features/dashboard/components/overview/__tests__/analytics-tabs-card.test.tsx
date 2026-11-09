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

import { AnalyticsTabsCard } from '../analytics-tabs-card'

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => null,
}))

vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: true }),
}))

vi.mock('../../users/user-charts', () => ({
  UserCharts: () => null,
}))

vi.mock('../../flow/flow-charts', () => ({
  FlowCharts: () => null,
}))

function renderTabs(isAdmin: boolean, dataLength = 0) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const end = 1_700_000_000
  const data = Array.from({ length: dataLength }, (_, index) => ({
    created_at: end - (index + 1) * 3600,
    quota: 10,
    count: 1,
    token_used: 20,
    model_name: `m-${index}`,
  }))
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsTabsCard
        data={data}
        loading={false}
        granularity='hour'
        isAdmin={isAdmin}
        rangeStartSec={end - 86400}
        rangeEndSec={end}
        flowFilters={{
          start_timestamp: new Date((end - 86400) * 1000),
          end_timestamp: new Date(end * 1000),
          time_granularity: 'hour',
          username: '',
        }}
        userTimeRange={{ start_timestamp: end - 86400, end_timestamp: end }}
      />
    </QueryClientProvider>
  )
}

describe('analytics tabs card', () => {
  it('hides user analytics and flow tabs from regular users', () => {
    renderTabs(false)
    expect(
      screen.getByRole('tab', { name: 'Quota Distribution' })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Call Trend' })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Call Count Ranking' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'User analytics' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Traffic analysis' })
    ).not.toBeInTheDocument()
  })

  it('shows user analytics and flow tabs to admins', () => {
    renderTabs(true)
    expect(
      screen.getByRole('tab', { name: 'User analytics' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Traffic analysis' })
    ).toBeInTheDocument()
  })

  it('shows an empty state instead of a chart when there is no data', () => {
    renderTabs(false, 0)
    expect(screen.getAllByText('No data available').length).toBeGreaterThan(0)
  })

  it('shows range total and peak in the header actions', () => {
    renderTabs(false, 24)
    expect(screen.getByText(/Total:/)).toBeInTheDocument()
    expect(screen.getByText(/Peak:/)).toBeInTheDocument()
  })
})
