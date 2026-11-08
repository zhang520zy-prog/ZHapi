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
  autoplayAt,
  dollyAt,
  OCEAN,
  OCEAN_INDEX,
  whirlAngle,
  posesFor,
  sectionReveal,
  SHAPE_COUNT,
  shapePoint,
  shapeWeights,
  stageAt,
  tangentAngle,
  type Vec3,
} from '../scroll-morph'

const point = (): Vec3 => ({ x: 0, y: 0, z: 0 })

describe('shared parameter domain', () => {
  it('every shape maps a fixed (u, v) to one finite, bounded point', () => {
    for (let shape = 0; shape < SHAPE_COUNT; shape++) {
      for (let u = 0; u < 1; u += 0.05) {
        for (const v of [-1, -0.3, 0, 0.6, 1]) {
          const p = shapePoint(shape, u, v, 1.5, point())
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true)
          expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(
            shape === OCEAN_INDEX ? 14 : 4
          )
        }
      }
    }
  })

  it('distinct glyph slots on the ring land on distinct points in the next shapes', () => {
    for (let shape = 1; shape < SHAPE_COUNT; shape++) {
      const a = shapePoint(shape, 0.2, -0.5, 0, point())
      const b = shapePoint(shape, 0.2, 0.5, 0, point())
      const c = shapePoint(shape, 0.35, -0.5, 0, point())
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.05)
      expect(Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)).toBeGreaterThan(0.05)
    }
  })

  it('a ring lane closes on itself so flowing glyphs never jump at the seam', () => {
    const start = shapePoint(0, 0, 0.6, 0, point())
    const end = shapePoint(0, 0.99999, 0.6, 0, point())
    expect(
      Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z)
    ).toBeLessThan(1e-3)
  })
})

describe('scroll stage', () => {
  const centers = [450, 1500, 2700, 4100, 5600]

  it('reading position before the first section clamps to the hero, after the last to the closing', () => {
    expect(stageAt(0, centers)).toBe(0)
    expect(stageAt(99999, centers)).toBe(4)
  })

  it('each section centre is its integer stage', () => {
    centers.forEach((center, index) =>
      expect(stageAt(center, centers)).toBeCloseTo(index)
    )
  })

  it('shape weights sum to 1 and the next shape gains monotonically with scroll', () => {
    let previous = -1
    for (let stage = 0; stage <= 4; stage += 0.02) {
      const weights = shapeWeights(stage)
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
      const segment = Math.min(3, Math.floor(stage))
      const progress = segment + weights[segment + 1]
      expect(progress).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = progress
    }
  })

  it('a section held at its centre shows exactly its own shape', () => {
    for (let stage = 0; stage < SHAPE_COUNT; stage++) {
      expect(shapeWeights(stage)[stage]).toBeCloseTo(1)
    }
  })

  it('the camera moves into the vortex steadily, then follows the burst and pulls back', () => {
    const poses = posesFor(false)
    // From the DNA into the vortex the push only grows, so the shot never speeds up and backs off.
    let previous = dollyAt(2, poses)
    for (let stage = 2; stage <= 3; stage += 0.02) {
      const dolly = dollyAt(stage, poses)
      expect(dolly).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = dolly
    }
    // Leaving the vortex the camera rides the burst forward, then ends pulled back over the sea.
    expect(dollyAt(3.45, poses)).toBeGreaterThan(dollyAt(3, poses))
    expect(dollyAt(4, poses)).toBeLessThan(dollyAt(3, poses))
  })
})

describe('glyph orientation', () => {
  it('the flow direction turns continuously along a ring lane', () => {
    let previous: number | null = null
    for (let u = 0; u < 1; u += 0.004) {
      const a = shapePoint(0, u, 0.4, 0, point())
      const b = shapePoint(0, u + 0.002, 0.4, 0, point())
      const angle = tangentAngle(a, b)
      if (previous !== null) {
        let delta = Math.abs(angle - previous)
        delta = Math.min(delta, Math.PI * 2 - delta)
        expect(delta).toBeLessThan(0.2)
      }
      previous = angle
    }
  })
})

describe('section copy', () => {
  it('a section filling the viewport is fully readable', () => {
    expect(sectionReveal(0, 900, 900).reveal).toBeCloseTo(1)
  })

  it('a section a full viewport away is hidden', () => {
    expect(sectionReveal(1800, 900, 900).reveal).toBeCloseTo(0)
    expect(sectionReveal(-1800, 900, 900).reveal).toBeCloseTo(0)
  })

  it('a section taller than the viewport stays readable while any part of its middle is on screen', () => {
    expect(sectionReveal(-400, 1500, 900).reveal).toBeCloseTo(1)
  })
})

describe('data ocean', () => {
  it('away from the abyss the sea is stacked sheets, each deeper than the one above', () => {
    const layerDepth = (layer: number) => {
      let sum = 0
      let count = 0
      for (let u = 0.01; u < 0.3; u += 0.01) {
        const v = ((layer + 0.5) / OCEAN.layers) * 2 - 1
        sum += shapePoint(OCEAN_INDEX, u, v, 0, point()).y
        count++
      }
      return sum / count
    }
    for (let layer = 1; layer < OCEAN.layers; layer++) {
      expect(layerDepth(layer)).toBeGreaterThan(
        layerDepth(layer - 1) + OCEAN.layerGap * 0.5
      )
    }
  })

  it('glyphs near the abyss sink below the sea toward its mouth', () => {
    let deepest = OCEAN.sea
    for (let u = 0; u < 1; u += 0.002) {
      for (let v = -1; v <= 1; v += 0.05) {
        deepest = Math.max(deepest, shapePoint(OCEAN_INDEX, u, v, 0, point()).y)
      }
    }
    // The funnel goes well below even the deepest sheet.
    expect(deepest).toBeGreaterThan(
      OCEAN.sea + (OCEAN.layers - 1) * OCEAN.layerGap + 0.5
    )
  })
})

describe('autoplay timeline', () => {
  const stops = [
    { top: 0, hold: 2, move: 3 },
    { top: 900, hold: 2, move: 3 },
    { top: 2000, hold: 1, move: 1 },
  ]

  it('rests at each stop, glides between them and ends at the last stop', () => {
    expect(autoplayAt(1, stops)).toEqual({ top: 0, done: false })
    const mid = autoplayAt(3.5, stops)
    expect(mid.top).toBeGreaterThan(0)
    expect(mid.top).toBeLessThan(900)
    expect(autoplayAt(6, stops)).toEqual({ top: 900, done: false })
    expect(autoplayAt(99, stops)).toEqual({ top: 2000, done: true })
  })

  it('never moves backward', () => {
    let previous = -1
    for (let seconds = 0; seconds < 12; seconds += 0.05) {
      const { top } = autoplayAt(seconds, stops)
      expect(top).toBeGreaterThanOrEqual(previous)
      previous = top
    }
  })
})

describe('whirlpool', () => {
  it('keeps its spiral shape however long it plays: it only rotates as one body', () => {
    const shape = (t: number) => whirlAngle(0, 0.5, t) - whirlAngle(0, 3, t)
    for (const t of [0, 10, 60, 600]) expect(shape(t)).toBeCloseTo(shape(0), 9)
  })
})
