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

/**
 * Scroll-driven sculpture: every glyph owns a fixed (u, v) in one shared parameter
 * domain, u ∈ [0, 1) along the flow and v ∈ [-1, 1] across the band. Each shape maps
 * that domain to space, so a glyph has exactly one place in every shape and scrolling
 * only blends between neighbouring shapes.
 */
export type Vec3 = { x: number; y: number; z: number }

/** Möbius shell → layered waves → DNA double helix → vortex tunnel → data ocean. */
export const SHAPE_COUNT = 5
export const SHAPE_NAMES = ['mobius', 'wave', 'dna', 'vortex', 'ocean'] as const
export const DNA_INDEX = 2
export const VORTEX_INDEX = 3
export const OCEAN_INDEX = 4

const TAU = Math.PI * 2

/** Unit-scale point of shape `shape` at (u, v); `t` animates the shape's own motion. */
export function shapePoint(
  shape: number,
  u: number,
  v: number,
  t: number,
  out: Vec3
): Vec3 {
  if (shape === 0) {
    ringPoint(u, v, t, out)
    return out
  }
  if (shape === 1) {
    // Lanes peel apart into stacked sheets, each wave a little behind the one above.
    // Lanes peel apart into stacked sheets, each wave a little behind the one above.
    const x = (u * 2 - 1) * 2.1
    out.x = x
    out.y = v * 0.62 + 0.17 * Math.sin(x * 2.3 + v * 3.1 + t * 0.7)
    out.z = 0.42 * Math.sin(x * 1.6 - v * 2.2 + t * 0.45) - v * 0.18
    return out
  }
  if (shape === 2) {
    helixPoint(u, v, t, out, 1)
    return out
  }
  if (shape === 3) {
    vortexPoint(u, v, t, out)
    return out
  }
  oceanPoint(u, v, t, out)
  return out
}

export const RING_LAYERS = 4

/**
 * A hollow Möbius shell of thin sheets: each sheet is its own half-twisted band,
 * standing apart from its neighbours along the band normal and twisting slightly
 * ahead of them, so the shell fans open instead of reading as one thick slab.
 * Two laps close every lane on itself.
 */
function ringPoint(u: number, v: number, t: number, out: Vec3) {
  const lane = ((v + 1) / 2) * RING_LAYERS
  const layer = Math.min(RING_LAYERS - 1, Math.floor(lane))
  const local = (lane - layer) * 2 - 1
  const spread = layer - (RING_LAYERS - 1) / 2
  const theta = u * TAU * 2
  const half = theta / 2 + spread * 0.55
  // Slow travelling swells along the band keep the sheets breathing apart.
  const swell = 0.05 * Math.sin(theta * 3 - t * 0.9 + layer * 1.3)
  const along = 0.1 * local
  const offset = spread * 0.2 + swell
  const radial =
    1 +
    along * Math.cos(half) -
    offset * Math.sin(half) +
    0.035 * Math.sin(theta * 2 + t * 0.6 + layer)
  out.x = radial * Math.cos(theta)
  out.y = radial * Math.sin(theta)
  out.z = along * Math.sin(half) + offset * Math.cos(half)
}

/** Turn rate shared by the DNA and the vortex, in radians per second. */
export const SPIN = 0.32

export const HELIX = {
  radius: 0.42,
  height: 1.6,
  turns: 2.2,
  /** Base pairs from bottom to top; every other one carries an agent badge. */
  rungs: 16,
  /** Lanes with |v| above this form the two strands; the rest form the rungs. */
  strand: 0.55,
}

/** Angle and height of the double helix at height fraction `f` ∈ [0, 1]. */
export function helixFrame(f: number, t: number, twist = 1) {
  return {
    // At twist 0 the helix is a flat ladder facing the viewer; it winds up to full DNA at 1.
    theta: (f * TAU * HELIX.turns + t * SPIN) * twist,
    y: (f * 2 - 1) * HELIX.height,
  }
}

/** Vertical DNA: two strands of glyph tubes joined by rungs that data runs across. */
export function helixPoint(
  u: number,
  v: number,
  t: number,
  out: Vec3,
  twist: number
) {
  if (Math.abs(v) > HELIX.strand) {
    const { theta, y } = helixFrame(u, t, twist)
    const side = v > 0 ? 0 : Math.PI
    // Each strand is a thin tube: the lane's position across it sets its angle round the tube.
    const around = ((Math.abs(v) - HELIX.strand) / (1 - HELIX.strand)) * TAU
    const tube = 0.045
    const angle = theta + side
    out.x = (HELIX.radius + tube * Math.cos(around)) * Math.cos(angle)
    out.y = y + tube * Math.sin(around)
    out.z = (HELIX.radius + tube * Math.cos(around)) * Math.sin(angle)
    return
  }
  // Rung glyphs run from one strand to the other, then on to the next rung up.
  const step = u * HELIX.rungs
  const rung = Math.min(HELIX.rungs - 1, Math.floor(step))
  // Lanes are staggered along the rung, so parallel streams don't stack on one spot.
  const across = (step - rung + ((v / HELIX.strand + 1) / 2) * 0.5) % 1
  const { theta, y } = helixFrame((rung + 0.5) / HELIX.rungs, t, twist)
  const reach = HELIX.radius * (1 - 2 * across)
  out.x = reach * Math.cos(theta)
  out.y = y + (v / HELIX.strand) * 0.025
  out.z = reach * Math.sin(theta)
}

/** The DNA's two strands become the tunnel's two spiral arms. */
export const VORTEX_ARMS = 2
export const VORTEX_DEPTH = 3.2

/**
 * Logarithmic spiral arms forming a tunnel. Flow runs inward: u = 0 at the near
 * rim, u → 1 deep at the core, so streams and agents sink toward its centre.
 */
export function vortexPoint(u: number, v: number, t: number, out: Vec3) {
  const w = 1 - u
  const lane = ((1 - v) / 2) * VORTEX_ARMS
  const arm = Math.min(VORTEX_ARMS - 1, Math.floor(lane))
  const across = lane - arm
  const radius = 0.12 + 1.25 * w ** 1.35
  const angle =
    1.9 * Math.log(radius / 0.12) +
    (arm / VORTEX_ARMS) * TAU +
    across * 0.75 +
    t * SPIN
  out.x = radius * Math.cos(angle)
  out.y = radius * Math.sin(angle)
  out.z = -(1 - w) * VORTEX_DEPTH
}

/** The data ocean: layered swells over a deep abyss on the right (positive y is down). */
export const OCEAN = {
  sea: 0.55,
  halfWidth: 5,
  near: 1.6,
  far: 10,
  /** Sheets of streams stacked downward, so the sea has depth instead of one surface. */
  layers: 4,
  layerGap: 0.6,
  abyssX: 2,
  abyssZ: -5,
  abyssRadius: 0.75,
  /** How far from the abyss the sea is drawn into its whirlpool. */
  pullRadius: 3.8,
  /** How far the whirlpool funnel sinks below the surface at its centre. */
  funnelDepth: 1.3,
}

/** The whirlpool round the abyss: foam arms on a log spiral, sinking to a small dark eye. */
export const WHIRL = {
  arms: 3,
  /** Radians the arms turn per unit of ln(radius): higher winds tighter. */
  wind: 1.9,
  /** Arm spin in radians per second at the rim; inner turns are faster. */
  spin: 0.35,
  /** Radius of the dark eye at the bottom. */
  eye: 0.32,
  /** Extra fixed curl toward the eye, so inner arms wrap tightly without winding over time. */
  curl: 3.4,
}

/** Angle of spiral arm `arm` at distance `r` from the abyss centre. */
export function whirlAngle(arm: number, r: number, t: number) {
  const rim = OCEAN.pullRadius
  return (
    (arm / WHIRL.arms) * TAU -
    Math.log(Math.max(r, WHIRL.eye) / rim) * WHIRL.wind +
    WHIRL.curl * Math.max(0, 1 - r / rim) +
    // One rotation rate at every radius: the spiral keeps its shape however long it plays.
    t * WHIRL.spin
  )
}

/** How far below the surface the whirlpool is at distance `r`: a steepening funnel. */
export function whirlDepth(r: number) {
  const pull = Math.max(0, 1 - r / OCEAN.pullRadius)
  return OCEAN.funnelDepth * pull ** 2.6
}

/** Depth below the surface of the last ocean point, read by the renderer to darken deep glyphs. */
export const oceanSample = { depth: 0 }

/**
 * A wide, deep sea of data streams. Lanes form stacked sheets that swell like the
 * wave section; around the abyss every sheet is wound into a whirlpool that
 * narrows and sinks into a deep funnel, so streams are visibly swallowed.
 */
export function oceanPoint(u: number, v: number, t: number, out: Vec3) {
  const lane = ((v + 1) / 2) * OCEAN.layers
  const layer = Math.min(OCEAN.layers - 1, Math.floor(lane))
  // Each lane is folded into several rows, so every sheet is a dense field of streams.
  const fold = 6
  const row = Math.min(fold - 1, Math.floor(u * fold))
  const across = (row + (lane - layer)) / fold
  const x = (u * fold - row) * 2 * OCEAN.halfWidth - OCEAN.halfWidth
  const z = OCEAN.near - across ** 1.15 * OCEAN.far
  const dx = x - OCEAN.abyssX
  const dz = z - OCEAN.abyssZ
  const r = Math.max(WHIRL.eye, Math.hypot(dx, dz))
  let px = x
  let pz = z
  let sink = 0
  if (r < OCEAN.pullRadius) {
    // Inside the whirlpool glyphs gather onto the nearest foam arm and sink with it.
    const pull = 1 - r / OCEAN.pullRadius
    const spacing = TAU / WHIRL.arms
    const base = Math.atan2(dz, dx)
    const arm0 = whirlAngle(0, r, t)
    const offset = base - arm0
    const nearest = arm0 + Math.round(offset / spacing) * spacing
    const snap = Math.min(0.85, pull * 1.6)
    const angle = base + (nearest - base) * snap
    px = OCEAN.abyssX + Math.cos(angle) * r
    pz = OCEAN.abyssZ + Math.sin(angle) * r
    sink = whirlDepth(r)
  }
  const swell = 0.36 * (1 - layer * 0.16)
  const surface =
    swell * Math.sin(px * 0.9 + pz * 0.5 + t * 0.8 + layer * 0.7) +
    swell * 0.55 * Math.sin(px * 2.1 - pz * 1.3 - t * 1.1 + layer)
  // Swells flatten as they fall into the funnel.
  const calm = 1 - Math.min(1, sink / 0.8)
  const depth = layer * OCEAN.layerGap + sink
  oceanSample.depth = depth
  out.x = px
  out.z = pz
  out.y = OCEAN.sea + depth + surface * calm
}

/** Where a shape sits on screen: centre as viewport fractions, size against the short side. */
export type Pose = {
  cx: number
  cy: number
  size: number
  yaw: number
  pitch: number
  roll: number
  /** Yaw radians per second of the shape's idle turn. */
  spin: number
  /** Amplitude of a slow yaw sway, so a face-on shape still shows its depth. */
  sway: number
  /** Camera push toward the scene as a fraction of focal length. */
  dolly: number
}

const pose = (
  cx: number,
  cy: number,
  size: number,
  pitch: number,
  roll: number,
  extra: Partial<Pose> = {}
): Pose => ({
  cx,
  cy,
  size,
  yaw: 0,
  pitch,
  roll,
  spin: 0,
  sway: 0,
  dolly: 0,
  ...extra,
})

const DESKTOP_POSES: Pose[] = [
  // Large and close to face-on, so the hollow centre frames the headline.
  pose(0.5, 0.52, 0.5, 0.78, 0.3, { sway: 0.34 }),
  pose(0.5, 0.56, 0.5, 0.42, -0.08, { yaw: -0.35, dolly: 0.12 }),
  // Upright DNA on the right, tipped slightly toward the viewer.
  pose(0.7, 0.5, 0.5, 0.14, 0.08, { sway: 0.2 }),
  pose(0.5, 0.5, 0.62, 0, 0, { dolly: 0.42 }),
  // High overhead view across the sea toward the far ranges.
  pose(0.5, 0.8, 0.26, -0.45, 0),
]

// On narrow screens copy stacks over the sculpture, so shapes stay centred and smaller.
const COMPACT_SIZE = [0.82, 1.1, 0.82, 0.82, 1]
const COMPACT_POSES: Pose[] = DESKTOP_POSES.map((value, index) => ({
  ...value,
  cx: 0.5,
  cy: index >= 3 ? value.cy : 0.42,
  // The abyss sits right of centre; on a narrow screen shift the sea so it stays in frame.
  ...(index === 4 ? { cx: 0.5 - 0.62 } : {}),
  size: value.size * COMPACT_SIZE[index],
}))

export function posesFor(compact: boolean): Pose[] {
  return compact ? COMPACT_POSES : DESKTOP_POSES
}

/** Quintic ease with zero velocity and acceleration at both ends. */
export function smootherstep(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Continuous stage from the reading position: 0 at the first section's centre,
 * `centers.length - 1` at the last one's, linear between neighbouring centres.
 */
export function stageAt(viewCenter: number, centers: number[]) {
  if (centers.length < 2 || viewCenter <= centers[0]) return 0
  for (let index = 0; index < centers.length - 1; index++) {
    const next = centers[index + 1]
    if (viewCenter < next) {
      const span = next - centers[index] || 1
      return index + (viewCenter - centers[index]) / span
    }
  }
  return centers.length - 1
}

export type MorphSegment = {
  from: number
  to: number
  /** Blend from `from` (0) to `to` (1). */
  mix: number
  /** Peaks mid-change and rests at 0 while a shape is held. */
  energy: number
}

/** Each shape holds while its copy is read and blends only between sections. */
export function segmentAt(stage: number): MorphSegment {
  const clamped = Math.max(0, Math.min(SHAPE_COUNT - 1, stage))
  const from = Math.min(SHAPE_COUNT - 2, Math.floor(clamped))
  const mix = smootherstep((clamped - from - 0.16) / 0.68)
  return { from, to: from + 1, mix, energy: Math.sin(mix * Math.PI) }
}

/** Shape weights for a stage; they always sum to 1. */
export function shapeWeights(stage: number) {
  const segment = segmentAt(stage)
  const weights = Array.from({ length: SHAPE_COUNT }, () => 0)
  weights[segment.from] = 1 - segment.mix
  weights[segment.to] += segment.mix
  return weights
}

/**
 * Camera push for a stage. Into the vortex the camera first lines up with the
 * helix, then flies down its axis; out of it the camera rides the eruption
 * forward before pulling back over the sea.
 */
export function dollyAt(stage: number, poses: Pose[]) {
  const segment = segmentAt(stage)
  const base =
    poses[segment.from].dolly +
    (poses[segment.to].dolly - poses[segment.from].dolly) * segment.mix
  const window = (start: number, end: number) =>
    Math.sin(
      Math.max(0, Math.min(1, (segment.mix - start) / (end - start))) * Math.PI
    )
  // Into the vortex the camera moves in steadily: no rush and pull-back.
  if (segment.to === VORTEX_INDEX) return base
  if (segment.from === VORTEX_INDEX) return base + window(0.2, 0.75) * 0.32
  return base + segment.energy * 0.08
}

/** Applies a pose's rotation, scale and offset; `unit` is pixels per shape unit. */
export function placePoint(
  point: Vec3,
  pose: Pose,
  yaw: number,
  unit: number,
  width: number,
  height: number,
  out: Vec3
): Vec3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pose.pitch)
  const sp = Math.sin(pose.pitch)
  const cr = Math.cos(pose.roll)
  const sr = Math.sin(pose.roll)
  const x1 = point.x * cy + point.z * sy
  const z1 = -point.x * sy + point.z * cy
  const y2 = point.y * cp - z1 * sp
  const z2 = point.y * sp + z1 * cp
  out.x = (x1 * cr - y2 * sr) * unit + (pose.cx - 0.5) * width
  out.y = (x1 * sr + y2 * cr) * unit + (pose.cy - 0.5) * height
  out.z = z2 * unit
  return out
}

/** Screen angle of the flow direction between two projected points. */
export function tangentAngle(
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/**
 * How readable a section is: 1 while it fills the viewport, fading to 0 as it
 * leaves. `offset` is the signed distance in viewports, for a small parallax shift.
 */
export function sectionReveal(top: number, height: number, viewport: number) {
  const offset = (top + height / 2 - viewport / 2) / viewport
  const hold = Math.max(0, (height - viewport) / (2 * viewport)) + 0.1
  const reveal = 1 - smootherstep((Math.abs(offset) - hold) / 0.34)
  return { reveal, offset }
}

export type AutoplayStop = { top: number; hold: number; move: number }

/**
 * Autoplay timeline: rests at each stop for `hold` seconds, then glides to the
 * next over `move` seconds with an eased start and finish. Returns the scroll
 * position for `seconds` and whether the timeline has ended.
 */
export function autoplayAt(seconds: number, stops: AutoplayStop[]) {
  let time = Math.max(0, seconds)
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]
    if (time < stop.hold) return { top: stop.top, done: false }
    time -= stop.hold
    const next = stops[index + 1]
    if (!next) break
    if (time < stop.move) {
      return {
        top: stop.top + (next.top - stop.top) * smootherstep(time / stop.move),
        done: false,
      }
    }
    time -= stop.move
  }
  return { top: stops.at(-1)?.top ?? 0, done: true }
}
