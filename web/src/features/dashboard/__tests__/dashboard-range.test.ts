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
import { describe, expect, it } from 'vitest'

import {
  buildMetricTrend,
  getGreetingKey,
  getRunwayRange,
  resolveDashboardRange,
  sumUsageField,
} from '../lib/dashboard-range'
import type { QuotaDataItem } from '../types'

const NOW = new Date('2026-11-09T15:30:00')
const DAY_MS = 86_400_000

describe('getGreetingKey', () => {
  it('greets by local hour at every boundary', () => {
    // Rules: 05:00-11:59 morning, 12:00-17:59 afternoon, otherwise evening.
    expect(getGreetingKey(4)).toBe('Good evening')
    expect(getGreetingKey(5)).toBe('Good morning')
    expect(getGreetingKey(11)).toBe('Good morning')
    expect(getGreetingKey(12)).toBe('Good afternoon')
    expect(getGreetingKey(17)).toBe('Good afternoon')
    expect(getGreetingKey(18)).toBe('Good evening')
    expect(getGreetingKey(0)).toBe('Good evening')
    expect(getGreetingKey(23)).toBe('Good evening')
  })
})

describe('resolveDashboardRange', () => {
  it('uses hour granularity for the 24h rolling window', () => {
    const range = resolveDashboardRange('24h', NOW)
    expect(range.granularity).toBe('hour')
    expect(range.end_timestamp).toBe(Math.floor(NOW.getTime() / 1000))
    expect(range.end_timestamp - range.start_timestamp).toBeCloseTo(
      24 * 3600,
      -1
    )
  })

  it('uses day granularity for 7d and 30d windows', () => {
    expect(resolveDashboardRange('7d', NOW).granularity).toBe('day')
    expect(resolveDashboardRange('30d', NOW).granularity).toBe('day')
  })

  it('normalizes custom ranges to day bounds and derives granularity', () => {
    const short = resolveDashboardRange('custom', NOW, {
      start: new Date('2026-11-08T10:00:00'),
      end: new Date('2026-11-09T18:00:00'),
    })
    expect(short.granularity).toBe('hour')
    expect(short.start_timestamp * 1000).toBe(
      new Date('2026-11-08T00:00:00').getTime()
    )

    const long = resolveDashboardRange('custom', NOW, {
      start: new Date('2026-08-01T10:00:00'),
      end: new Date('2026-11-09T18:00:00'),
    })
    expect(long.granularity).toBe('week')
  })

  it('swaps inverted custom bounds instead of producing an empty range', () => {
    const range = resolveDashboardRange('custom', NOW, {
      start: new Date('2026-11-09T12:00:00'),
      end: new Date('2026-11-01T12:00:00'),
    })
    expect(range.end_timestamp).toBeGreaterThan(range.start_timestamp)
  })
})

describe('getRunwayRange', () => {
  it('always returns a fixed seven-day window', () => {
    const range = getRunwayRange(NOW)
    expect(range.end_timestamp - range.start_timestamp).toBeCloseTo(
      (7 * DAY_MS) / 1000,
      -1
    )
  })
})

describe('buildMetricTrend', () => {
  const start = Math.floor((NOW.getTime() - 24 * 3600 * 1000) / 1000)
  const end = Math.floor(NOW.getTime() / 1000)

  it('buckets quota values within the range only', () => {
    const data: QuotaDataItem[] = [
      { created_at: start + 60, quota: 10, count: 2 },
      { created_at: start + 3600, quota: 5, count: 1 },
      { created_at: start - 5000, quota: 99, count: 9 },
    ]
    const trend = buildMetricTrend(data, 'quota', start, end, 'hour')
    expect(trend).toHaveLength(24)
    expect(trend[0]).toBe(10)
    expect(trend[1]).toBe(5)
    expect(trend.reduce((a, b) => a + b, 0)).toBe(15)
  })

  it('returns an all-zero series for empty data', () => {
    const trend = buildMetricTrend([], 'count', start, end, 'day')
    expect(trend.every((v) => v === 0)).toBe(true)
  })
})

describe('sumUsageField', () => {
  it('sums only items at or after the cutoff', () => {
    const data: QuotaDataItem[] = [
      { created_at: 1000, quota: 3 },
      { created_at: 5000, quota: 7 },
    ]
    expect(sumUsageField(data, 'quota', 4000)).toBe(7)
    expect(sumUsageField(data, 'quota')).toBe(10)
  })
})
