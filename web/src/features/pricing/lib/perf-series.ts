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
import type { PricingModel, PricingRateLimit } from '../types'

// ----------------------------------------------------------------------------
// Real performance series helpers (fed by the perf-metrics API)
// ----------------------------------------------------------------------------

export type LatencyTimePoint = {
  timestamp: string
  group: string
  ttft_ms: number
}

export type UptimeDayPoint = {
  date: string
  uptime_pct: number
  incidents: number
  outage_minutes: number
}

/** Aggregate uptime over the most recent 30 days. */
export function aggregateUptime(points: UptimeDayPoint[]): {
  uptime_pct: number
  incidents: number
  outage_minutes: number
} {
  if (points.length === 0) {
    return { uptime_pct: 0, incidents: 0, outage_minutes: 0 }
  }
  const incidents = points.reduce((s, p) => s + p.incidents, 0)
  const outageMinutes = points.reduce((s, p) => s + p.outage_minutes, 0)
  const totalMinutes = points.length * 1_440
  const uptimePct = ((totalMinutes - outageMinutes) / totalMinutes) * 100
  return {
    incidents,
    outage_minutes: outageMinutes,
    uptime_pct: Math.round(uptimePct * 1000) / 1000,
  }
}

export type RateLimit = PricingRateLimit

/** Return only rate limits explicitly supplied by the deployment catalog. */
export function buildRateLimits(model: PricingModel): RateLimit[] {
  return (model.rate_limits ?? [])
    .filter((limit) => limit && typeof limit.group === 'string')
    .map((limit) => ({
      group: limit.group,
      rpm: limit.rpm ?? null,
      tpm: limit.tpm ?? null,
      rpd: limit.rpd ?? null,
    }))
}

/** Format an integer rate-limit value compactly. */
export function formatRateLimit(value: number | null | undefined): string {
  if (value == null || value <= 0) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  }
  return value.toLocaleString()
}
