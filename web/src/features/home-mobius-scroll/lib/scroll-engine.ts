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
  fitScene,
  waterfallPoint,
  type Point3,
  type ProjectedPoint,
} from '@/features/home-mobius-preview/lib/mobius-geometry'
import {
  cablePoint,
  conductorPoint,
} from '@/features/home-mobius-preview/lib/network-cable'
import {
  ribbonPoint,
  ribbonPose,
  ribbonTangent,
} from '@/features/home-mobius-preview/lib/ribbon-shape'

type DrawItem =
  | {
      kind: 'glyph'
      x: number
      y: number
      z: number
      size: number
      glyph: number
      shade: number
      alpha: number
    }
  | {
      kind: 'occlusion'
      vertices: ProjectedPoint[]
      z: number
    }

export type ScrollTheme = 'dark' | 'light'

export interface ScrollEngine {
  setActive: (active: boolean) => void
  /** Draw one frame immediately, snapping the form to the current scroll. */
  redraw: () => void
  replay: () => void
  setTheme: (theme: ScrollTheme) => void
  destroy: () => void
}

export interface ScrollEngineOptions {
  /** Continuous form progress (0–3) derived from the page scroll position. */
  getMorph: () => number
  /** Continuous turn offset: 0 at each section center, ± between sections. */
  getTurn: () => number
  /** Elements whose live text the glyph traffic feathers away from. */
  readingSelector: string
  /** Start after the opening (deep links, reduced motion). */
  skipIntro: boolean
  theme: ScrollTheme
}

// Shade 0 is the faintest trail, shade 6 the brightest head. Light mode inverts
// luminance so heads read as dark ink on the paper background.
const PALETTES: Record<ScrollTheme, string[]> = {
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
// The opening plays twice as fast as Scheme C so the hero is readable at once.
const INTRO_END = 11
const INTRO_SPEED = 2

// Decorative data: Latin, kana, Han, numerals and monochrome symbols share a palette.
const GLYPHS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '零壹数链流源光云网模态联接序元语界讯算' +
  'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ∞∆∑±×÷<>[]{}⟐◈◇○△□:;=+*'
const TAU = Math.PI * 2
const ATLAS_CELL = 64
const ATLAS_COLUMNS = 24
const ATLAS_ROWS = Math.ceil(GLYPHS.length / ATLAS_COLUMNS)

function ease(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Scheme C's world-space shot, driven by page scroll instead of a chapter clock:
 * stripped cable → travelling bytes → a Möbius that morphs continuously with scroll. */
export function createScrollEngine(
  canvas: HTMLCanvasElement,
  options: ScrollEngineOptions
): ScrollEngine | null {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return null
  const ctx = context
  let width = 1200
  let height = 650
  let pixelRatio = 1
  let time = options.skipIntro ? INTRO_END + 1 : 0
  let flowTime = time
  let morph = options.getMorph()
  let turn = options.getTurn()
  // Scroll speed feeds the data flow: scrolling visibly pushes traffic along the ring.
  let lastScrollY = window.scrollY
  let surge = 0
  let frameId = 0
  let lastFrame = 0
  let active = false
  let disposed = false
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const readingElements = () =>
    document.querySelectorAll<HTMLElement>(options.readingSelector)

  // Stable seeds keep replay/resize coherent; no shared grid or synchronized pulses.
  let seed = 81397
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const streams = Array.from({ length: 420 }, (_, index) => ({
    angle: random() * TAU * 2,
    phase: random(),
    speed: 80 + random() * 70,
    length: 14 + Math.floor(random() * 22),
    spacing: 7.5 + random() * 4.5,
    size: 10 + random() ** 2 * 8,
    width: (random() - 0.5) * 1.94,
    lift: (random() - 0.5) * (index % 7 === 0 ? 85 : 28),
    brightness: 0.62 + random() * 0.38,
    drift: 0.7 + random() * 1.5,
    glyph: Math.floor(random() * GLYPHS.length),
  }))

  const atlas = document.createElement('canvas')
  atlas.width = ATLAS_COLUMNS * ATLAS_CELL
  atlas.height = ATLAS_ROWS * ATLAS_CELL * 7
  const atlasCtx = atlas.getContext('2d')
  if (!atlasCtx) return null
  atlasCtx.font =
    '44px "SFMono-Regular", Menlo, "Hiragino Kaku Gothic ProN", "PingFang SC", monospace'
  atlasCtx.textAlign = 'center'
  atlasCtx.textBaseline = 'middle'
  function paintAtlas(theme: ScrollTheme) {
    const context2d = atlasCtx as CanvasRenderingContext2D
    context2d.clearRect(0, 0, atlas.width, atlas.height)
    const colors = PALETTES[theme]
    for (let shade = 0; shade < colors.length; shade++) {
      context2d.fillStyle = colors[shade]
      for (let glyph = 0; glyph < GLYPHS.length; glyph++) {
        context2d.fillText(
          GLYPHS[glyph],
          (glyph % ATLAS_COLUMNS) * ATLAS_CELL + ATLAS_CELL / 2,
          (Math.floor(glyph / ATLAS_COLUMNS) + shade * ATLAS_ROWS) *
            ATLAS_CELL +
            ATLAS_CELL / 2
        )
      }
    }
    canvas.dataset.theme = theme
  }
  paintAtlas(options.theme)
  canvas.dataset.cableRenderer = 'glyphs'

  function draw(seconds: number) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const compact = width < 700
    const portrait = compact && height > width * 0.9
    const sceneWidth = compact ? 760 : 1200
    const scene = fitScene(width, height, sceneWidth)
    ctx.translate(scene.x, scene.y)
    ctx.scale(scene.scale, scene.scale)

    const pose = ribbonPose(morph)
    const breathe = Math.max(0, flowTime - 11)
    pose.lift += Math.sin(breathe * 0.2) * 12
    pose.twist += Math.sin(breathe * 0.16) * 0.12
    if (portrait) {
      pose.halfWidth *= 0.7
      pose.stretch += Math.max(0, 1 - morph) * 0.45
      pose.roll += Math.max(0, 1 - morph) * 1.62
      pose.centerX = 0.54 - Math.min(morph, 1) * 0.04
      pose.centerY = 0.47 - Math.min(morph, 1) * 0.24
      pose.width = 0.92
      pose.height = 0.85 - Math.min(morph, 1) * 0.46
    } else if (height < 520 && morph < 1) {
      pose.height += (0.98 - pose.height) * (1 - morph)
      pose.centerY += (0.45 - pose.centerY) * (1 - morph)
    }

    const travel = ease((seconds - 2.3) / 5.2)
    const formation = ease((seconds - 4.8) / 4.8)
    const cableOpacity = 1 - ease((seconds - 4) / 2.5)
    const streamOpacity = 1 - ease((seconds - 9.4) / 1.6)
    const cameraX = -35 * (1 - travel)
    const cameraY = -1020 * (1 - travel)
    const zoom = 1.65 - 0.65 * travel
    const unfold = ease((seconds - 0.8) / 3.2)
    const spin = Math.max(0, flowTime - 5)
    const yaw = pose.yaw + turn + Math.sin(breathe * 0.13) * 0.07
    const pitch = pose.pitch - turn * 0.35 + Math.sin(breathe * 0.11) * 0.055
    const roll = pose.roll + turn * 0.6 + Math.sin(breathe * 0.09) * 0.06
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw)
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch)
    const cr = Math.cos(roll),
      sr = Math.sin(roll)
    let ringScale = 1

    const rotateRing = (point: Point3) => {
      const x = point.x * cy + point.z * sy
      const depth = -point.x * sy + point.z * cy
      const y = point.y * cp - depth * sp
      return {
        x: (x * cr - y * sr) * ringScale,
        y: (x * sr + y * cr) * ringScale,
        z: point.y * sp + depth * cp,
      }
    }
    // Fit uniformly: independent x/y normalization would erase the folds into an oval.
    let ringExtentX = 0
    let ringExtentY = 0
    for (let sample = 0; sample < 64; sample++) {
      for (const edge of [-1, 0, 1]) {
        const point = rotateRing(ribbonPoint((sample / 64) * TAU, edge, pose))
        const perspective = 1200 / (1200 - point.z)
        ringExtentX = Math.max(ringExtentX, Math.abs(point.x * perspective))
        ringExtentY = Math.max(ringExtentY, Math.abs(point.y * perspective))
      }
    }
    ringScale = Math.min(
      (width * pose.width) / (scene.scale * ringExtentX * 2),
      (height * pose.height) / (scene.scale * ringExtentY * 2)
    )

    const project = (point: Point3) => {
      const perspective = 1200 / (1200 - point.z)
      const projected = {
        x:
          (width * (0.5 + (pose.centerX - 0.5) * travel) - scene.x) /
            scene.scale +
          (point.x - cameraX) * perspective * zoom,
        y:
          (height * (0.35 + travel * (pose.centerY - 0.35)) - scene.y) /
            scene.scale +
          (point.y - cameraY) * perspective * zoom,
        z: point.z,
        perspective: perspective * zoom,
      }
      return projected
    }

    const points: DrawItem[] = []
    if (cableOpacity > 0) {
      // Longitudinal glyph traffic describes the cylindrical jacket itself.
      for (let lane = 0; lane < 80; lane++) {
        const stream = streams[lane]
        const angle = (lane / 80) * TAU
        for (let tail = 0; tail < 48; tail++) {
          const p = (stream.phase + seconds * 0.18 + tail / 48) % 1
          const y = -640 + p * 640
          const theta = angle + y * 0.002 + Math.sin(p * 9 + lane) * 0.025
          const radius = 35 + Math.sin(lane * 7) * 0.8
          const point = project(
            cablePoint(Math.cos(theta) * radius, y, Math.sin(theta) * radius)
          )
          const trail = (tail % 13) / 13
          points.push({
            kind: 'glyph',
            x: point.x,
            y: point.y,
            z: point.z,
            size: (compact ? 7 : 6.4) * point.perspective,
            glyph:
              (stream.glyph + tail * 31 + Math.floor(flowTime * stream.drift)) %
              GLYPHS.length,
            shade: tail % 13 === 0 ? 6 : Math.floor(4 - trail * 3),
            alpha:
              cableOpacity *
              (0.25 + (Math.sin(theta) + 1) * 0.3) *
              (1 - trail * 0.5),
          })
        }
      }
      // Eight smaller glyph tubes retain the unmistakable four-pair cable structure.
      for (let wire = 0; wire < 8; wire++) {
        for (let lane = 0; lane < 8; lane++) {
          const stream = streams[wire * 8 + lane]
          const angle = (lane / 8) * TAU
          for (let tail = 0; tail < 38; tail++) {
            const p = (stream.phase + seconds * 0.26 + tail / 38) % 1
            const position = conductorPoint(wire, p, unfold * 3)
            position.x += Math.cos(angle) * 3.8
            position.z += Math.sin(angle) * 3.8
            const point = project(position)
            const trail = (tail % 11) / 11
            points.push({
              kind: 'glyph',
              x: point.x,
              y: point.y,
              z: point.z,
              size: (compact ? 6.5 : 5.4) * point.perspective,
              glyph:
                (stream.glyph + tail * 17 + Math.floor(seconds * 1.8)) %
                GLYPHS.length,
              shade: tail % 11 === 0 ? 6 : Math.floor(5 - trail * 3),
              alpha:
                cableOpacity *
                (0.5 + Math.sin(angle) * 0.2) *
                (1 - trail * 0.35),
            })
          }
        }
      }
    }
    if (formation > 0) {
      const columns = compact ? 72 : 112
      const rows = 8
      for (let column = 0; column < columns; column++) {
        if ((column + 1) / columns > formation) continue
        const u = -Math.PI / 2 + (column / columns) * TAU
        const nextU = u + TAU / columns
        for (let row = 0; row < rows; row++) {
          const v = -0.82 + (row / rows) * 1.64
          const nextV = v + 1.64 / rows
          const a = rotateRing(ribbonPoint(u, v, pose))
          const b = rotateRing(ribbonPoint(nextU, v, pose))
          const c = rotateRing(ribbonPoint(nextU, nextV, pose))
          const d = rotateRing(ribbonPoint(u, nextV, pose))
          points.push({
            kind: 'occlusion',
            vertices: [project(a), project(b), project(c), project(d)],
            z: (a.z + b.z + c.z + d.z) / 4,
          })
        }
      }
      const count = compact ? 160 : 340
      for (let index = 0; index < count; index++) {
        const stream = streams[index]
        const head = stream.angle + (spin * stream.speed) / 240
        for (let tail = 0; tail < stream.length; tail++) {
          if ((index * 13 + tail * 7) % 23 < 2) continue
          // Every lane travels longitudinally. A full 4π circuit preserves the half twist.
          const u = head - (tail * stream.spacing) / 240
          const progress = ((((u + Math.PI / 2) % TAU) + TAU) % TAU) / TAU
          if (progress > formation) continue
          // A loose volume follows the half twist; characters are free of a visible skin.
          const v = stream.width + Math.sin(u * 2 + stream.phase * TAU) * 0.08
          const surface = ribbonPoint(u, v, pose)
          surface.x += Math.sin(u * 3 + stream.phase * TAU) * stream.lift
          surface.y += Math.cos(u * 2 + stream.phase * TAU) * stream.lift * 0.55
          surface.z += Math.sin(u + stream.phase * TAU) * stream.lift
          const point = project(rotateRing(surface))
          const depth = Math.max(0, Math.min(1, (point.z + 330) / 660))
          const fade = (1 - tail / stream.length) ** 1.4
          let shade = Math.min(4, Math.floor(fade * 4.5) + 1)
          if (tail === 0) shade = index % 4 === 0 ? 6 : 5
          if (tail === 1) shade = 4
          const flicker = 0.86 + Math.sin(flowTime * 2.4 + index * 5.3) * 0.14
          points.push({
            kind: 'glyph',
            x: point.x,
            y: point.y,
            z: point.z + 15,
            // Keep screen-facing glyphs readable after the camera pulls back.
            size:
              Math.max(
                compact ? 13 : 16,
                Math.min(
                  26,
                  stream.size * point.perspective * ringScale * scene.scale
                )
              ) / scene.scale,
            glyph:
              (stream.glyph + tail * 31 + Math.floor(flowTime * stream.drift)) %
              GLYPHS.length,
            shade,
            alpha:
              (0.3 + fade * 0.7) *
              (0.48 + depth * 0.52) *
              stream.brightness *
              flicker,
          })
        }
      }
    }

    if (streamOpacity > 0) {
      const count = compact ? 110 : 210
      for (let i = 0; i < count; i++) {
        const stream = streams[i]
        const head =
          (stream.phase + seconds * (0.17 + stream.drift * 0.035)) % 1.3
        const outlet = conductorPoint(i % 8, 1, unfold * 3)
        const entry = rotateRing(ribbonPoint(-Math.PI / 2, stream.width, pose))
        const tangent = rotateRing(
          ribbonTangent(-Math.PI / 2, stream.width, pose)
        )
        const length = Math.min(stream.length, 22)
        for (let tail = 0; tail < length; tail++) {
          if ((i * 7 + tail * 11) % 19 === 0) continue
          const p = head - tail * stream.spacing * 0.0011
          if (p < 0 || p > 1 || p > seconds * 0.38 + 0.06) continue
          const path = waterfallPoint(p, outlet, entry, tangent)
          // The column opens into depth, then closes onto the same ring lanes.
          const spread = Math.sin(p * Math.PI) ** 2
          path.x += Math.sin(i * 2.4) * 28 * spread
          path.z += Math.cos(i * 3.7) * 65 * spread
          const point = project(path)
          points.push({
            kind: 'glyph',
            x: point.x,
            y: point.y,
            z: point.z,
            size: (6 + (stream.size - 6) * ease(p / 0.18)) * point.perspective,
            glyph:
              (stream.glyph + tail * 17 + Math.floor(flowTime * stream.drift)) %
              GLYPHS.length,
            shade: tail === 0 ? 6 : Math.floor(4 * (1 - tail / length)) + 1,
            alpha:
              streamOpacity *
              stream.brightness *
              (0.18 + (1 - tail / length) * 0.82),
          })
        }
      }
    }

    const canvasTop = canvas.getBoundingClientRect().top
    const readingAreas = [...readingElements()].flatMap((element) => {
      const opacity = Number(getComputedStyle(element).opacity)
      const bounds = element.getBoundingClientRect()
      if (
        opacity < 0.02 ||
        bounds.bottom < 0 ||
        bounds.top > window.innerHeight
      ) {
        return []
      }
      return [{ bounds, opacity }]
    })
    points.sort((a, b) => a.z - b.z)
    for (const point of points) {
      if (point.kind === 'occlusion') {
        ctx.setTransform(
          pixelRatio * scene.scale,
          0,
          0,
          pixelRatio * scene.scale,
          pixelRatio * scene.x,
          pixelRatio * scene.y
        )
        // Only remove hidden rear traffic. No colored face or edge is painted.
        ctx.globalCompositeOperation = 'destination-out'
        ctx.globalAlpha = 0.82
        ctx.beginPath()
        point.vertices.forEach((vertex, i) => {
          if (i === 0) ctx.moveTo(vertex.x, vertex.y)
          else ctx.lineTo(vertex.x, vertex.y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        continue
      }
      const screenX = scene.x + point.x * scene.scale
      const screenY = canvasTop + scene.y + point.y * scene.scale
      let readingOpacity = 1
      for (const area of readingAreas) {
        const dx = Math.max(
          area.bounds.left - screenX,
          0,
          screenX - area.bounds.right
        )
        const dy = Math.max(
          area.bounds.top - screenY,
          0,
          screenY - area.bounds.bottom
        )
        if (dx > 56 || dy > 56) continue
        // Thin the traffic behind live copy without erasing the sculpture around it.
        const clear = 0.4 + ease(Math.hypot(dx, dy) / 56) * 0.6
        readingOpacity = Math.min(
          readingOpacity,
          1 - area.opacity * (1 - clear)
        )
      }
      ctx.globalAlpha = point.alpha * readingOpacity
      const pixelScale = pixelRatio * scene.scale
      ctx.setTransform(
        pixelScale,
        0,
        0,
        pixelScale,
        (scene.x + point.x * scene.scale) * pixelRatio,
        (scene.y + point.y * scene.scale) * pixelRatio
      )
      ctx.drawImage(
        atlas,
        (point.glyph % ATLAS_COLUMNS) * ATLAS_CELL,
        (Math.floor(point.glyph / ATLAS_COLUMNS) + point.shade * ATLAS_ROWS) *
          ATLAS_CELL,
        ATLAS_CELL,
        ATLAS_CELL,
        -point.size / 2,
        -point.size / 2,
        point.size,
        point.size
      )
    }
    ctx.globalAlpha = 1
    let phase = 'cable'
    if (seconds >= 2.3) phase = 'follow'
    if (seconds >= 4.8) phase = 'forming'
    if (seconds >= 11) phase = 'loop'
    if (canvas.dataset.phase !== phase) canvas.dataset.phase = phase
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    if (!active) {
      morph = options.getMorph()
      turn = options.getTurn()
    }
    draw(reduced.matches ? Math.max(12, time) : time)
  }

  function tick(now: number) {
    if (!active || disposed) return
    if (now - lastFrame >= 32) {
      const elapsed = Math.min((now - lastFrame) / 1000, 0.06)
      const scrollY = window.scrollY
      const speed = Math.abs(scrollY - lastScrollY) / Math.max(elapsed, 0.016)
      lastScrollY = scrollY
      surge += (Math.min(3, speed / 900) - surge) * (1 - Math.exp(-elapsed * 6))
      time += elapsed * (time < INTRO_END ? INTRO_SPEED : 1)
      flowTime +=
        elapsed * (flowTime < INTRO_END ? INTRO_SPEED : 1) * (1 + surge)
      // Critically damped follow: scroll never snaps the sculpture between forms.
      // Use real elapsed time here so slow frames still converge on the scroll form.
      const followElapsed = Math.min((now - lastFrame) / 1000, 0.25)
      const follow = 1 - Math.exp(-followElapsed * 4.2)
      morph += (options.getMorph() - morph) * follow
      turn += (options.getTurn() - turn) * follow
      lastFrame = now
      draw(time)
    }
    frameId = requestAnimationFrame(tick)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  return {
    setActive(next) {
      if (disposed) return
      const shouldRun = next && !reduced.matches
      if (reduced.matches) draw(Math.max(12, time))
      if (active === shouldRun) return
      active = shouldRun
      cancelAnimationFrame(frameId)
      if (active) {
        lastFrame = performance.now()
        frameId = requestAnimationFrame(tick)
      }
    },
    redraw() {
      if (disposed || active) return
      morph = options.getMorph()
      turn = options.getTurn()
      draw(reduced.matches ? Math.max(12, time) : time)
    },
    replay() {
      if (disposed) return
      time = reduced.matches ? 12 : 0
      flowTime = time
      draw(time)
    },
    setTheme(theme) {
      if (disposed) return
      paintAtlas(theme)
      draw(reduced.matches ? Math.max(12, time) : time)
    },
    destroy() {
      disposed = true
      active = false
      cancelAnimationFrame(frameId)
      observer.disconnect()
      atlas.width = 0
      atlas.height = 0
    },
  }
}
