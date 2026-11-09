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
import { getEndOfDay, getStartOfDay, type TimeGranularity } from '@/lib/time'

import type { QuotaDataItem } from '../types'

export type DashboardRangeKey = '24h' | '7d' | '30d' | 'custom'

export interface ResolvedDashboardRange {
  start_timestamp: number
  end_timestamp: number
  granularity: TimeGranularity
}

const DAY_MS = 24 * 60 * 60 * 1000
const CUSTOM_RANGE_HOUR_MAX_DAYS = 2
const CUSTOM_RANGE_DAY_MAX_DAYS = 31

export function getGreetingKey(hour: number): string {
  if (hour < 5 || hour >= 18) return 'Good evening'
  if (hour < 12) return 'Good morning'
  return 'Good afternoon'
}

function granularityForSpanMs(spanMs: number): TimeGranularity {
  const days = spanMs / DAY_MS
  if (days <= CUSTOM_RANGE_HOUR_MAX_DAYS) return 'hour'
  if (days <= CUSTOM_RANGE_DAY_MAX_DAYS) return 'day'
  return 'week'
}

function rollingRange(start: Date, end: Date): ResolvedDashboardRange {
  return {
    start_timestamp: Math.floor(start.getTime() / 1000),
    end_timestamp: Math.floor(end.getTime() / 1000),
    granularity: granularityForSpanMs(end.getTime() - start.getTime()),
  }
}

export function resolveDashboardRange(
  key: DashboardRangeKey,
  now: Date,
  custom?: { start?: Date; end?: Date }
): ResolvedDashboardRange {
  let days = 30
  if (key === '24h') days = 1
  else if (key === '7d') days = 7
  if (key !== 'custom') {
    const start = new Date(now.getTime() - days * DAY_MS)
    return rollingRange(start, now)
  }

  const start = custom?.start ? getStartOfDay(custom.start) : getStartOfDay(now)
  const end = custom?.end ? getEndOfDay(custom.end) : now
  if (end.getTime() < start.getTime()) {
    return rollingRange(getStartOfDay(end), getEndOfDay(start))
  }
  return rollingRange(start, end)
}

/** Fixed 7-day window for the runway estimate; independent of the page range. */
export function getRunwayRange(now: Date): {
  start_timestamp: number
  end_timestamp: number
} {
  return {
    start_timestamp: Math.floor((now.getTime() - 7 * DAY_MS) / 1000),
    end_timestamp: Math.floor(now.getTime() / 1000),
  }
}

/**
 * Bucketed series for the mini trend under each metric card. The bucket unit
 * follows the range granularity; non-finite values collapse to zero.
 */
export function buildMetricTrend(
  data: QuotaDataItem[],
  field: 'quota' | 'count' | 'token_used',
  startSec: number,
  endSec: number,
  granularity: TimeGranularity
): number[] {
  let bucketSec = 86400
  if (granularity === 'hour') bucketSec = 3600
  else if (granularity === 'week') bucketSec = 7 * 86400
  const span = Math.max(bucketSec, endSec - startSec)
  const bucketCount = Math.min(48, Math.max(1, Math.ceil(span / bucketSec)))
  const buckets = Array.from({ length: bucketCount }, () => 0)

  for (const item of data) {
    const ts = Number(item.created_at) || 0
    if (ts < startSec || ts > endSec) continue
    const index = Math.min(
      bucketCount - 1,
      Math.floor((ts - startSec) / bucketSec)
    )
    buckets[index] += Number(item[field]) || 0
  }
  return buckets
}

export function sumUsageField(
  data: QuotaDataItem[],
  field: 'quota' | 'count' | 'token_used',
  startSec?: number
): number {
  return data.reduce((total, item) => {
    const ts = Number(item.created_at) || 0
    if (startSec != null && ts < startSec) return total
    return total + (Number(item[field]) || 0)
  }, 0)
}
