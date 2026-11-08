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
  morphAt,
  readingAt,
  SECTION_MORPHS,
  sectionOpacity,
  sectionProgress,
  turnAt,
} from '../scroll-timeline'

describe('sectionProgress', () => {
  const centers = [400, 1400, 2400]

  it('returns the section index when that section is centered', () => {
    expect(sectionProgress(centers, 1400)).toBe(1)
  })

  it('interpolates linearly between two section centers', () => {
    expect(sectionProgress(centers, 1900)).toBeCloseTo(1.5)
  })

  it('clamps before the first and after the last section', () => {
    expect(sectionProgress(centers, 0)).toBe(0)
    expect(sectionProgress(centers, 9000)).toBe(2)
  })

  it('returns 0 when there are no sections', () => {
    expect(sectionProgress([], 500)).toBe(0)
  })
})

describe('morphAt', () => {
  it('holds each section form while that section is centered', () => {
    SECTION_MORPHS.forEach((morph, index) => {
      expect(morphAt(index)).toBeCloseTo(morph)
      // Small scroll offsets around the center do not reshape the sculpture.
      if (index < SECTION_MORPHS.length - 1) {
        expect(morphAt(index + 0.15)).toBeCloseTo(morph)
      }
    })
  })

  it('changes continuously between sections without jumps', () => {
    let previous = morphAt(0)
    for (let p = 0.01; p <= SECTION_MORPHS.length - 1; p += 0.01) {
      const value = morphAt(p)
      expect(Math.abs(value - previous)).toBeLessThan(0.08)
      previous = value
    }
  })

  it('falls back to the first form for invalid input', () => {
    expect(morphAt(Number.NaN)).toBe(SECTION_MORPHS[0])
  })
})

describe('section text visibility', () => {
  it('shows a section fully when centered and hides it halfway to the next', () => {
    expect(sectionOpacity(2, 2)).toBe(1)
    expect(sectionOpacity(2.5, 2)).toBe(0)
  })

  it('never shows two neighbouring sections at full opacity together', () => {
    for (let p = 0; p <= 5; p += 0.05) {
      const i = Math.floor(p)
      expect(
        sectionOpacity(p, i) + sectionOpacity(p, i + 1)
      ).toBeLessThanOrEqual(1.0001)
    }
  })

  it('dims the sculpture while reading and restores it between sections', () => {
    expect(readingAt(3)).toBe(1)
    expect(readingAt(3.5)).toBe(0)
  })
})

describe('turnAt', () => {
  it('leaves each composed section form unrotated at its center', () => {
    for (let index = 0; index <= 5; index++) {
      expect(turnAt(index)).toBeCloseTo(0)
    }
  })

  it('rotates the sculpture between sections as the page scrolls', () => {
    expect(Math.abs(turnAt(1.5))).toBeGreaterThan(0.1)
  })
})
