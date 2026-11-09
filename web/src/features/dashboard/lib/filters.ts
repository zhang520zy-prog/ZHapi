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
  DEFAULT_TIME_GRANULARITY,
  TIME_RANGE_BY_GRANULARITY,
} from '@/features/dashboard/constants'
import type { TimeGranularity } from '@/lib/time'

export function getDefaultDays(granularity?: TimeGranularity): number {
  return TIME_RANGE_BY_GRANULARITY[granularity ?? DEFAULT_TIME_GRANULARITY]
}

export function buildQueryParams(
  timeRange: { start_timestamp: number; end_timestamp: number },
  filters?: { time_granularity?: TimeGranularity; username?: string }
): {
  start_timestamp: number
  end_timestamp: number
  default_time: string
  username?: string
} {
  return {
    ...timeRange,
    default_time: filters?.time_granularity ?? DEFAULT_TIME_GRANULARITY,
    ...(filters?.username && { username: filters.username }),
  }
}
