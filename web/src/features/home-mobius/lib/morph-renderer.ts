import { createGlyphField, DATA_GLYPHS } from './glyph-field'
import type { Point3 } from './mobius-geometry'
/* Copyright (C) 2023-2026 QuantumNous — AGPL-3.0-or-later */
import {
  bakeMorphFrames,
  createMorphModels,
  interpolateMorphModel,
  MODEL_COLUMNS,
  MORPH_DURATION,
  MORPH_FPS,
  pointOnMorphModel,
} from './morph-model'

export interface MorphRenderer {
  setActive: (active: boolean) => void
  seek: (seconds: number) => void
  setRate: (rate: number) => void
  setStructure: (enabled: boolean) => void
  destroy: () => void
}

const CHARACTERS = DATA_GLYPHS
const ATLAS_COLUMNS = 24
const ATLAS_ROWS = Math.ceil(CHARACTERS.length / ATLAS_COLUMNS)

/** A fixed camera draws the baked geometry; stream motion follows the surface longitudinally. */
export function createMorphRenderer(
  canvas: HTMLCanvasElement,
  onFrame: (seconds: number) => void
): MorphRenderer | null {
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return null
  const ctx: CanvasRenderingContext2D = context
  const models = createMorphModels()
  const frames = bakeMorphFrames(models)
  const vertices = new Float32Array(models[0].length)
  let extentX = 1,
    extentY = 1
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 3) {
      const perspective = 1600 / (1600 - frame[i + 2])
      extentX = Math.max(extentX, Math.abs(frame[i] * perspective))
      extentY = Math.max(extentY, Math.abs(frame[i + 1] * perspective))
    }
  }
  frames.length = 0
  const atlas = document.createElement('canvas')
  atlas.width = ATLAS_COLUMNS * 40
  atlas.height = ATLAS_ROWS * 40 * 5
  const ink = atlas.getContext('2d')
  if (!ink) return null
  ink.font = '28px Menlo, monospace'
  ink.textAlign = 'center'
  ink.textBaseline = 'middle'
  for (let row = 0; row < 5; row++) {
    ink.fillStyle = ['#27714d', '#439f70', '#67c693', '#a4e7bb', '#e5ffe9'][row]
    CHARACTERS.forEach((glyph, column) =>
      ink.fillText(
        glyph,
        (column % ATLAS_COLUMNS) * 40 + 20,
        (Math.floor(column / ATLAS_COLUMNS) + row * ATLAS_ROWS) * 40 + 20
      )
    )
  }
  // Allocate stream samples once. Depth buckets and projection buffers are reused on every frame.
  const desktopField = createGlyphField()
  const mobileField = createGlyphField(true)
  const heads = new Int32Array(48)
  const links = new Int32Array(desktopField.length)
  const sample: Point3 = { x: 0, y: 0, z: 0 }

  let width = 1,
    height = 1,
    scale = 1,
    time = 0,
    flow = 0,
    rate = 1
  let structure = false,
    active = false,
    disposed = false,
    request = 0,
    lastTime = 0

  function project(point: Point3) {
    const perspective = 1600 / (1600 - point.z)
    return {
      x: width / 2 + point.x * scale * perspective,
      y: height / 2 + point.y * scale * perspective,
      z: point.z,
      perspective,
    }
  }

  function draw() {
    const position = time * MORPH_FPS
    // Evaluate the continuous curve at the display timestamp, including refresh rates above 60Hz.
    interpolateMorphModel(models, time, vertices)
    ctx.fillStyle = '#080c0b'
    ctx.fillRect(0, 0, width, height)
    if (structure) {
      const faces = []
      for (let column = 0; column < MODEL_COLUMNS; column += 3) {
        for (let lane = 0; lane < 8; lane++) {
          const u = (column / MODEL_COLUMNS) * Math.PI * 2
          const next = ((column + 3) / MODEL_COLUMNS) * Math.PI * 2
          const v = lane / 4 - 1
          const points = [
            [u, v],
            [next, v],
            [next, v + 0.25],
            [u, v + 0.25],
          ].map(([a, b]) => project(pointOnMorphModel(vertices, a, b)))
          faces.push({ points, z: points.reduce((sum, p) => sum + p.z, 0) / 4 })
        }
      }
      faces.sort((a, b) => a.z - b.z)
      for (const face of faces) {
        ctx.beginPath()
        face.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
        )
        ctx.closePath()
        ctx.fillStyle = '#0e2820'
        ctx.fill()
        ctx.strokeStyle = '#69bf9880'
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
    } else {
      heads.fill(-1)
      const particles = width < 600 ? mobileField : desktopField
      const count = particles.length
      const glyphScale = Math.min(1.15, scale)
      for (let index = 0; index < count; index++) {
        const particle = particles[index]
        pointOnMorphModel(
          vertices,
          particle.phase + flow * particle.speed,
          particle.lane,
          sample
        )
        sample.x += particle.jitterX
        sample.y += particle.jitterY
        sample.z += particle.jitterZ
        const perspective = 1600 / (1600 - sample.z)
        particle.x = width / 2 + sample.x * scale * perspective
        particle.y = height / 2 + sample.y * scale * perspective
        particle.screenSize = Math.max(
          3.4,
          Math.min(9.5, particle.size * perspective * glyphScale)
        )
        particle.shade =
          particle.tail === 0 ? 4 : 1 + Math.floor((1 - particle.tail) * 2)
        const bucket = Math.max(
          0,
          Math.min(47, Math.floor((sample.z + 600) * 0.04))
        )
        links[index] = heads[bucket]
        heads[bucket] = index
      }
      for (let bucket = 0; bucket < heads.length; bucket++) {
        for (let index = heads[bucket]; index !== -1; index = links[index]) {
          const particle = particles[index]
          ctx.globalAlpha = particle.alpha
          ctx.drawImage(
            atlas,
            (particle.glyph % ATLAS_COLUMNS) * 40,
            (Math.floor(particle.glyph / ATLAS_COLUMNS) +
              particle.shade * ATLAS_ROWS) *
              40,
            40,
            40,
            particle.x - particle.screenSize / 2,
            particle.y - particle.screenSize / 2,
            particle.screenSize,
            particle.screenSize
          )
        }
      }
      ctx.globalAlpha = 1
    }
    canvas.dataset.frame = String(Math.round(position))
    onFrame(time)
  }

  const profiling = new URLSearchParams(window.location.search).has('profile')
  const drawSamples: number[] = []
  function tick(now: number) {
    if (!active || disposed) return
    const delta = lastTime ? Math.max(0, (now - lastTime) / 1000) : 0
    lastTime = now
    time = (time + delta * rate) % MORPH_DURATION
    flow += delta * rate
    const started = profiling ? performance.now() : 0
    draw()
    if (profiling) {
      drawSamples.push(performance.now() - started)
      if (drawSamples.length === 120) {
        drawSamples.sort((a, b) => a - b)
        canvas.dataset.drawMedian = drawSamples[60].toFixed(2)
        canvas.dataset.drawP95 = drawSamples[114].toFixed(2)
        drawSamples.length = 0
      }
    }
    request = requestAnimationFrame(tick)
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    scale = Math.min((width * 0.43) / extentX, (height * 0.43) / extentY)
    draw()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()
  return {
    setActive(value) {
      if (disposed || active === value) return
      active = value
      cancelAnimationFrame(request)
      lastTime = 0
      if (active) request = requestAnimationFrame(tick)
    },
    seek(seconds) {
      if (disposed || !Number.isFinite(seconds)) return
      time = Math.max(0, Math.min(MORPH_DURATION, seconds))
      flow = time
      lastTime = 0
      draw()
    },
    setRate(value) {
      rate = Math.max(0.1, Math.min(2, value))
    },
    setStructure(value) {
      structure = value
      if (!disposed) draw()
    },
    destroy() {
      disposed = true
      active = false
      cancelAnimationFrame(request)
      observer.disconnect()
      atlas.width = 0
      models.length = 0
    },
  }
}
