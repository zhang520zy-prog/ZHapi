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
  mobiusPoint,
  mobiusTangent,
  waterfallPoint,
  fitScene,
} from '../mobius-geometry'
import { ribbonPoint, ribbonPose, ribbonTangent } from '../ribbon-shape'

describe('Möbius data surface', () => {
  it('joins the opposite edge after one revolution without a visible seam', () => {
    const end = mobiusPoint(Math.PI * 2, 50)
    const start = mobiusPoint(0, -50)
    expect(start.x).toBe(190)
    expect(end.x).toBeCloseTo(start.x)
    expect(end.y).toBeCloseTo(start.y)
    expect(end.z).toBeCloseTo(start.z)
  })

  it('returns a circulating byte to the same point after two revolutions', () => {
    const end = mobiusPoint(Math.PI * 4, 50)
    const start = mobiusPoint(0, 50)
    expect(start.x).toBe(290)
    expect(end.x).toBeCloseTo(start.x)
    expect(end.y).toBeCloseTo(start.y)
    expect(end.z).toBeCloseTo(start.z)
  })

  it('fits a narrow screen without stretching the data sculpture', () => {
    const frame = fitScene(390, 370)
    expect(frame.scale).toBeCloseTo(0.325)
    expect(frame.x).toBe(0)
    expect(frame.y).toBeGreaterThan(0)
    expect(1200 * frame.scale).toBeLessThanOrEqual(390)
    expect(650 * frame.scale).toBeLessThanOrEqual(370)
  })

  it('the waterfall reaches the ring in the direction of its circulating data', () => {
    const outlet = { x: 0, y: -700, z: 0 }
    const entry = mobiusPoint(0, 50)
    const tangent = mobiusTangent(0, 50)
    expect(tangent.x).toBeCloseTo(0)
    expect(tangent.y).toBe(290)
    expect(tangent.z).toBe(25)
    expect(waterfallPoint(0, outlet, entry, tangent)).toEqual(outlet)
    expect(waterfallPoint(1, outlet, entry, tangent)).toEqual(entry)
    const approaching = waterfallPoint(0.99999, outlet, entry, tangent)
    const dy = entry.y - approaching.y
    expect(dy).toBeGreaterThan(0)
    expect(Math.abs((entry.x - approaching.x) / dy)).toBeLessThan(0.001)
    expect((entry.z - approaching.z) / dy).toBeCloseTo(25 / 290, 3)
  })

  it('data keeps its travel direction across the half-twist seam', () => {
    const before = mobiusTangent(Math.PI * 2, 50)
    const after = mobiusTangent(0, -50)
    expect(before.x).toBeCloseTo(after.x)
    expect(before.y).toBeCloseTo(after.y)
    expect(before.z).toBeCloseTo(after.z)
  })

  it('the top-fed waterfall descends out of the cable and turns along the ring', () => {
    const outlet = { x: 0, y: -700, z: 0 }
    const entry = mobiusPoint(-Math.PI / 2, 0)
    const tangent = mobiusTangent(-Math.PI / 2, 0)
    const leaving = waterfallPoint(0.00001, outlet, entry, tangent)
    const approaching = waterfallPoint(0.99999, outlet, entry, tangent)

    expect(leaving.y).toBeGreaterThan(outlet.y)
    expect(Math.abs(leaving.x - outlet.x)).toBeLessThan(0.000001)
    expect(entry.y).toBe(-240)
    expect(entry.x - approaching.x).toBeGreaterThan(0)
    expect(Math.abs(entry.y - approaching.y)).toBeLessThan(0.000001)
    const arrival = waterfallPoint(1, outlet, entry, tangent)
    expect(arrival.x).toBeCloseTo(0, 10)
    expect(arrival.y).toBe(-240)
    expect(arrival.z).toBeCloseTo(0, 10)
  })
})

describe('Morphing Möbius ribbon', () => {
  const progressSteps = [0, 0.2, 0.45, 0.7, 1, 1.3, 1.6, 1.9, 2.2, 2.6, 3]

  it('preserves a half twist, rather than a circular band, through every morph', () => {
    for (const progress of progressSteps) {
      const pose = ribbonPose(progress)
      const start = ribbonPoint(0.7, 0.8, pose)
      const opposite = ribbonPoint(0.7, -0.8, pose)
      const oneLap = ribbonPoint(0.7 + Math.PI * 2, 0.8, pose)
      const twoLaps = ribbonPoint(0.7 + Math.PI * 4, 0.8, pose)
      expect(
        Math.hypot(
          start.x - opposite.x,
          start.y - opposite.y,
          start.z - opposite.z
        )
      ).toBeGreaterThan(pose.halfWidth)
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(oneLap[axis]).toBeCloseTo(opposite[axis], 8)
        expect(twoLaps[axis]).toBeCloseTo(start[axis], 8)
      }
    }
  })

  it('keeps circulating characters moving in the same direction across the seam', () => {
    for (const progress of progressSteps) {
      const pose = ribbonPose(progress)
      const before = ribbonTangent(Math.PI * 2, 0.9, pose)
      const after = ribbonTangent(0, -0.9, pose)
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(before[axis]).toBeCloseTo(after[axis], 6)
      }
    }
  })

  it('turns the waterfall along the deformed ribbon without a crosswise join', () => {
    for (const progress of progressSteps) {
      const pose = ribbonPose(progress)
      const outlet = { x: 0, y: -700, z: 0 }
      const entry = ribbonPoint(-Math.PI / 2, 0.6, pose)
      const tangent = ribbonTangent(-Math.PI / 2, 0.6, pose)
      const before = waterfallPoint(0.99999, outlet, entry, tangent)
      const arrival = waterfallPoint(1, outlet, entry, tangent)
      expect(arrival).toEqual(entry)
      const delta = {
        x: entry.x - before.x,
        y: entry.y - before.y,
        z: entry.z - before.z,
      }
      const alignment =
        (delta.x * tangent.x + delta.y * tangent.y + delta.z * tangent.z) /
        (Math.hypot(delta.x, delta.y, delta.z) *
          Math.hypot(tangent.x, tangent.y, tangent.z))
      expect(alignment).toBeGreaterThan(0.99999)
    }
  })

  it('does not jump at the boundaries between chapter compositions', () => {
    for (const progress of [0.45, 1, 1.6, 2.2]) {
      const before = ribbonPoint(1.4, 0.9, ribbonPose(progress - 0.00001))
      const after = ribbonPoint(1.4, 0.9, ribbonPose(progress + 0.00001))
      expect(
        Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z)
      ).toBeLessThan(0.0001)
    }
  })
})
