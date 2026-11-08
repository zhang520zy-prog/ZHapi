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
  archPath,
  blendAt,
  pillarPath,
  samplePath,
  SHAPES,
  shapePoint,
  terminalPath,
  type Box,
  type FlowLayout,
  type Sample,
} from '../flow-shapes'

const b = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
})

function layout(progress = 0): FlowLayout {
  return {
    width: 1280,
    height: 800,
    progress,
    hero: {
      section: b(0, 0, 1280, 800),
      head: b(340, 200, 600, 160),
      body: b(360, 420, 560, 220),
    },
    pillar: b(900, 100, 80, 900),
    models: [b(1020, 200, 190, 56), b(1020, 420, 190, 56)],
    modelLit: [1, 0],
    terminal: b(700, 260, 480, 300),
    timeline: b(660, 120, 2, 900),
    nodes: [b(640, 140, 42, 42)],
    nodeActive: [1],
    ring: b(360, 200, 560, 400),
    copy: [],
  }
}

const sample = (): Sample => ({ x: 0, y: 0, z: 0, alpha: 0 })
const point = { x: 0, y: 0, tx: 0, ty: 0 }

describe('section forms follow the page layout', () => {
  it('arches over the hero title and lands below the hero actions', () => {
    const l = layout()
    const path = archPath(l)
    let apex = Infinity
    for (let s = 0; s <= 1; s += 0.01)
      apex = Math.min(apex, samplePath(path, s, point).y)
    // The top of the arch sits just under the headline, not on top of it.
    expect(apex).toBeGreaterThan(l.hero.head.top + l.hero.head.height)
    expect(samplePath(path, 0, point).y).toBeGreaterThan(
      l.hero.body.top + l.hero.body.height
    )
  })

  it('moves with the page: shifting the layout shifts the form by the same amount', () => {
    const a = layout()
    const moved = layout()
    moved.pillar = { ...a.pillar, top: a.pillar.top - 300 }
    const p0 = samplePath(pillarPath(a), 0.5, { ...point }).y
    const p1 = samplePath(pillarPath(moved), 0.5, { ...point }).y
    expect(p0 - p1).toBeCloseTo(300, 0)
  })

  it('feeds the terminal through its title bar', () => {
    const l = layout()
    const end = samplePath(terminalPath(l), 1, point)
    expect(end.x).toBeGreaterThan(l.terminal.left)
    expect(end.x).toBeLessThan(l.terminal.left + l.terminal.width)
    expect(Math.abs(end.y - (l.terminal.top + 22))).toBeLessThan(1)
  })

  it('places model branches only toward lit models', () => {
    const l = layout()
    const out = sample()
    const lit = shapePoint(
      'pillar',
      l,
      {},
      { lane: 0, jitter: 0, branch: 0 },
      0.15,
      0,
      out
    ).alpha
    const dark = shapePoint(
      'pillar',
      l,
      {},
      { lane: 0, jitter: 0, branch: 1 },
      0.15,
      0,
      sample()
    ).alpha
    expect(lit).toBeGreaterThan(dark)
  })

  it('produces finite points for every form', () => {
    const l = layout()
    for (const shape of SHAPES) {
      for (let s = 0; s <= 1; s += 0.1) {
        const out = shapePoint(
          shape,
          l,
          {},
          { lane: 3, jitter: 0.1, branch: -1 },
          s,
          1.2,
          sample()
        )
        expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true)
      }
    }
  })
})

describe('handover between forms', () => {
  it('starts with the current form and ends with the next one', () => {
    expect(blendAt(0, 0.5)).toBe(0)
    expect(blendAt(1, 0.5)).toBe(1)
  })

  it('sweeps along the cable instead of changing everywhere at once', () => {
    expect(blendAt(0.45, 0)).toBeGreaterThan(blendAt(0.45, 1))
  })
})
