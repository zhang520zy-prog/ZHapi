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

/**
 * Remaining-quota runway health (F2.3).
 *
 * The estimate always uses the average consumption of the most recent seven
 * days, regardless of the dashboard time range, so the status does not jump
 * when the range selector changes.
 *   < 3 days left  -> insufficient
 *   < 7 days left  -> low
 *   otherwise      -> normal
 */
export type QuotaHealthLevel = 'insufficient' | 'low' | 'normal'

export interface QuotaHealth {
  level: QuotaHealthLevel
  /** Estimated days remaining; null when there is no recent usage. */
  daysLeft: number | null
}

export const RUNWAY_CRITICAL_DAYS = 3
export const RUNWAY_LOW_DAYS = 7
export const RUNWAY_DISPLAY_MAX = 999

export function getQuotaHealth(
  remainQuota: number,
  last7DaysUsage: number
): QuotaHealth {
  const quota = Math.max(0, Number(remainQuota) || 0)
  const usage = Math.max(0, Number(last7DaysUsage) || 0)

  if (quota <= 0) return { level: 'insufficient', daysLeft: 0 }
  if (usage <= 0) return { level: 'normal', daysLeft: null }

  const daysLeft = quota / (usage / 7)
  if (daysLeft < RUNWAY_CRITICAL_DAYS) {
    return { level: 'insufficient', daysLeft }
  }
  if (daysLeft < RUNWAY_LOW_DAYS) return { level: 'low', daysLeft }
  return { level: 'normal', daysLeft }
}

export function getQuotaHealthLabelKey(level: QuotaHealthLevel): string {
  if (level === 'insufficient') return 'Insufficient'
  if (level === 'low') return 'Low'
  return 'Normal'
}

export function getQuotaHealthBadgeVariant(
  level: QuotaHealthLevel
): 'danger' | 'warning' | 'success' {
  if (level === 'insufficient') return 'danger'
  if (level === 'low') return 'warning'
  return 'success'
}

/** "约 N 天" text for the card description; caps at 999+ and handles no-data. */
export function formatRunwayDays(
  daysLeft: number | null,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (daysLeft === null) return t('No usage records')
  if (daysLeft < 1) return t('Less than 1 day')
  if (daysLeft > RUNWAY_DISPLAY_MAX) return t('999+ days')
  return t('Approx. {{days}} days', { days: Math.floor(daysLeft) })
}
