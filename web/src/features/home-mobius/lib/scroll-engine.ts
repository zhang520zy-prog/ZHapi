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
import { DATA_GLYPHS } from './glyph-field'
import {
  dollyAt,
  placePoint,
  posesFor,
  OCEAN,
  DNA_INDEX,
  HELIX,
  helixFrame,
  helixPoint,
  oceanSample,
  OCEAN_INDEX,
  RING_LAYERS,
  WHIRL,
  whirlAngle,
  whirlDepth,
  segmentAt,
  shapePoint,
  shapeWeights,
  smootherstep,
  tangentAngle,
  VORTEX_ARMS,
  VORTEX_DEPTH,
  VORTEX_INDEX,
  type Pose,
  type Vec3,
} from './scroll-morph'

export interface ScrollEngine {
  setActive: (active: boolean) => void
  /** Draws one frame immediately (used for reduced motion and tests). */
  render: () => void
  /** Brand marks drawn as badges on the DNA rungs, along the vortex arms and in the eruption. */
  setIcons: (icons: CanvasImageSource[]) => void
  destroy: () => void
}

export type Particle = {
  u: number
  v: number
  speed: number
  glyph: number
  size: number
  alpha: number
  /** Offsets through the band's thickness, in shape units. */
  dx: number
  dy: number
  dz: number
  /** 0 → morphs first, 1 → last: shapes change leaf by leaf, not all at once. */
  stagger: number
  head: boolean
  /** Unit direction a glyph flies off in while a shape dissolves. */
  sx: number
  sy: number
  sz: number
  /** Lane on a sheet's edge in the ring: drawn brighter so each sheet reads as a ribbon. */
  edge: boolean
}

const TAU = Math.PI * 2
const ATLAS_CELL = 48
const ATLAS_COLUMNS = 24
/** The atlas holds the data glyphs plus one round dot, used while shapes turn to particles. */
const ATLAS_GLYPHS = [...DATA_GLYPHS, '●']
const DOT_GLYPH = DATA_GLYPHS.length
const ATLAS_ROWS = Math.ceil(ATLAS_GLYPHS.length / ATLAS_COLUMNS)
const SHADES = [
  '#10301f',
  '#17573a',
  '#21864f',
  '#36c06b',
  '#66ef97',
  '#b4ffce',
  '#f3fff6',
]
const BUCKETS = 48
/** Thickness noise per shape: the ring's sheets stay crisp, the sea and DNA a little loose. */
const JITTER = [0.12, 1, 0.55, 1, 0.7]

/** Lanes across the band, glyphs along each lane; seeded so every load is identical. */
export function createParticles(compact: boolean): Particle[] {
  const lanes = compact ? 10 : 16
  const perLane = compact ? 380 : 560
  let seed = 20261106
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: lanes * perLane }, (_, index) => {
    const lane = index % lanes
    const slot = Math.floor(index / lanes)
    const run = 14 + (lane % 5) * 3
    const head = slot % run === 0
    const tail = (slot % run) / run
    return {
      u: (slot + random() * 0.8) / perLane,
      v: ((lane + 0.2 + random() * 0.6) / lanes) * 2 - 1,
      // Lanes flow at clearly different paces, so the sheets slide past each other.
      speed: 0.007 + ((lane * 7) % 5) * 0.003 + random() * 0.003,
      glyph: Math.floor(random() * DATA_GLYPHS.length),
      size: 0.85 + random() * 0.3,
      alpha: head ? 1 : 0.32 + (1 - tail) ** 1.5 * 0.6,
      dx: (random() - 0.5) * 0.05,
      dy: (random() - 0.5) * 0.05,
      dz: (random() - 0.5) * 0.09,
      // Shapes change leaf by leaf along the flow, with a little scatter.
      stagger: (slot / perLane) * 0.26 + random() * 0.08,
      head,
      ...scatter(random),
      edge:
        lane % (lanes / RING_LAYERS) === 0 ||
        lane % (lanes / RING_LAYERS) === lanes / RING_LAYERS - 1,
    }
  })
}

function scatter(random: () => number) {
  const z = random() * 2 - 1
  const angle = random() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return { sx: r * Math.cos(angle), sy: r * Math.sin(angle), sz: z }
}

function createAtlas() {
  const atlas = document.createElement('canvas')
  atlas.width = ATLAS_COLUMNS * ATLAS_CELL
  atlas.height = ATLAS_ROWS * ATLAS_CELL * SHADES.length
  const ctx = atlas.getContext('2d')
  if (!ctx) return atlas
  ctx.font =
    '34px "SFMono-Regular", Menlo, "Hiragino Kaku Gothic ProN", "PingFang SC", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let shade = 0; shade < SHADES.length; shade++) {
    ctx.fillStyle = SHADES[shade]
    for (let glyph = 0; glyph < ATLAS_GLYPHS.length; glyph++) {
      ctx.fillText(
        ATLAS_GLYPHS[glyph],
        (glyph % ATLAS_COLUMNS) * ATLAS_CELL + ATLAS_CELL / 2,
        (Math.floor(glyph / ATLAS_COLUMNS) + shade * ATLAS_ROWS) * ATLAS_CELL +
          ATLAS_CELL / 2
      )
    }
  }
  return atlas
}

function createGrain() {
  const grain = document.createElement('canvas')
  grain.width = 160
  grain.height = 160
  const ctx = grain.getContext('2d')
  if (!ctx || typeof ctx.createImageData !== 'function') return grain
  const image = ctx.createImageData(160, 160)
  let seed = 7
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const value = seed >>> 24
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
    image.data[index + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return grain
}

/**
 * One fixed canvas behind the whole page. `readStage` returns the scroll stage
 * (0 = hero … 4 = closing); the drawn stage follows it with a little inertia.
 */
export function createScrollEngine(
  canvas: HTMLCanvasElement,
  readStage: () => number
): ScrollEngine | null {
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return null
  const ctx = context
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const atlas = createAtlas()
  const grain = createGrain()
  const desktop = createParticles(false)
  const mobile = createParticles(true)
  const dust = Array.from({ length: 70 }, (_, index) => ({
    x: (index * 0.618034) % 1,
    y: (index * 0.754877) % 1,
    depth: 0.3 + ((index * 0.381966) % 1) * 0.7,
    size: 1 + ((index * 7) % 3),
  }))
  const a: Vec3 = { x: 0, y: 0, z: 0 }
  const b: Vec3 = { x: 0, y: 0, z: 0 }
  const placedA: Vec3 = { x: 0, y: 0, z: 0 }
  const placedB: Vec3 = { x: 0, y: 0, z: 0 }
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ]
  const order = new Int32Array(desktop.length)
  const heads = new Int32Array(BUCKETS)
  const drawX = new Float32Array(desktop.length)
  const drawY = new Float32Array(desktop.length)
  const drawZ = new Float32Array(desktop.length)
  const drawAngle = new Float32Array(desktop.length)
  const drawSize = new Float32Array(desktop.length)
  const drawStretch = new Float32Array(desktop.length)
  const drawAlpha = new Float32Array(desktop.length)
  const drawShade = new Uint8Array(desktop.length)
  let width = 1
  let height = 1
  let pixelRatio = 1
  let vignette: CanvasGradient | null = null
  let grainPattern: CanvasPattern | null = null
  let stage = readStage()
  let clock = 0
  let flow = 0
  let lastFrame = 0
  let frameId = 0
  let active = false
  let disposed = false
  // Per-frame blend inputs, shared by every sample of the frame.
  let from = 0
  let to = 1
  let unitA = 1
  let unitB = 1
  let yawA = 0
  let yawB = 0
  /** The leaving shape's pose this frame: a shot can move it before the next shape forms. */
  let poseA: Pose = posesFor(false)[0]
  let helixTwist = 1
  let sampleDepth = 0

  /** Shape-space position of a particle, with its thickness noise. */
  function shapeAt(
    shape: number,
    particle: Particle,
    u: number,
    v: number,
    out: Vec3
  ) {
    if (shape === DNA_INDEX) helixPoint(u, v, clock, out, helixTwist)
    else shapePoint(shape, u, v, clock, out)
    if (shape === OCEAN_INDEX) sampleDepth = oceanSample.depth
    out.x += particle.dx * JITTER[shape]
    out.y += particle.dy * JITTER[shape]
    out.z += particle.dz * JITTER[shape]
    return out
  }

  const core: Vec3 = { x: 0, y: 0, z: 0 }
  const corePlaced: Vec3 = { x: 0, y: 0, z: 0 }

  /**
   * Position of (u, v) between the two current shapes, in placed pixels. Each
   * change follows its own shot instead of one generic scatter:
   * ring → waves unzips along the flow; waves → DNA rises as a ladder of dots
   * that then winds up; DNA → vortex turns end-on and becomes the tunnel;
   * vortex → ocean is drawn into the core, bursts at the camera, rains on the sea.
   */
  function sample(
    particle: Particle,
    u: number,
    v: number,
    mix: number,
    energy: number,
    out: Vec3
  ) {
    const poses = posesFor(width < 700)
    if (from === VORTEX_INDEX) {
      // Drawn into the core: the streams accelerate down the tunnel first.
      const suck = smootherstep(mix / 0.32)
      shapeAt(VORTEX_INDEX, particle, u + (1 - u) * suck * 0.97, v, a)
      placePoint(a, poseA, yawA, unitA, width, height, placedA)
      core.x = 0
      core.y = 0
      core.z = -VORTEX_DEPTH
      placePoint(core, poseA, yawA, unitA, width, height, corePlaced)
      // Burst: every glyph leaves the core along its own direction, mostly toward the camera.
      const burst = smootherstep((mix - 0.26) / 0.3)
      const reach = unitA * burst
      const bx = corePlaced.x + particle.sx * reach * 1.7
      const by = corePlaced.y + particle.sy * reach * 1.3
      const bz = corePlaced.z + reach * (2.4 + particle.sz)
      // Rain: they come down onto their place in the sea.
      const fall = smootherstep((mix - 0.55) / 0.45)
      shapeAt(OCEAN_INDEX, particle, u, v, b)
      placePoint(b, poses[to], yawB, unitB, width, height, placedB)
      const sx = placedA.x + (bx - placedA.x) * burst
      const sy = placedA.y + (by - placedA.y) * burst
      const sz = placedA.z + (bz - placedA.z) * burst
      out.x = sx + (placedB.x - sx) * fall
      out.y = sy + (placedB.y - sy) * fall
      out.z = sz + (placedB.z - sz) * fall
      return out
    }
    shapeAt(from, particle, u, v, a)
    if (from === 0 && energy > 0) {
      // Unzip: streams slide off the ring along their own flow direction.
      const theta = u * TAU * 2
      const peel = energy * 0.55
      a.x -= Math.sin(theta) * peel
      a.y += Math.cos(theta) * peel
    }
    placePoint(a, poseA, yawA, unitA, width, height, placedA)
    if (mix <= 0) {
      out.x = placedA.x
      out.y = placedA.y
      out.z = placedA.z
      return out
    }
    shapeAt(to, particle, u, v, b)
    placePoint(b, poses[to], yawB, unitB, width, height, placedB)
    out.x = placedA.x + (placedB.x - placedA.x) * mix
    out.y = placedA.y + (placedB.y - placedA.y) * mix
    out.z = placedA.z + (placedB.z - placedA.z) * mix
    if (from === 1) {
      // Waves lift into the ladder: a gentle arc instead of a scatter.
      out.y -= energy * unitB * 0.18
      out.z += energy * unitB * 0.25 * Math.sin(u * TAU + v)
    }
    return out
  }

  function drawBackdrop(stageValue: number, beam: number) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#080c0a'
    ctx.fillRect(0, 0, width, height)
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.55,
      0,
      width * 0.5,
      height * 0.55,
      Math.max(width, height) * 0.7
    )
    glow.addColorStop(0, `rgba(30, 64, 42, ${0.34 + stageValue * 0.04})`)
    glow.addColorStop(1, 'rgba(8, 12, 10, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)
    if (beam <= 0.01) return
    // Volumetric shaft: a soft additive band, tilted like light from a high window.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const travel = Math.max(0, Math.min(1, (stageValue - 0.25) / 1.5))
    ctx.translate(width * (-0.15 + travel * 1.3), -height * 0.1)
    ctx.rotate(0.34)
    const band = Math.max(width, height) * 0.13
    const shaft = ctx.createLinearGradient(-band, 0, band, 0)
    shaft.addColorStop(0, 'rgba(150, 255, 190, 0)')
    shaft.addColorStop(0.5, `rgba(170, 255, 205, ${0.11 * beam})`)
    shaft.addColorStop(1, 'rgba(150, 255, 190, 0)')
    ctx.fillStyle = shaft
    ctx.fillRect(-band, -height * 0.3, band * 2, height * 1.9)
    ctx.restore()
  }

  const placed: Vec3 = { x: 0, y: 0, z: 0 }
  const screen = { x: 0, y: 0, scale: 0 }
  let icons: CanvasImageSource[] = []

  /** A shape's yaw this frame: its rest angle plus idle spin and sway. */
  function turnOf(pose: Pose) {
    return pose.yaw + clock * pose.spin + Math.sin(clock * 0.28) * pose.sway
  }

  /** Projects a point of shape `shape` (its own units) to the screen; false when behind the camera. */
  function project(
    point: Vec3,
    shape: number,
    camera: number,
    distance: number
  ) {
    const poses = posesFor(width < 700)
    const short = Math.min(width, height)
    const pose = shape === from ? poseA : poses[shape]
    const unit = shape === from ? unitA : pose.size * short
    placePoint(point, pose, turnOf(pose), unit, width, height, placed)
    const depth = camera - placed.z
    if (depth < distance * 0.12) return false
    screen.scale = distance / depth
    screen.x = width / 2 + placed.x * screen.scale
    screen.y = height / 2 + placed.y * screen.scale
    return true
  }

  /** A model badge: dark glass disc, green rim and halo, the brand mark inside. */
  function drawBadge(
    icon: CanvasImageSource,
    x: number,
    y: number,
    size: number,
    alpha: number
  ) {
    if (alpha <= 0.01 || size < 3) return
    const radius = size / 2
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * 0.55
    const halo = ctx.createRadialGradient(
      x,
      y,
      radius * 0.6,
      x,
      y,
      radius * 2.4
    )
    halo.addColorStop(0, 'rgba(110, 240, 160, 0.5)')
    halo.addColorStop(1, 'rgba(60, 160, 100, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(x - radius * 2.4, y - radius * 2.4, radius * 4.8, radius * 4.8)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(236, 255, 242, 0.94)'
    ctx.strokeStyle = 'rgba(140, 250, 180, 0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
    ctx.stroke()
    const mark = size * 0.66
    ctx.drawImage(icon, x - mark / 2, y - mark / 2, mark, mark)
  }

  /** A soft glow at the far end of the tunnel, where the streams and agents sink. */
  function drawVortexCore(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    if (
      !project({ x: 0, y: 0, z: -VORTEX_DEPTH }, VORTEX_INDEX, camera, distance)
    ) {
      return
    }
    const glow = Math.min(width, height) * 0.22 * screen.scale
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = weight
    const halo = ctx.createRadialGradient(
      screen.x,
      screen.y,
      0,
      screen.x,
      screen.y,
      glow
    )
    halo.addColorStop(0, 'rgba(150, 255, 190, 0.42)')
    halo.addColorStop(1, 'rgba(60, 160, 100, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(screen.x - glow, screen.y - glow, glow * 2, glow * 2)
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Agent badges sit on every other DNA rung, turning with the helix. */
  function drawHelixBadges(weight: number, camera: number, distance: number) {
    if (weight <= 0.01 || !icons.length) return
    const badges: {
      icon: CanvasImageSource
      x: number
      y: number
      scale: number
      z: number
    }[] = []
    for (let rung = 1; rung < HELIX.rungs; rung += 2) {
      const { theta, y } = helixFrame((rung + 0.5) / HELIX.rungs, clock)
      // A badge rides back and forth along its rung, carrying data between the strands.
      const across = Math.sin(clock * 0.8 + rung) * 0.55
      const point = {
        x: HELIX.radius * across * Math.cos(theta),
        y,
        z: HELIX.radius * across * Math.sin(theta),
      }
      if (!project(point, DNA_INDEX, camera, distance)) continue
      badges.push({
        icon: icons[((rung - 1) / 2) % icons.length],
        x: screen.x,
        y: screen.y,
        scale: screen.scale,
        z: placed.z,
      })
    }
    badges.sort((left, right) => left.z - right.z)
    const short = Math.min(width, height)
    for (const badge of badges) {
      const size = Math.min(48, Math.max(16, short * 0.036 * badge.scale))
      drawBadge(
        badge.icon,
        badge.x,
        badge.y,
        size,
        weight * (0.6 + 0.4 * badge.scale)
      )
    }
  }

  /** Agents ride the tunnel's spiral arms, sinking toward the core with the streams. */
  function drawVortexAgents(weight: number, camera: number, distance: number) {
    if (weight <= 0.01 || !icons.length) return
    const point: Vec3 = { x: 0, y: 0, z: 0 }
    const short = Math.min(width, height)
    for (let index = 0; index < 14; index++) {
      const u = (index / 14 + clock * 0.035) % 1
      const v = (((index * 5) % VORTEX_ARMS) / VORTEX_ARMS) * 2 - 1 + 0.12
      shapePoint(VORTEX_INDEX, u, v, clock, point)
      if (!project(point, VORTEX_INDEX, camera, distance)) continue
      // Shrinks and fades as it reaches the core, where the orbiting ring takes over.
      const fade = weight * Math.min(1, (1 - u) * 4) * Math.min(1, u * 6)
      const size = Math.min(56, Math.max(14, short * 0.04 * screen.scale))
      drawBadge(icons[index % icons.length], screen.x, screen.y, size, fade)
    }
  }

  // Tangled ridgelines: each range is several loose strands drawn over each other,
  // like a hand-scribbled contour, so the ranges read in layers without a grid.
  const RANGE_COUNT = 5
  const STRANDS = 8
  const RIDGE_POINTS = 96
  const ranges = Array.from({ length: RANGE_COUNT }, (_, range) => {
    const z = OCEAN.abyssZ - 5 - range * 1.3
    const base = Array.from({ length: RIDGE_POINTS }, (_, index) => {
      const x = (index / (RIDGE_POINTS - 1) - 0.5) * 24
      const ridge =
        Math.abs(Math.sin(x * 0.42 + range * 1.7)) * 0.62 +
        Math.abs(Math.sin(x * 1.05 + range * 0.6)) * 0.28 +
        Math.sin(x * 2.7 + range * 2.3) * 0.08
      return { x, h: Math.max(0, ridge) * (0.62 + range * 0.2) }
    })
    let seed = 977 + range * 131
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const strands = Array.from({ length: STRANDS }, () => {
      const phase = random() * TAU
      const wobble = 0.03 + random() * 0.1
      const freq = 1.4 + random() * 3.2
      const lift = (random() - 0.5) * 0.18
      const dz = (random() - 0.5) * 0.6
      const squash = 0.78 + random() * 0.3
      return base.map(({ x, h }) => ({
        x,
        y:
          OCEAN.sea -
          h * squash * (1 + 0.12 * Math.sin(x * freq * 0.35 + phase)) -
          lift -
          wobble * Math.sin(x * freq + phase),
        z: z + dz,
      }))
    })
    return { z, base, strands }
  })

  function strokeLine(points: Vec3[], camera: number, distance: number) {
    let open = false
    ctx.beginPath()
    for (const point of points) {
      if (!project(point, OCEAN_INDEX, camera, distance)) {
        open = false
        continue
      }
      if (open) ctx.lineTo(screen.x, screen.y)
      else ctx.moveTo(screen.x, screen.y)
      open = true
    }
    ctx.stroke()
  }

  /** Behind the glyph sea: layered mountain ranges of tangled lines, far to near. */
  function drawLandscape(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    ctx.lineWidth = 1
    for (let range = RANGE_COUNT - 1; range >= 0; range--) {
      const { z, base, strands } = ranges[range]
      const tone = 1 - range / RANGE_COUNT
      // A dark silhouette first, so nearer ranges hide the ones behind them.
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = weight
      ctx.fillStyle = '#070b09'
      ctx.beginPath()
      let started = false
      for (const { x, h } of base) {
        if (
          !project(
            { x, y: OCEAN.sea - h * 0.95, z },
            OCEAN_INDEX,
            camera,
            distance
          )
        ) {
          continue
        }
        if (started) ctx.lineTo(screen.x, screen.y)
        else ctx.moveTo(screen.x, screen.y)
        started = true
      }
      if (project({ x: 12, y: OCEAN.sea, z }, OCEAN_INDEX, camera, distance)) {
        ctx.lineTo(screen.x, screen.y)
      }
      if (project({ x: -12, y: OCEAN.sea, z }, OCEAN_INDEX, camera, distance)) {
        ctx.lineTo(screen.x, screen.y)
      }
      ctx.fill()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(110, 235, 150, ${(0.07 + tone * 0.2) * weight})`
      for (const strand of strands) strokeLine(strand, camera, distance)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  /**
   * The body of the sea: an opaque dark mass from the horizon down, so the page
   * background never shows through and the water reads as bottomless.
   */
  function drawOceanBody(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    if (
      !project(
        { x: 0, y: OCEAN.sea, z: OCEAN.near - OCEAN.far },
        OCEAN_INDEX,
        camera,
        distance
      )
    ) {
      return
    }
    const horizon = Math.max(0, screen.y - 6)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = weight
    const body = ctx.createLinearGradient(0, horizon, 0, height)
    body.addColorStop(0, 'rgba(6, 30, 26, 1)')
    body.addColorStop(0.35, 'rgba(3, 18, 16, 1)')
    body.addColorStop(1, 'rgba(1, 6, 6, 1)')
    ctx.fillStyle = body
    ctx.fillRect(0, horizon, width, height - horizon)
    // A faint haze on the horizon line joins the sea to the mountains.
    const haze = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 40)
    haze.addColorStop(0, 'rgba(60, 150, 100, 0)')
    haze.addColorStop(0.5, 'rgba(60, 150, 100, 0.12)')
    haze.addColorStop(1, 'rgba(60, 150, 100, 0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, horizon - 30, width, 70)
    ctx.globalAlpha = 1
  }

  // Inflow streams: glyph trains spiralling in from the sea and dropping into the abyss.
  const INFLOW_ARMS = 6
  const inflow = Array.from({ length: 220 }, (_, index) => ({
    arm: index % INFLOW_ARMS,
    phase: (index * 0.618034) % 1,
    glyph: (index * 7) % DATA_GLYPHS.length,
  }))

  function drawInflow(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    const short = Math.min(width, height)
    ctx.globalCompositeOperation = 'lighter'
    for (const item of inflow) {
      // Each glyph takes about 6 s to travel from the edge of the pull to the mouth.
      const life = (item.phase + clock / 6) % 1
      const radius = OCEAN.pullRadius * (1 - life) ** 1.25 + 0.05
      // A log spiral: the closer in, the faster the turn.
      const angle = whirlAngle(item.arm % WHIRL.arms, radius, clock)
      const sink = whirlDepth(radius)
      const point = {
        x: OCEAN.abyssX + Math.cos(angle) * radius,
        y: OCEAN.sea + sink,
        z: OCEAN.abyssZ + Math.sin(angle) * radius,
      }
      if (!project(point, OCEAN_INDEX, camera, distance)) continue
      const fade =
        weight *
        Math.min(1, life * 5) *
        (1 - smootherstep((life - 0.85) / 0.15))
      if (fade <= 0.01) continue
      const size = Math.min(22, Math.max(6, short * 0.013 * screen.scale))
      const shade = life > 0.6 ? 6 : 5
      ctx.globalAlpha = fade
      ctx.drawImage(
        atlas,
        (item.glyph % ATLAS_COLUMNS) * ATLAS_CELL,
        (Math.floor(item.glyph / ATLAS_COLUMNS) + shade * ATLAS_ROWS) *
          ATLAS_CELL,
        ATLAS_CELL,
        ATLAS_CELL,
        screen.x - size / 2,
        screen.y - size / 2,
        size,
        size
      )
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  const whirlPoint: Vec3 = { x: 0, y: 0, z: 0 }
  /** Projects the whirlpool surface point at distance `r` and angle `angle` round the abyss. */
  function whirlAt(r: number, angle: number, camera: number, distance: number) {
    whirlPoint.x = OCEAN.abyssX + Math.cos(angle) * r
    whirlPoint.y = OCEAN.sea + whirlDepth(r)
    whirlPoint.z = OCEAN.abyssZ + Math.sin(angle) * r
    return (
      project(whirlPoint, OCEAN_INDEX, camera, distance) && screen.scale < 1.6
    )
  }

  const WHIRL_STRANDS = 6
  const WHIRL_STEPS = 64
  const WHIRL_BANDS = 6

  /**
   * The whirlpool: a funnel that darkens smoothly toward a small black eye, foam
   * arms of fine strands on a log spiral, and glowing data lines running inward
   * along them. Arms brighten at mid radius and thin out toward the eye.
   */
  function drawWhirlpool(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    const rim = OCEAN.pullRadius
    const eye = WHIRL.eye
    // Funnel: many faint dark fills, so darkness builds up toward the centre with no edges.
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000403'
    for (let ring = 0; ring < 16; ring++) {
      const r = eye + (rim - eye) * (1 - ring / 16) ** 1.4
      ctx.beginPath()
      for (let step = 0; step <= 40; step++) {
        if (!whirlAt(r, (step / 40) * TAU, camera, distance)) continue
        if (step === 0) ctx.moveTo(screen.x, screen.y)
        else ctx.lineTo(screen.x, screen.y)
      }
      ctx.closePath()
      ctx.globalAlpha = weight * (0.08 + (ring / 16) * 0.12)
      ctx.fill()
    }
    // Foam arms and data lines, drawn in radius bands so brightness and width can vary.
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (let arm = 0; arm < WHIRL.arms; arm++) {
      for (let strand = 0; strand < WHIRL_STRANDS + 2; strand++) {
        const data = strand >= WHIRL_STRANDS
        const across = data
          ? (strand - WHIRL_STRANDS - 0.5) * 0.9
          : strand / (WHIRL_STRANDS - 1) - 0.5
        for (let band = 0; band < WHIRL_BANDS; band++) {
          const from = band / WHIRL_BANDS
          const to = (band + 1) / WHIRL_BANDS
          // Brightest a little outside mid radius, fading at the rim and near the eye.
          const mid = (from + to) / 2
          const glow = Math.sin(Math.min(1, mid * 1.15) * Math.PI) ** 0.8
          ctx.beginPath()
          let open = false
          for (let step = 0; step <= WHIRL_STEPS / WHIRL_BANDS; step++) {
            const f = from + (to - from) * (step / (WHIRL_STEPS / WHIRL_BANDS))
            const r = rim - (rim - eye) * f ** 0.85
            // Arms are wide at the rim and narrow toward the eye.
            const width = 0.32 * (r / rim) ** 0.6
            const angle =
              whirlAngle(arm, r, clock) + (across * width) / Math.max(r, 0.2)
            if (!whirlAt(r, angle, camera, distance)) {
              open = false
              continue
            }
            if (open) ctx.lineTo(screen.x, screen.y)
            else ctx.moveTo(screen.x, screen.y)
            open = true
          }
          if (data) {
            // Data lines: bright and dashed, the dashes running inward with the flow.
            ctx.setLineDash([10, 14])
            ctx.lineDashOffset = -clock * 46
            ctx.lineWidth = 1.6
            ctx.shadowColor = 'rgba(120, 255, 170, 0.9)'
            ctx.shadowBlur = 4
            ctx.strokeStyle = `rgba(150, 255, 190, ${weight * glow * 0.85})`
          } else {
            // Foam: fine pale strands, the centre strands brighter like a crest.
            const crest = 1 - Math.abs(across) * 1.4
            ctx.setLineDash([])
            ctx.lineWidth = 1
            ctx.shadowBlur = 0
            ctx.strokeStyle = `rgba(190, 245, 220, ${weight * glow * (0.12 + crest * 0.3)})`
          }
          ctx.stroke()
        }
      }
    }
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  /** The eye, drawn over the glyph sea so the hole stays black. */
  function drawWhirlEye(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    const eye = WHIRL.eye
    // The eye: a small black hole at the bottom of the funnel.
    if (whirlAt(eye * 0.2, 0, camera, distance)) {
      const hole = Math.min(width, height) * 0.05 * screen.scale
      canvas.dataset.eye = `${Math.round(screen.x)},${Math.round(screen.y)}`
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = weight
      ctx.save()
      ctx.translate(screen.x, screen.y)
      ctx.scale(1, 0.55)
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, hole * 2.2)
      core.addColorStop(0, 'rgba(0, 0, 0, 1)')
      core.addColorStop(0.45, 'rgba(0, 0, 0, 0.95)')
      core.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = core
      ctx.fillRect(-hole * 2.2, -hole * 2.2, hole * 4.4, hole * 4.4)
      ctx.restore()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // Wave crests on the open sea: short pale marks that flicker as the swell passes.
  const crests = Array.from({ length: 620 }, (_, index) => ({
    x: (((index * 0.618034) % 1) * 2 - 1) * OCEAN.halfWidth * 1.4,
    z: OCEAN.near - ((index * 0.754877) % 1) ** 1.2 * (OCEAN.far + 2),
    length: 0.06 + ((index * 0.381966) % 1) * 0.22,
    phase: ((index * 0.5698) % 1) * TAU,
    speed: 0.8 + ((index * 0.2871) % 1) * 1.6,
  }))

  function drawCrests(weight: number, camera: number, distance: number) {
    if (weight <= 0.01) return
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineWidth = 1
    const start: Vec3 = { x: 0, y: 0, z: 0 }
    for (const crest of crests) {
      const r = Math.hypot(crest.x - OCEAN.abyssX, crest.z - OCEAN.abyssZ)
      if (r < OCEAN.pullRadius * 0.95) continue
      const flicker =
        Math.max(0, Math.sin(clock * crest.speed + crest.phase)) ** 3
      if (flicker < 0.05) continue
      const y =
        OCEAN.sea -
        0.04 +
        0.05 * Math.sin(crest.x * 0.9 + crest.z * 0.5 + clock * 0.8)
      start.x = crest.x
      start.y = y
      start.z = crest.z
      if (!project(start, OCEAN_INDEX, camera, distance)) continue
      const x0 = screen.x
      const y0 = screen.y
      // Nearer crests are larger and brighter; far ones shrink into a fine haze.
      const near = Math.min(1, screen.scale)
      start.x = crest.x + crest.length
      if (!project(start, OCEAN_INDEX, camera, distance)) continue
      ctx.globalAlpha = weight * flicker * (0.15 + near * 0.55)
      ctx.strokeStyle = '#c9f5e0'
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(screen.x, screen.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // Geyser sparks: each loops launch → arc → splash, fanning out in every direction.
  const sparks = Array.from({ length: 560 }, (_, index) => {
    let seed = (index + 1) * 2654435761
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const icon = index % 35 === 0 ? (index / 35) % 8 : -1
    // Upward cone: a steep core jet plus a wide spray, agents spread across the whole fan.
    let steep = next() < 0.6 ? next() * 0.45 : 0.45 + next() * 0.9
    if (icon >= 0) steep = 0.7 + next() * 0.6
    return {
      phase: next(),
      period: 2.4 + next() * 2.2,
      // Agents take evenly spaced headings so they spray round the whole geyser.
      angle: icon >= 0 ? (index / 35) * 2.39996 : next() * TAU,
      tilt: steep,
      // Glyphs shoot higher; agents keep their old height.
      speed: icon >= 0 ? 2.4 + next() * 2.2 : 3.4 + next() * 2.8,
      glyph: Math.floor(next() * DATA_GLYPHS.length),
      size: 0.6 + next() * 0.9,
      icon,
    }
  })

  /**
   * The abyss: dark rings spiral down into a black core while the geyser throws
   * glyphs and agents out of it in every direction; each lands back on the sea.
   */
  function drawEruption(
    weight: number,
    agents: number,
    camera: number,
    distance: number
  ) {
    if (weight <= 0.01) return
    const ax = OCEAN.abyssX
    const az = OCEAN.abyssZ
    const short = Math.min(width, height)
    // Geyser: ballistic arcs out of the hole, fading as they fall back into the sea.
    ctx.globalCompositeOperation = 'lighter'
    const mouthY = OCEAN.sea + OCEAN.funnelDepth * 0.15
    for (const spark of sparks) {
      const life = (clock / spark.period + spark.phase) % 1
      const time = life * 1.6
      const up = spark.speed * Math.cos(spark.tilt)
      const out =
        spark.speed * Math.sin(spark.tilt) * (spark.icon >= 0 ? 1.5 : 0.55)
      const h = up * time - 2.6 * time * time
      const r = out * time
      const x = ax + Math.cos(spark.angle) * r
      const z = az + Math.sin(spark.angle) * r
      if (!project({ x, y: mouthY - h, z }, OCEAN_INDEX, camera, distance)) {
        continue
      }
      const fade =
        smootherstep(life / 0.18) *
        (1 - smootherstep((life - 0.7) / 0.3)) *
        weight
      if (fade <= 0.01) continue
      if (spark.icon >= 0 && icons[spark.icon]) {
        const size = Math.min(56, Math.max(18, short * 0.042 * screen.scale))
        drawBadge(icons[spark.icon], screen.x, screen.y, size, fade * agents)
        ctx.globalCompositeOperation = 'lighter'
        continue
      }
      const size = Math.min(26, 9 * spark.size * Math.max(0.5, screen.scale))
      let shade = 4
      if (life < 0.6) shade = 5
      if (life < 0.25) shade = 6
      ctx.globalAlpha = fade * 0.9
      ctx.drawImage(
        atlas,
        (spark.glyph % ATLAS_COLUMNS) * ATLAS_CELL,
        (Math.floor(spark.glyph / ATLAS_COLUMNS) + shade * ATLAS_ROWS) *
          ATLAS_CELL,
        ATLAS_CELL,
        ATLAS_CELL,
        screen.x - size / 2,
        screen.y - size / 2,
        size,
        size
      )
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawAtmosphere(stageValue: number) {
    ctx.globalCompositeOperation = 'lighter'
    for (const mote of dust) {
      const x = ((((mote.x + clock * 0.004 * mote.depth) % 1) + 1) % 1) * width
      const y =
        ((((mote.y -
          clock * 0.007 * mote.depth -
          stageValue * 0.09 * mote.depth) %
          1) +
          1) %
          1) *
        height
      ctx.globalAlpha = 0.05 + mote.depth * 0.13
      ctx.fillStyle = '#c8ffd8'
      ctx.fillRect(x, y, mote.size, mote.size)
    }
    ctx.globalCompositeOperation = 'source-over'
    if (grainPattern) {
      // Film grain shifts every frame so it reads as texture, not a fixed screen.
      const offset = Math.floor(clock * 24) % 7
      ctx.save()
      ctx.globalAlpha = 0.045
      ctx.translate(-offset * 17, -offset * 11)
      ctx.fillStyle = grainPattern
      ctx.fillRect(0, 0, width + 160, height + 160)
      ctx.restore()
    }
    if (vignette) {
      ctx.globalAlpha = 1
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)
    }
  }

  function draw() {
    const compact = width < 700
    const poses = posesFor(compact)
    const particles = compact ? mobile : desktop
    const segment = segmentAt(stage)
    from = segment.from
    to = segment.to
    const short = Math.min(width, height)
    // Each shot sets the leaving shape's pose and how far the glyphs have travelled.
    poseA = poses[from]
    unitA = poseA.size * short
    let shotMix = segment.mix
    let dots = 0
    helixTwist = 1
    if (to === DNA_INDEX) {
      // Waves rise into a flat ladder of dots first, then the ladder winds into DNA.
      shotMix = smootherstep(segment.mix / 0.55)
      helixTwist = smootherstep((segment.mix - 0.45) / 0.55)
      dots = Math.sin(Math.min(1, segment.mix / 0.85) * Math.PI)
    }
    if (from === DNA_INDEX) {
      // Pan to the helix and turn its axis toward the camera, then become the tunnel.
      // Gentle cubic eases spread over most of the change, so the speed never jumps.
      const ease = (value: number) => {
        const x = Math.max(0, Math.min(1, value))
        return x * x * (3 - 2 * x)
      }
      const turn = ease(segment.mix / 0.7)
      const target = poses[VORTEX_INDEX]
      const lerp = (left: number, right: number) => left + (right - left) * turn
      poseA = {
        ...poseA,
        cx: lerp(poseA.cx, target.cx),
        cy: lerp(poseA.cy, target.cy),
        pitch: lerp(poseA.pitch, Math.PI / 2),
        roll: lerp(poseA.roll, 0),
        sway: poseA.sway * (1 - turn),
      }
      unitA = lerp(poses[from].size, target.size * 1.2) * short
      // The strands start winding into the tunnel while the camera is still turning.
      shotMix = ease((segment.mix - 0.15) / 0.85)
    }
    unitB = poses[to].size * short
    yawA = turnOf(poseA)
    yawB = turnOf(poses[to])
    const distance = 2.2 * short
    const camera = distance * (1 - dollyAt(stage, poses))
    const beam = Math.max(0, 1 - Math.abs(stage - 1) / 0.75)
    const weights = shapeWeights(stage)
    const clearCopy = weights[0]
    const vortexWeight = weights[VORTEX_INDEX]
    const oceanWeight = weights[OCEAN_INDEX]
    // The badges gather only once the tunnel has formed, and stay while the sea forms.
    // Overlays belong to one shot: they enter only once their shape has fully
    // formed and leave as soon as the next change begins, so shots never overlap.
    const held = (shape: number) => {
      if (from === shape) return 1 - smootherstep(segment.mix / 0.1)
      if (to === shape) return smootherstep((segment.mix - 0.82) / 0.18)
      return 0
    }
    // The landscape rises only after the burst has cleared the frame.
    const oceanScene =
      to === OCEAN_INDEX ? smootherstep((segment.mix - 0.55) / 0.4) : 0

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawBackdrop(stage, beam)
    drawLandscape(oceanScene, camera, distance)
    drawOceanBody(oceanScene, camera, distance)
    // The whirlpool appears only once the camera has pulled back; drawn during the
    // close-up burst its lines would balloon across the whole frame.
    const whirl = held(OCEAN_INDEX)
    drawCrests(whirl, camera, distance)
    drawWhirlpool(whirl, camera, distance)
    // Fixed key light from the upper left, toward the viewer.
    const lx = -0.42
    const ly = -0.62
    const lz = 0.66
    // The window reflection: a narrow band that drifts across the surface normals.
    const streak = Math.sin(clock * 0.23) * 0.55 + (stage - 2) * 0.12
    const baseSize =
      (compact ? 8.5 : 10.5) * Math.min(1.25, Math.max(0.8, short / 820))
    const halfW = width / 2
    const halfH = height / 2
    let count = 0
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index]
      // DNA → vortex moves as one body, so there is never a half-helix next to a half-tunnel.
      let local = smootherstep(shotMix * 1.34 - particle.stagger)
      if (from === DNA_INDEX) local = shotMix
      if (from === VORTEX_INDEX) {
        local = Math.max(
          0,
          Math.min(1, shotMix * 1.12 - particle.stagger * 0.4)
        )
      }
      const energy = Math.sin(local * Math.PI)
      const u = (((particle.u + flow * particle.speed) % 1) + 1) % 1
      sampleDepth = 0
      sample(particle, u, particle.v, local, energy, points[0])
      const depthHere = sampleDepth
      sample(particle, u + 0.0025, particle.v, local, energy, points[1])
      sample(particle, u, particle.v + 0.03, local, energy, points[2])
      sampleDepth = depthHere
      const p = points[0]
      const depth = camera - p.z
      if (depth < distance * 0.16) continue
      const scale = distance / depth
      const x = halfW + p.x * scale
      const y = halfH + p.y * scale
      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue
      const ahead = points[1]
      const aheadScale = distance / Math.max(1, camera - ahead.z)
      const angle = tangentAngle(
        { x, y },
        { x: halfW + ahead.x * aheadScale, y: halfH + ahead.y * aheadScale }
      )
      // Surface normal from the flow and cross-band directions.
      const tx = ahead.x - p.x
      const ty = ahead.y - p.y
      const tz = ahead.z - p.z
      const sx = points[2].x - p.x
      const sy = points[2].y - p.y
      const sz = points[2].z - p.z
      let nx = ty * sz - tz * sy
      let ny = tz * sx - tx * sz
      let nz = tx * sy - ty * sx
      const nl = Math.hypot(nx, ny, nz) || 1
      nx /= nl
      ny /= nl
      nz /= nl
      if (nz < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz)
      const reflect = 2 * nz * nx
      const spec =
        Math.exp(-(((reflect - streak) / 0.11) ** 2)) * (0.4 + nz * 0.6)
      const nearness = Math.max(0, Math.min(1, (scale - 0.55) / 0.9))
      const light = 0.12 + diffuse * 0.5 + nearness * 0.28 + spec * 0.55
      let shade = Math.min(5, Math.floor(light * 5.2))
      if (particle.head || spec > 0.72) shade = 6
      // Glyphs rushing past the camera grow, then dissolve before they fill the frame.
      const passFade = 1 - smootherstep((scale - 1.5) / 0.9)
      // Keep the headline readable: glyphs dim inside an ellipse around the copy.
      const ex = (x - halfW) / (width * (compact ? 0.42 : 0.24))
      const ey = (y - halfH) / (height * (compact ? 0.2 : 0.2))
      const clear =
        1 -
        clearCopy * (1 - smootherstep((Math.hypot(ex, ey) - 0.7) / 0.5)) * 0.85
      // Deep sheets of the sea fade into the dark, like water getting deeper.
      const deep = oceanWeight * Math.min(1, sampleDepth * 0.5)
      const alpha =
        (1 - deep * 0.85) *
        particle.alpha *
        (0.32 + 0.68 * Math.min(1, light + 0.2)) *
        passFade *
        clear *
        (1 + clearCopy * (particle.edge ? 0.45 : -0.45))
      if (alpha < 0.02) continue
      drawX[count] = x
      drawY[count] = y
      drawZ[count] = p.z
      drawAngle[count] = angle
      drawSize[count] = Math.min(
        30,
        baseSize * particle.size * Math.max(0.55, scale)
      )
      drawStretch[count] = 1 + energy * 0.7 + vortexWeight * 0.4
      drawAlpha[count] = alpha
      drawShade[count] = shade
      // While the waves turn into DNA each glyph shows as a dot, then resolves back.
      const asDot = dots > 0 && (index * 0.618) % 1 < dots
      order[count] = asDot
        ? DOT_GLYPH
        : (particle.glyph + (particle.head ? Math.floor(flow * 5) : 0)) %
          DATA_GLYPHS.length
      if (asDot) {
        drawStretch[count] = 1
        drawSize[count] *= 0.55
      }
      count++
    }

    // Painter's order by depth buckets, far to near.
    heads.fill(-1)
    const links = drawLinks
    let minZ = Infinity
    let maxZ = -Infinity
    for (let index = 0; index < count; index++) {
      if (drawZ[index] < minZ) minZ = drawZ[index]
      if (drawZ[index] > maxZ) maxZ = drawZ[index]
    }
    const span = Math.max(1, maxZ - minZ)
    for (let index = 0; index < count; index++) {
      const bucket = Math.min(
        BUCKETS - 1,
        Math.floor(((drawZ[index] - minZ) / span) * BUCKETS)
      )
      links[index] = heads[bucket]
      heads[bucket] = index
    }
    ctx.globalCompositeOperation = 'lighter'
    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      for (let index = heads[bucket]; index !== -1; index = links[index]) {
        const size = drawSize[index]
        const cos = Math.cos(drawAngle[index])
        const sin = Math.sin(drawAngle[index])
        const stretch = drawStretch[index]
        ctx.setTransform(
          cos * stretch * pixelRatio,
          sin * stretch * pixelRatio,
          -sin * pixelRatio,
          cos * pixelRatio,
          drawX[index] * pixelRatio,
          drawY[index] * pixelRatio
        )
        ctx.globalAlpha = drawAlpha[index]
        const glyph = order[index]
        ctx.drawImage(
          atlas,
          (glyph % ATLAS_COLUMNS) * ATLAS_CELL,
          (Math.floor(glyph / ATLAS_COLUMNS) + drawShade[index] * ATLAS_ROWS) *
            ATLAS_CELL,
          ATLAS_CELL,
          ATLAS_CELL,
          -size / 2,
          -size / 2,
          size,
          size
        )
      }
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawHelixBadges(held(DNA_INDEX), camera, distance)
    drawVortexAgents(held(VORTEX_INDEX), camera, distance)
    drawVortexCore(held(VORTEX_INDEX), camera, distance)
    drawWhirlEye(whirl, camera, distance)
    drawInflow(held(OCEAN_INDEX), camera, distance)
    drawEruption(oceanScene, held(OCEAN_INDEX), camera, distance)
    drawAtmosphere(stage)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    canvas.dataset.stage = stage.toFixed(3)
    canvas.dataset.glyphs = String(count)
  }
  const drawLinks = new Int32Array(desktop.length)

  function resize() {
    const bounds = canvas.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.hypot(width, height) * 0.62
    )
    vignette.addColorStop(0, 'rgba(4, 7, 5, 0)')
    vignette.addColorStop(1, 'rgba(4, 7, 5, 0.78)')
    grainPattern = ctx.createPattern(grain, 'repeat')
    render()
  }

  /** Reduced motion keeps the resting ring: no morph, no idle turn. */
  function render() {
    if (disposed) return
    stage = reduced.matches ? 0 : readStage()
    draw()
  }

  function tick(now: number) {
    if (!active || disposed) return
    const elapsed = lastFrame
      ? Math.min(0.1, Math.max(0, (now - lastFrame) / 1000))
      : 0
    lastFrame = now
    const target = readStage()
    // Inertia: the sculpture trails the scrollbar slightly, so wheel steps feel continuous.
    stage += (target - stage) * (1 - Math.exp(-elapsed * 7))
    if (Math.abs(target - stage) < 0.0005) stage = target
    clock += elapsed
    flow += elapsed * (1 + segmentAt(stage).energy * 0.6)
    draw()
    frameId = requestAnimationFrame(tick)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  return {
    setActive(next) {
      if (disposed) return
      const shouldRun = next && !reduced.matches
      if (!shouldRun) render()
      if (active === shouldRun) return
      active = shouldRun
      cancelAnimationFrame(frameId)
      if (active) {
        lastFrame = 0
        frameId = requestAnimationFrame(tick)
      }
    },
    render,
    setIcons(next) {
      icons = next
      if (!active) render()
    },
    destroy() {
      disposed = true
      active = false
      cancelAnimationFrame(frameId)
      observer.disconnect()
      atlas.width = 0
      grain.width = 0
    },
  }
}
