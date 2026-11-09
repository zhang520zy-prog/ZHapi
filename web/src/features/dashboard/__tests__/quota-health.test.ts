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
  formatRunwayDays,
  getQuotaHealth,
  getQuotaHealthBadgeVariant,
  getQuotaHealthLabelKey,
} from '../lib/quota-health'

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key

describe('getQuotaHealth', () => {
  it('reports insufficient when remaining quota is depleted', () => {
    expect(getQuotaHealth(0, 700)).toEqual({
      level: 'insufficient',
      daysLeft: 0,
    })
    expect(getQuotaHealth(-5, 700).level).toBe('insufficient')
  })

  it('reports insufficient when the runway is under three days', () => {
    // 7-day usage 700 -> 100/day; 250 left -> 2.5 days
    const health = getQuotaHealth(250, 700)
    expect(health.level).toBe('insufficient')
    expect(health.daysLeft).toBeCloseTo(2.5)
  })

  it('reports low when the runway is between three and seven days', () => {
    // 7-day usage 700 -> 100/day; 500 left -> 5 days
    const health = getQuotaHealth(500, 700)
    expect(health.level).toBe('low')
    expect(health.daysLeft).toBeCloseTo(5)
  })

  it('reports normal at exactly seven days of runway', () => {
    const health = getQuotaHealth(700, 700)
    expect(health.level).toBe('normal')
    expect(health.daysLeft).toBeCloseTo(7)
  })

  it('reports normal with no recent usage and hides the estimate', () => {
    expect(getQuotaHealth(100, 0)).toEqual({
      level: 'normal',
      daysLeft: null,
    })
  })

  it('maps levels to badge variants and label keys', () => {
    expect(getQuotaHealthBadgeVariant('insufficient')).toBe('danger')
    expect(getQuotaHealthBadgeVariant('low')).toBe('warning')
    expect(getQuotaHealthBadgeVariant('normal')).toBe('success')
    expect(getQuotaHealthLabelKey('insufficient')).toBe('Insufficient')
    expect(getQuotaHealthLabelKey('low')).toBe('Low')
    expect(getQuotaHealthLabelKey('normal')).toBe('Normal')
  })
})

describe('formatRunwayDays', () => {
  it('returns the no-usage text when the estimate is unavailable', () => {
    expect(formatRunwayDays(null, t)).toBe('No usage records')
  })

  it('returns the sub-day text for runways under one day', () => {
    expect(formatRunwayDays(0.4, t)).toBe('Less than 1 day')
  })

  it('caps large estimates at 999+ days', () => {
    expect(formatRunwayDays(5000, t)).toBe('999+ days')
  })

  it('floors normal estimates into whole days', () => {
    expect(formatRunwayDays(5.9, t)).toContain('5')
  })
})
