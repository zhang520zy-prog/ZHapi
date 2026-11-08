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
const DESIGN_WIDTH = 1440
const DESIGN_HEIGHT = 460

type Palette = {
  glow: string
  core: string
  bright: string
}

const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: { glow: '#80d7bb', core: '#e4eee8', bright: '#baf7df' },
  light: { glow: '#0c8a6e', core: '#2f4c41', bright: '#0a3f33' },
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  size: number
  depth: number
  phase: number
  hot: boolean
  haze: boolean
}

type Drifter = {
  x: number
  y: number
  speed: number
  size: number
  depth: number
  sway: number
  phase: number
}

function sampleWord(text: string, fontSize: number): [number, number][] {
  const mask = document.createElement('canvas')
  mask.width = 1400
  mask.height = 300
  const maskContext = mask.getContext('2d')
  if (!maskContext) return []
  maskContext.font = `700 ${fontSize}px Inter, Arial, sans-serif`
  maskContext.fillStyle = '#fff'
  maskContext.fillText(text, 4, fontSize + 12)
  const data = maskContext.getImageData(0, 0, mask.width, mask.height).data
  let minX = mask.width
  let maxX = 0
  let minY = mask.height
  let maxY = 0
  for (let y = 0; y < mask.height; y += 2) {
    for (let x = 0; x < mask.width; x += 2) {
      if (data[(y * mask.width + x) * 4 + 3] > 120) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return []
  const scale = Math.min(1.15, 1040 / Math.max(1, maxX - minX))
  const centerY = (minY + maxY) / 2
  const points: [number, number][] = []
  for (let y = minY; y <= maxY; y += 5) {
    for (let x = minX; x <= maxX; x += 5) {
      if (data[(y * mask.width + x) * 4 + 3] > 120) {
        points.push([74 + (x - minX) * scale, 245 + (y - centerY) * scale])
      }
    }
  }
  points.sort((a, b) => a[0] - b[0])
  return points
}

function makeDrifters(): Drifter[] {
  return Array.from({ length: 30 }, (_, index) => ({
    x: Math.random() * DESIGN_WIDTH,
    y: Math.random() * DESIGN_HEIGHT,
    speed: 12 + ((index * 17) % 42),
    size: 0.6 + ((index * 7) % 10) / 10,
    depth: 0.25 + ((index * 13) % 10) / 13,
    sway: 6 + (index % 5) * 4,
    phase: index * 0.71,
  }))
}

export type GlyphEngine = {
  setActive: (active: boolean) => void
  destroy: () => void
}

// H's shared particle body and signal line. The React owner controls scheduling.
export function createGlyphEngine(
  canvas: HTMLCanvasElement,
  theme: 'dark' | 'light'
): GlyphEngine | null {
  const context = canvas.getContext('2d')
  if (!context) return null
  let active = false
  let disposed = false
  const palette = PALETTES[theme]
  const mouse = { x: -9999, y: -9999 }
  const words = [sampleWord('AI API', 200), sampleWord('RELAYDESK', 170)]
  const particles: Particle[] = []
  const drifters = makeDrifters()
  const egressNode: [number, number] = [1400, 250]
  let wordIndex = 0
  let wordHoldUntil = Number.POSITIVE_INFINITY
  let elapsed = 0
  let frame = 0
  let lastTime = 0
  let nodeFlash = 0
  let pulse = 0.15
  let glowSprite: HTMLCanvasElement | null = null

  const scatterTarget = (): [number, number] => [
    1480 + Math.random() * 320,
    120 + Math.random() * 240,
  ]

  const retarget = (index: number) => {
    wordIndex = index
    const word = words[index]
    const ordered = [...particles].sort((a, b) => a.x - b.x)
    ordered.forEach((particle, particleIndex) => {
      particle.haze = particleIndex >= word.length
      const target = particle.haze ? scatterTarget() : word[particleIndex]
      particle.tx = target[0] + (Math.random() - 0.5) * 1.4
      particle.ty = target[1] + (Math.random() - 0.5) * 1.4
    })
  }

  const particleCount = Math.max(words[0].length, words[1].length)
  for (let index = 0; index < particleCount; index += 1) {
    const target = words[0][index] ?? scatterTarget()
    particles.push({
      x: target[0] + (Math.random() - 0.5) * 460,
      y: target[1] + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      tx: target[0],
      ty: target[1],
      size: 0.7 + Math.random() * 1.5,
      depth: 0.45 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      hot: Math.random() < 0.09,
      haze: index >= words[0].length,
    })
  }

  const signalY = (x: number, time: number) => {
    const position = (x + 40) / (DESIGN_WIDTH + 80)
    const envelope = Math.pow(
      Math.sin(Math.PI * Math.min(Math.max(position, 0), 1)),
      0.5
    )
    const drift = Math.sin(time * 0.00022) * 30
    const wiggle = Math.sin(x * 0.0085 - time * 0.0011) * 34
    return 250 + (drift + wiggle) * envelope
  }

  const getGlowSprite = () => {
    if (glowSprite) return glowSprite
    glowSprite = document.createElement('canvas')
    glowSprite.width = 64
    glowSprite.height = 64
    const sprite = glowSprite.getContext('2d')
    if (!sprite) return glowSprite
    const gradient = sprite.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, palette.core)
    gradient.addColorStop(0.22, palette.glow)
    gradient.addColorStop(0.55, `${palette.glow}44`)
    gradient.addColorStop(1, `${palette.glow}00`)
    sprite.fillStyle = gradient
    sprite.fillRect(0, 0, 64, 64)
    return glowSprite
  }

  const snapToTargets = () => {
    particles.forEach((particle) => {
      particle.x = particle.tx
      particle.y = particle.ty
      particle.vx = 0
      particle.vy = 0
    })
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, rect.width || DESIGN_WIDTH)
    const height = Math.max(1, rect.height || DESIGN_HEIGHT)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(
      ratio * (width / DESIGN_WIDTH),
      0,
      0,
      ratio * (height / DESIGN_HEIGHT),
      0,
      0
    )
    if (!active) snapToTargets()
    draw(elapsed, 0)
  }

  const draw = (time: number, delta: number) => {
    const dt = delta / 1000
    context.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
    if (active && delta > 0) {
      particles.forEach((particle) => {
        particle.vx += (particle.tx - particle.x) * 0.011
        particle.vy += (particle.ty - particle.y) * 0.011
        const dx = particle.x - mouse.x
        const dy = particle.y - mouse.y
        const distanceSquared = dx * dx + dy * dy
        if (distanceSquared < 8100 && distanceSquared > 0.01) {
          const distance = Math.sqrt(distanceSquared)
          const force = (1 - distance / 90) * 5.2
          particle.vx += (dx / distance) * force
          particle.vy += (dy / distance) * force
        }
        particle.vx += Math.sin(elapsed * 0.0011 + particle.phase) * 0.006
        particle.vy +=
          Math.cos(elapsed * 0.0009 + particle.phase * 1.31) * 0.006
        particle.vx *= 0.915
        particle.vy *= 0.915
        particle.x += particle.vx
        particle.y += particle.vy
      })
      drifters.forEach((drifter) => {
        drifter.x += drifter.speed * dt
        drifter.y +=
          Math.sin(elapsed * 0.0007 + drifter.phase) * drifter.sway * dt
        if (drifter.x > DESIGN_WIDTH + 20) {
          drifter.x = -20
          drifter.y = Math.random() * DESIGN_HEIGHT
        }
      })
      pulse += 0.22 * dt
      if (pulse >= 1.15) {
        pulse = -0.35
        nodeFlash = 1
      }
      nodeFlash *= 0.93
    }

    drifters.forEach((drifter) => {
      context.globalAlpha =
        drifter.depth * (0.25 + Math.sin(time / 500 + drifter.phase) * 0.2)
      context.fillStyle = palette.glow
      context.fillRect(drifter.x, drifter.y, drifter.size, drifter.size)
    })

    const line = context.createLinearGradient(0, 0, DESIGN_WIDTH, 0)
    line.addColorStop(0, `${palette.glow}00`)
    line.addColorStop(0.1, `${palette.glow}4d`)
    line.addColorStop(0.45, `${palette.glow}8c`)
    line.addColorStop(0.85, `${palette.glow}55`)
    line.addColorStop(1, `${palette.glow}00`)
    context.globalAlpha = 1
    context.strokeStyle = line
    context.lineWidth = 1.1
    context.beginPath()
    for (let x = -40; x <= DESIGN_WIDTH + 40; x += 7) {
      const y = signalY(x, time)
      if (x === -40) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()

    if (pulse > 0 && pulse < 1) {
      const x = -40 + pulse * (DESIGN_WIDTH + 80)
      const y = signalY(x, time)
      context.globalAlpha = 0.8
      context.strokeStyle = palette.bright
      context.lineWidth = 1.6
      context.beginPath()
      for (let back = 0; back <= 10; back += 1) {
        const trailX = x - back * 5
        if (trailX < -40) break
        const trailY = signalY(trailX, time)
        if (back === 0) context.moveTo(trailX, trailY)
        else context.lineTo(trailX, trailY)
      }
      context.stroke()
      context.globalAlpha = 0.55
      context.drawImage(getGlowSprite(), x - 9, y - 9, 18, 18)
      context.globalAlpha = 1
      context.fillStyle = palette.core
      context.fillRect(x - 1.7, y - 1.7, 3.4, 3.4)
    }

    particles.forEach((particle) => {
      const speed = Math.hypot(particle.vx, particle.vy)
      const excite = Math.max(
        0,
        1 - Math.abs(particle.ty - signalY(particle.tx, time)) / 24
      )
      context.globalAlpha =
        (0.6 + Math.min(speed / 6, 0.3) + excite * 0.45) *
        particle.depth *
        (particle.haze ? 0.36 : 1)
      if (speed > 0.3) {
        const tail = Math.min(2 + speed * 1.6, 9)
        const normalX = particle.vx / speed
        const normalY = particle.vy / speed
        context.strokeStyle = palette.glow
        context.lineWidth = particle.size * 1.25
        context.beginPath()
        context.moveTo(particle.x - normalX * tail, particle.y - normalY * tail)
        context.lineTo(particle.x, particle.y)
        context.stroke()
      }
      context.fillStyle =
        particle.hot || excite > 0.55 ? palette.bright : palette.core
      const half = particle.size * (0.9 + excite * 0.35)
      context.fillRect(particle.x - half, particle.y - half, half * 2, half * 2)
      if (particle.hot) {
        const glowSize = particle.size * 7
        context.globalAlpha = 0.3 * particle.depth
        context.drawImage(
          getGlowSprite(),
          particle.x - glowSize / 2,
          particle.y - glowSize / 2,
          glowSize,
          glowSize
        )
      }
    })

    context.globalAlpha = 0.9
    context.strokeStyle = palette.glow
    context.strokeRect(
      egressNode[0] - 5 - nodeFlash * 2,
      egressNode[1] - 5 - nodeFlash * 2,
      10 + nodeFlash * 4,
      10 + nodeFlash * 4
    )
    context.globalAlpha = 0.6 + nodeFlash * 0.4
    context.fillStyle = palette.glow
    context.fillRect(egressNode[0] - 2, egressNode[1] - 2, 4, 4)
    context.globalAlpha = 0.65
    context.fillStyle = palette.core
    context.font = '9px "IBM Plex Mono", monospace'
    context.fillText('→ MODELS', egressNode[0] - 64, egressNode[1] + 3)
    context.globalAlpha = 1
  }

  const canAnimate = () => active && !disposed
  const syncMotion = () => {
    cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
    if (canAnimate()) frame = requestAnimationFrame(animate)
    else draw(elapsed, 0)
  }
  const animate = (time: number) => {
    frame = 0
    if (!canAnimate()) return
    const delta = lastTime ? Math.min(time - lastTime, 48) : 16
    lastTime = time
    elapsed += delta
    draw(elapsed, delta)
    if (elapsed > 2600 && wordHoldUntil === Number.POSITIVE_INFINITY) {
      wordHoldUntil = elapsed + 6400
    }
    if (elapsed > wordHoldUntil) {
      retarget(1 - wordIndex)
      wordHoldUntil = elapsed + 8200
    }
    canvas.dataset.word = wordIndex === 0 ? 'AI API' : 'RELAYDESK'
    frame = requestAnimationFrame(animate)
  }
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    mouse.x = ((event.clientX - rect.left) / rect.width) * DESIGN_WIDTH
    mouse.y = ((event.clientY - rect.top) / rect.height) * DESIGN_HEIGHT
  }
  const onPointerLeave = () => {
    mouse.x = -9999
    mouse.y = -9999
  }
  const resizeObserver = new ResizeObserver(resize)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  resizeObserver.observe(canvas)
  resize()

  if (document.fonts?.load) {
    void document.fonts
      .load('700 200px Inter')
      .then(() => {
        if (disposed) return
        words[0] = sampleWord('AI API', 200)
        words[1] = sampleWord('RELAYDESK', 170)
        const count = Math.max(words[0].length, words[1].length)
        while (particles.length < count) {
          const target = words[0][particles.length] ?? scatterTarget()
          particles.push({
            x: target[0],
            y: target[1],
            vx: 0,
            vy: 0,
            tx: target[0],
            ty: target[1],
            size: 1.4,
            depth: 0.7,
            phase: Math.random() * Math.PI * 2,
            hot: false,
            haze: false,
          })
        }
        particles.length = count
        retarget(wordIndex)
        if (!active) snapToTargets()
        draw(elapsed, 0)
      })
      .catch(() => {
        /* Keep the sampled system-font fallback. */
      })
  }

  return {
    setActive(nextActive: boolean) {
      if (nextActive && !active && elapsed === 0) {
        particles.forEach((particle) => {
          particle.x = particle.tx + (Math.random() - 0.5) * 460
          particle.y = particle.ty + (Math.random() - 0.5) * 300
        })
      }
      active = nextActive
      canvas.dataset.animating = String(active)
      syncMotion()
    },
    destroy() {
      disposed = true
      cancelAnimationFrame(frame)
      canvas.dataset.animating = 'false'
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      resizeObserver.disconnect()
    },
  }
}
