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

/** A viewport-space rectangle (CSS pixels), read from the live page layout. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Everything the sculpture attaches to. All boxes move with the page as it scrolls. */
export interface FlowLayout {
  width: number
  height: number
  /** Fractional section index: i when section i is centered in the viewport. */
  progress: number
  hero: { section: Box; head: Box; body: Box }
  pillar: Box
  models: Box[]
  modelLit: number[]
  terminal: Box
  timeline: Box
  nodes: Box[]
  nodeActive: number[]
  ring: Box
  copy: Box[]
}

export interface Sample {
  x: number
  y: number
  /** Depth in [-1, 1]; positive faces the viewer. */
  z: number
  alpha: number
}

export interface StreamSpec {
  /** Strand index 0–7 inside the cable bundle. */
  lane: number
  jitter: number
  /** -1 for the main cable, otherwise the branch it peels off into. */
  branch: number
}

/** One form per section, in page order. */
export const SHAPES = [
  'arch',
  'pillar',
  'terminal',
  'timeline',
  'ring',
] as const
export type ShapeId = (typeof SHAPES)[number]

const TAU = Math.PI * 2
const STRANDS = 8

export function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

function center(box: Box) {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/* ---------- arc-length sampled polylines ---------- */

export interface Path {
  xs: Float64Array
  ys: Float64Array
  lengths: Float64Array
  total: number
}

type Point2 = readonly [number, number]

export function createPath(points: readonly Point2[]): Path {
  const n = points.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const lengths = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][0]
    ys[i] = points[i][1]
    if (i > 0) {
      lengths[i] =
        lengths[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
    }
  }
  return { xs, ys, lengths, total: lengths[n - 1] || 1 }
}

export interface PathSample {
  x: number
  y: number
  tx: number
  ty: number
}

export function samplePath(path: Path, s: number, out: PathSample) {
  const { xs, ys, lengths } = path
  const target = Math.max(0, Math.min(1, s)) * path.total
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (lengths[mid] <= target) lo = mid
    else hi = mid
  }
  const dx = xs[hi] - xs[lo]
  const dy = ys[hi] - ys[lo]
  const segment = lengths[hi] - lengths[lo] || 1
  const f = (target - lengths[lo]) / segment
  const length = Math.hypot(dx, dy) || 1
  out.x = xs[lo] + dx * f
  out.y = ys[lo] + dy * f
  out.tx = dx / length
  out.ty = dy / length
  return out
}

/* ---------- section forms ---------- */

/** Hero: a cable rises from below, arches over the copy, and lands again. */
export function archPath(layout: FlowLayout) {
  const compact = layout.width < 720
  const { head, body, section } = layout.hero
  const cx = layout.width / 2
  const halfWidth = compact
    ? layout.width * 0.44
    : Math.min(
        layout.width * 0.45,
        Math.max(layout.width * 0.3, body.width / 2 + 80)
      )
  const apexY = head.top + head.height + (compact ? 14 : 22)
  const baseY = Math.max(
    body.top + body.height + 36,
    apexY + layout.height * 0.3
  )
  const footY = Math.max(section.top + section.height, baseY) + 90
  const points: Point2[] = []
  for (let i = 0; i < 8; i++) {
    points.push([cx - halfWidth, footY + ((baseY - footY) * i) / 8])
  }
  for (let i = 0; i <= 96; i++) {
    const angle = Math.PI * (1 - i / 96)
    // A flattened top keeps the doorway wide enough for the hero copy.
    const rise = Math.pow(Math.max(0, Math.sin(angle)), 0.55)
    points.push([
      cx + halfWidth * Math.cos(angle),
      baseY - (baseY - apexY) * rise,
    ])
  }
  for (let i = 1; i <= 8; i++) {
    points.push([cx + halfWidth, baseY + ((footY - baseY) * i) / 8])
  }
  return createPath(points)
}

/** Model access: one leg straightens into a vertical data column. */
export function pillarPath(layout: FlowLayout) {
  const { pillar } = layout
  const x = pillar.left + pillar.width / 2
  const sway = layout.width < 720 ? 3 : 10
  const top = pillar.top - 140
  const bottom = pillar.top + pillar.height + 140
  const points: Point2[] = []
  for (let i = 0; i <= 24; i++) {
    points.push([
      x + Math.sin((i / 24) * TAU) * sway,
      bottom + ((top - bottom) * i) / 24,
    ])
  }
  return createPath(points)
}

/** A branch peels off the column and drops into a model cell. */
export function branchPath(layout: FlowLayout, index: number) {
  const model = layout.models[index]
  const c = center(model)
  const px = layout.pillar.left + layout.pillar.width / 2
  // End just inside the cell edge that faces the column.
  const endX = c.x > px ? model.left + 14 : model.left + model.width - 14
  const points: Point2[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const q = 1 - t
    points.push([
      q * q * px + 2 * q * t * px + t * t * endX,
      q * q * (c.y + 70) + 2 * q * t * c.y + t * t * c.y,
    ])
  }
  return createPath(points)
}

/** RelayDesk: the column bends and feeds the terminal through its title bar. */
export function terminalPath(layout: FlowLayout) {
  const box = layout.terminal
  const compact = layout.width < 720
  const x0 = Math.min(layout.width - 22, box.left + box.width + 48)
  const yHead = box.top + 22
  const radius = compact ? 34 : 52
  const points: Point2[] = []
  for (let i = 0; i < 12; i++) {
    points.push([x0, -180 + ((yHead - radius + 180) * i) / 12])
  }
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * (Math.PI / 2)
    points.push([
      x0 - radius + radius * Math.cos(angle),
      yHead - radius + radius * Math.sin(angle),
    ])
  }
  const startX = x0 - radius
  const endX = box.left + box.width * 0.58
  for (let i = 0; i <= 12; i++) {
    points.push([startX + ((endX - startX) * i) / 12, yHead])
  }
  return createPath(points)
}

/** Features: the cable becomes a slim timeline the feature nodes hang on. */
export function timelinePath(layout: FlowLayout) {
  const box = layout.timeline
  const x = box.left + box.width / 2
  const top = box.top - 160
  const bottom = box.top + box.height + 160
  const points: Point2[] = []
  for (let i = 0; i <= 12; i++) {
    points.push([x, top + ((bottom - top) * i) / 12])
  }
  return createPath(points)
}

/** Closing: a Möbius band that approaches the viewer and frames the call to action. */
export function ringSample(
  layout: FlowLayout,
  s: number,
  v: number,
  time: number,
  out: Sample
) {
  const box = layout.ring
  const c = center(box)
  const offset = (c.y - layout.height / 2) / layout.height
  const approach =
    offset >= 0 ? 1 - Math.min(offset, 0.8) * 0.55 : 1 - offset * 1.6
  const base = Math.max(
    box.width * (layout.width < 720 ? 0.56 : 0.58),
    box.height * 0.95
  )
  const radius = base * approach
  const band = radius * 0.16
  const u = s * TAU + time * 0.06
  const spread = radius + v * band * Math.cos(u / 2)
  const x3 = spread * Math.cos(u)
  const y3 = spread * Math.sin(u)
  const z3 = v * band * Math.sin(u / 2)
  const pitch = 0.5
  const y4 = y3 * Math.cos(pitch) - z3 * Math.sin(pitch)
  const z4 = y3 * Math.sin(pitch) + z3 * Math.cos(pitch)
  const perspective = 1600 / (1600 - z4 * 0.6)
  out.x = c.x + x3 * perspective
  out.y = c.y + y4 * perspective
  out.z = Math.max(-1, Math.min(1, z4 / (radius * 0.5)))
  out.alpha = 1 - smooth((approach - 1.6) / 0.8)
  return out
}

/* ---------- glyph placement ---------- */

export interface PathCache {
  arch?: Path
  pillar?: Path
  branches?: Path[]
  terminal?: Path
  timeline?: Path
}

const scratch: PathSample = { x: 0, y: 0, tx: 0, ty: 0 }

/** Places a glyph on one strand of a twisted cable that follows `path`. */
function onPath(
  path: Path,
  s: number,
  spec: StreamSpec,
  radius: number,
  time: number,
  out: Sample
) {
  samplePath(path, s, scratch)
  const angle = (spec.lane * TAU) / STRANDS + (s * path.total) / 88 + time * 0.9
  const offset = radius * (Math.cos(angle) + spec.jitter)
  out.x = scratch.x - scratch.ty * offset
  out.y = scratch.y + scratch.tx * offset
  out.z = Math.sin(angle)
  out.alpha = smooth(s / 0.05) * smooth((1 - s) / 0.05)
  return out
}

export function shapePoint(
  shape: ShapeId,
  layout: FlowLayout,
  cache: PathCache,
  spec: StreamSpec,
  s: number,
  time: number,
  out: Sample
): Sample {
  const compact = layout.width < 720
  switch (shape) {
    case 'arch':
      cache.arch ??= archPath(layout)
      return onPath(cache.arch, s, spec, compact ? 16 : 28, time, out)
    case 'pillar': {
      if (spec.branch >= 0 && layout.models.length > 0) {
        const index = spec.branch % layout.models.length
        cache.branches ??= layout.models.map((_, i) => branchPath(layout, i))
        // Branches are short, so they cycle three times per trip along the column.
        const local = (s * 3) % 1
        onPath(cache.branches[index], local, spec, 4, time, out)
        out.alpha =
          smooth(local / 0.08) *
          smooth((1 - local) / 0.3) *
          (0.25 + 0.75 * (layout.modelLit[index] ?? 0))
        return out
      }
      cache.pillar ??= pillarPath(layout)
      return onPath(cache.pillar, s, spec, compact ? 12 : 30, time, out)
    }
    case 'terminal': {
      cache.terminal ??= terminalPath(layout)
      const taper = 1 - 0.75 * smooth((s - 0.62) / 0.3)
      onPath(cache.terminal, s, spec, (compact ? 14 : 24) * taper, time, out)
      out.alpha = smooth(s / 0.04) * smooth((1 - s) / 0.18)
      return out
    }
    case 'timeline': {
      if (spec.branch >= 0 && spec.branch < layout.nodes.length) {
        const node = center(layout.nodes[spec.branch])
        const angle = s * TAU * 2 + time * 1.2 + spec.lane
        const radius = 15 + spec.lane * 1.4
        out.x = node.x + Math.cos(angle) * radius
        out.y = node.y + Math.sin(angle) * radius * 0.9
        out.z = Math.sin(angle)
        out.alpha = 0.15 + 0.85 * (layout.nodeActive[spec.branch] ?? 0)
        return out
      }
      cache.timeline ??= timelinePath(layout)
      return onPath(cache.timeline, s, spec, compact ? 6 : 9, time, out)
    }
    case 'ring':
      return ringSample(
        layout,
        s,
        -1 + (2 * spec.lane) / (STRANDS - 1) + spec.jitter * 0.3,
        time,
        out
      )
  }
}

/**
 * Per-glyph handover between two forms. `order` (0–1, position along the
 * cable) staggers the start, so the change sweeps along the cable instead of
 * cross-fading everywhere at once.
 */
export function blendAt(t: number, order: number) {
  return smooth((t - (0.1 + 0.4 * order)) / 0.5)
}
