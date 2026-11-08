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
  blendAt,
  SHAPES,
  shapePoint,
  smooth,
  type FlowLayout,
  type PathCache,
  type Sample,
  type StreamSpec,
} from './flow-shapes'

export type FlowTheme = 'dark' | 'light'

export interface FlowEngine {
  /** Draw one frame for the current layout; `dt` advances the data flow. */
  render: (layout: FlowLayout, dt: number) => void
  setTheme: (theme: FlowTheme) => void
  resize: () => void
  destroy: () => void
}

// Scheme C's glyph set and palette logic: Latin, kana, Han, numerals, symbols.
const GLYPHS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '零壹数链流源光云网模态联接序元语界讯算' +
  'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ∞∆∑±×÷<>[]{}⟐◈◇○△□:;=+*'
const CELL = 64
const COLUMNS = 24
const ROWS = Math.ceil(GLYPHS.length / COLUMNS)
const SHADES = 7
const PALETTES: Record<FlowTheme, string[]> = {
  dark: [
    '#123a30',
    '#18594a',
    '#1f7d66',
    '#3fae90',
    '#80d7bb',
    '#b6ecd9',
    '#effcf6',
  ],
  light: [
    '#c4ddd1',
    '#9cc6b2',
    '#6aa88c',
    '#3b8a6b',
    '#1d6f55',
    '#126555',
    '#083a2f',
  ],
}
// The cable draws itself in quickly; the hero copy is readable from the first frame.
const REVEAL_SECONDS = 1.6

interface Stream {
  phase: number
  speed: number
  length: number
  spacing: number
  size: number
  glyph: number
  brightness: number
  lane: number
  jitter: number
  model: number
  node: number
}

export function createFlowEngine(
  canvas: HTMLCanvasElement,
  options: { theme: FlowTheme; skipIntro: boolean; streams?: number }
): FlowEngine | null {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return null
  const ctx = context
  let width = 1
  let height = 1
  let pixelRatio = 1
  let time = options.skipIntro ? REVEAL_SECONDS : 0
  let disposed = false

  let seed = 52013
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const streams: Stream[] = Array.from(
    { length: options.streams ?? 460 },
    (_, index) => ({
      phase: random(),
      speed: 0.03 + random() * 0.03,
      length: 9 + Math.floor(random() * 13),
      spacing: 0.006 + random() * 0.004,
      size: 11 + random() ** 2 * 7,
      glyph: Math.floor(random() * GLYPHS.length),
      brightness: 0.6 + random() * 0.4,
      lane: index % 8,
      jitter: (random() - 0.5) * 0.35,
      // A third of the cable feeds the model cells, a quarter orbits the feature nodes.
      model: index % 3 === 0 ? Math.floor(index / 3) % 5 : -1,
      node: index % 4 === 1 ? Math.floor(index / 4) % 3 : -1,
    })
  )

  const atlas = document.createElement('canvas')
  atlas.width = COLUMNS * CELL
  atlas.height = ROWS * CELL * SHADES
  const atlasContext = atlas.getContext('2d')
  if (!atlasContext) return null
  const atlasCtx = atlasContext
  function paintAtlas(theme: FlowTheme) {
    atlasCtx.clearRect(0, 0, atlas.width, atlas.height)
    atlasCtx.font =
      '44px "SFMono-Regular", Menlo, "Hiragino Kaku Gothic ProN", "PingFang SC", monospace'
    atlasCtx.textAlign = 'center'
    atlasCtx.textBaseline = 'middle'
    PALETTES[theme].forEach((color, shade) => {
      atlasCtx.fillStyle = color
      for (let glyph = 0; glyph < GLYPHS.length; glyph++) {
        atlasCtx.fillText(
          GLYPHS[glyph],
          (glyph % COLUMNS) * CELL + CELL / 2,
          (Math.floor(glyph / COLUMNS) + shade * ROWS) * CELL + CELL / 2
        )
      }
    })
    canvas.dataset.theme = theme
  }
  paintAtlas(options.theme)

  const specA: StreamSpec = { lane: 0, jitter: 0, branch: -1 }
  const specB: StreamSpec = { lane: 0, jitter: 0, branch: -1 }
  const a: Sample = { x: 0, y: 0, z: 0, alpha: 0 }
  const b: Sample = { x: 0, y: 0, z: 0, alpha: 0 }

  function specFor(
    shape: (typeof SHAPES)[number],
    stream: Stream,
    out: StreamSpec
  ) {
    out.lane = stream.lane
    out.jitter = stream.jitter
    out.branch =
      shape === 'pillar'
        ? stream.model
        : shape === 'timeline'
          ? stream.node
          : -1
    return out
  }

  // Glyphs passing behind live copy thin out so text stays readable.
  function readFade(layout: FlowLayout, x: number, y: number) {
    let fade = 1
    for (const box of layout.copy) {
      const dx = Math.max(box.left - x, 0, x - box.left - box.width)
      const dy = Math.max(box.top - y, 0, y - box.top - box.height)
      if (dx > 40 || dy > 40) continue
      fade = Math.min(fade, 0.3 + 0.7 * smooth(Math.hypot(dx, dy) / 40))
    }
    return fade
  }

  function render(layout: FlowLayout, dt: number) {
    if (disposed) return
    time += dt
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const last = SHAPES.length - 1
    const p = Math.max(0, Math.min(last, layout.progress))
    const index = Math.min(last, Math.floor(p))
    const t = p - index
    const shapeA = SHAPES[index]
    const shapeB = SHAPES[Math.min(last, index + 1)]
    // Paths follow the live layout, so they are rebuilt from fresh boxes each frame.
    const cacheA: PathCache = {}
    const cacheB: PathCache = shapeA === shapeB ? cacheA : {}
    const reveal = smooth(time / REVEAL_SECONDS)
    const compact = width < 720

    for (const stream of streams) {
      const head = (stream.phase + time * stream.speed) % 1
      specFor(shapeA, stream, specA)
      specFor(shapeB, stream, specB)
      for (let k = 0; k < stream.length; k++) {
        let s = head - k * stream.spacing
        if (s < 0) s += 1
        // The opening draws the cable from its left foot to its right foot.
        if (s > reveal * 1.05) continue
        shapePoint(shapeA, layout, cacheA, specA, s, time, a)
        const blend = shapeA === shapeB ? 0 : blendAt(t, s)
        let x = a.x
        let y = a.y
        let z = a.z
        let alpha = a.alpha
        if (blend > 0) {
          shapePoint(shapeB, layout, cacheB, specB, s, time, b)
          x += (b.x - x) * blend
          y += (b.y - y) * blend
          z += (b.z - z) * blend
          alpha += (b.alpha - alpha) * blend
        }
        if (x < -24 || x > width + 24 || y < -24 || y > height + 24) continue
        const depth = (z + 1) / 2
        const trail = 1 - k / stream.length
        alpha *= trail * (0.45 + 0.55 * depth) * readFade(layout, x, y)
        if (alpha < 0.02) continue
        const shade = Math.max(
          0,
          Math.min(
            SHADES - 1,
            Math.round(
              (SHADES - 1) * trail * stream.brightness * (0.55 + 0.45 * depth)
            )
          )
        )
        const size = stream.size * (0.8 + 0.3 * depth) * (compact ? 0.82 : 1)
        const glyph =
          (stream.glyph + k * 13 + Math.floor(time * 2.4 + stream.phase * 9)) %
          GLYPHS.length
        ctx.globalAlpha = Math.min(1, alpha)
        ctx.drawImage(
          atlas,
          (glyph % COLUMNS) * CELL,
          (Math.floor(glyph / COLUMNS) + shade * ROWS) * CELL,
          CELL,
          CELL,
          x - size / 2,
          y - size / 2,
          size,
          size
        )
      }
    }
    ctx.globalAlpha = 1
    canvas.dataset.shape = blendAt(t, 0.5) < 0.5 ? shapeA : shapeB
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
  }
  resize()

  return {
    render,
    resize,
    setTheme: paintAtlas,
    destroy() {
      disposed = true
    },
  }
}
