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
  AVAILABILITY_LOW_THRESHOLD,
  AVAILABILITY_NORMAL_THRESHOLD,
  getAvailabilityLevel,
} from '../availability'

describe('getAvailabilityLevel', () => {
  it('marks rates at or above the normal threshold as normal', () => {
    expect(getAvailabilityLevel(100)).toBe('normal')
    expect(getAvailabilityLevel(AVAILABILITY_NORMAL_THRESHOLD)).toBe('normal')
    expect(getAvailabilityLevel(99.5)).toBe('normal')
  })

  it('marks rates at or above the low threshold but below normal as low', () => {
    expect(getAvailabilityLevel(AVAILABILITY_LOW_THRESHOLD)).toBe('low')
    expect(getAvailabilityLevel(97)).toBe('low')
    expect(getAvailabilityLevel(98.99)).toBe('low')
  })

  it('marks rates below the low threshold as critical', () => {
    expect(getAvailabilityLevel(94.99)).toBe('critical')
    expect(getAvailabilityLevel(0)).toBe('critical')
  })

  it('marks missing or invalid data as none', () => {
    expect(getAvailabilityLevel(undefined)).toBe('none')
    expect(getAvailabilityLevel(null)).toBe('none')
    expect(getAvailabilityLevel(Number.NaN)).toBe('none')
    expect(getAvailabilityLevel(-1)).toBe('none')
    expect(getAvailabilityLevel(101)).toBe('none')
  })
})
