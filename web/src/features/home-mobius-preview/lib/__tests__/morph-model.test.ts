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
import { expect, it } from 'vitest'

import { createGlyphField } from '../glyph-field'
import {
  createMorphModels,
  morphWeights,
  sampleMorphModel,
  MORPH_DURATION,
} from '../morph-model'

it('flowing characters retain coverage across the whole band on desktop and mobile', () => {
  for (const compact of [false, true]) {
    const particles = createGlyphField(compact)
    for (const seconds of [0, 6, 13]) {
      const cells = new Uint16Array(16 * 12)
      for (const particle of particles) {
        const u = particle.phase + seconds * particle.speed
        const lap = Math.floor(u / (Math.PI * 2))
        const lane = lap % 2 ? -particle.lane : particle.lane
        const column = Math.floor(((u % (Math.PI * 2)) / (Math.PI * 2)) * 16)
        const row = Math.min(11, Math.floor((lane + 1) * 6))
        cells[column * 12 + row]++
      }
      // Fewer, looser lanes: every cell still carries data, with less stacking.
      expect(Math.min(...cells)).toBeGreaterThan(compact ? 5 : 8)
    }
  }
})

it('data travels in stable longitudinal lanes without a second overlapping surface', () => {
  const particles = createGlyphField()
  expect(particles.every((particle) => particle.lane > 0)).toBe(true)
  expect(
    Math.max(...particles.map((particle) => Math.abs(particle.jitterX)))
  ).toBeLessThan(1)
  expect(
    Math.max(...particles.map((particle) => Math.abs(particle.jitterY)))
  ).toBeLessThan(1)
})

it('each key model retains identical vertex correspondence and a half-twist seam', () => {
  const models = createMorphModels()
  expect(models).toHaveLength(6)
  expect(new Set(models.map((model) => model.length)).size).toBe(1)
  for (let key = 0; key < 6; key++) {
    const start = sampleMorphModel(models, key * 4, 0.3, 0.7)
    const opposite = sampleMorphModel(models, key * 4, 0.3, -0.7)
    const oneLap = sampleMorphModel(models, key * 4, 0.3 + Math.PI * 2, 0.7)
    const twoLaps = sampleMorphModel(models, key * 4, 0.3 + Math.PI * 4, 0.7)
    expect(
      Math.hypot(
        start.x - opposite.x,
        start.y - opposite.y,
        start.z - opposite.z
      )
    ).toBeGreaterThan(60)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(oneLap[axis]).toBeCloseTo(opposite[axis], 5)
      expect(twoLaps[axis]).toBeCloseTo(start[axis], 5)
    }
  }
})

it('every data-road model leaves a clear opening rather than filling its loop', () => {
  for (const model of createMorphModels()) {
    for (let vertex = 0; vertex < model.length; vertex += 6) {
      const radius = Math.hypot(
        (model[vertex] + model[vertex + 3]) / 2,
        (model[vertex + 1] + model[vertex + 4]) / 2,
        (model[vertex + 2] + model[vertex + 5]) / 2
      )
      const halfWidth =
        Math.hypot(
          model[vertex] - model[vertex + 3],
          model[vertex + 1] - model[vertex + 4],
          model[vertex + 2] - model[vertex + 5]
        ) / 2
      expect(halfWidth / radius).toBeLessThan(0.36)
    }
  }
})

it('interpolated models continue moving through a keyframe with matching velocities', () => {
  const models = createMorphModels()
  for (const time of [0, 4, 8, 12, 16, 20, MORPH_DURATION]) {
    const before = sampleMorphModel(models, time - 0.001, 1.4, 0.7)
    const at = sampleMorphModel(models, time, 1.4, 0.7)
    const after = sampleMorphModel(models, time + 0.001, 1.4, 0.7)
    const velocity =
      Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) /
      0.002
    expect(velocity).toBeGreaterThan(1)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(
        Math.abs(
          (at[axis] - before[axis]) / 0.001 - (after[axis] - at[axis]) / 0.001
        )
      ).toBeLessThan(0.2)
    }
  }
})

it('the completed sequence loops seamlessly and its weights preserve the model center', () => {
  const models = createMorphModels()
  expect(morphWeights(0)).toEqual([1, 0, 0, 0, 0, 0])
  for (const time of [0, 0.5, 4, 10, 23.99]) {
    expect(
      morphWeights(time).reduce((sum, weight) => sum + weight, 0)
    ).toBeCloseTo(1, 10)
    expect(sampleMorphModel(models, time, 2.3, -0.6)).toEqual(
      sampleMorphModel(models, time + MORPH_DURATION, 2.3, -0.6)
    )
  }
})

it('keyframes and the loop seam preserve acceleration as well as velocity', () => {
  const models = createMorphModels()
  const step = 0.002
  for (const time of [0, 4, 8, 12, 16, 20, 24]) {
    const points = [-2, -1, 0, 1, 2].map((offset) =>
      sampleMorphModel(models, time + offset * step, 1.4, 0.7)
    )
    for (const axis of ['x', 'y', 'z'] as const) {
      const incoming =
        (points[0][axis] - 2 * points[1][axis] + points[2][axis]) / step ** 2
      const outgoing =
        (points[2][axis] - 2 * points[3][axis] + points[4][axis]) / step ** 2
      expect(Math.abs(outgoing - incoming)).toBeLessThan(0.5)
    }
  }
})
