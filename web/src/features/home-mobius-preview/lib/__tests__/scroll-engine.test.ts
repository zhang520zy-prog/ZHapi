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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createScrollEngine } from '../scroll-engine'

let reduced = false
let frameId = 0
const frames = new Map<number, FrameRequestCallback>()
const disconnect = vi.fn()
const gradient = { addColorStop: vi.fn() }

beforeEach(() => {
  reduced = false
  frameId = 0
  frames.clear()
  disconnect.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    }
  )
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        get matches() {
          return reduced
        },
      }) as MediaQueryList
  )
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect'
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1440,
    height: 900,
    right: 1440,
    bottom: 900,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const nextFrame = (now: number) => {
  const next = frames.entries().next().value
  if (!next) throw new Error('No animation frame scheduled')
  frames.delete(next[0])
  next[1](now)
}

it('pause and unmount release animation work and a destroyed sculpture cannot restart', () => {
  const engine = createScrollEngine(document.createElement('canvas'), () => 0)
  engine?.setActive(true)
  engine?.setActive(true)
  expect(frames.size).toBe(1)
  engine?.setActive(false)
  expect(frames.size).toBe(0)
  engine?.destroy()
  engine?.setActive(true)
  expect(frames.size).toBe(0)
  expect(disconnect).toHaveBeenCalledOnce()
})

it('an unavailable canvas context returns no engine and schedules nothing', () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
  expect(
    createScrollEngine(document.createElement('canvas'), () => 0)
  ).toBeNull()
  expect(frames.size).toBe(0)
})

it('the drawn stage follows a scroll jump smoothly instead of cutting to it', () => {
  let target = 0
  const canvas = document.createElement('canvas')
  const engine = createScrollEngine(canvas, () => target)
  engine?.setActive(true)
  nextFrame(1000)
  target = 2
  nextFrame(1016)
  const early = Number(canvas.dataset.stage)
  expect(early).toBeGreaterThan(0)
  expect(early).toBeLessThan(0.5)
  for (let now = 1032; now < 4000; now += 16) nextFrame(now)
  expect(Number(canvas.dataset.stage)).toBeCloseTo(2, 2)
  engine?.destroy()
})

it('reduced motion draws the resting ring whatever the scroll position and never animates', () => {
  reduced = true
  const canvas = document.createElement('canvas')
  const engine = createScrollEngine(canvas, () => 3.4)
  engine?.setActive(true)
  expect(frames.size).toBe(0)
  expect(canvas.dataset.stage).toBe('0.000')
  expect(Number(canvas.dataset.glyphs)).toBeGreaterThan(1000)
  engine?.destroy()
})

it('every stage of the journey keeps the sculpture populated on a desktop viewport', () => {
  let stage = 0
  const canvas = document.createElement('canvas')
  const engine = createScrollEngine(canvas, () => stage)
  for (stage = 0; stage <= 4; stage += 0.25) {
    engine?.render()
    expect(Number(canvas.dataset.glyphs)).toBeGreaterThan(1500)
  }
  engine?.destroy()
})

it('agent badges appear on the DNA rungs, in the vortex and in the abyss eruption once icons load', () => {
  let stage = 2
  const canvas = document.createElement('canvas')
  const engine = createScrollEngine(canvas, () => stage)
  const context = canvas.getContext('2d') as unknown as {
    drawImage: ReturnType<typeof vi.fn>
  }
  const icon = document.createElement('canvas')
  const badgeDraws = () =>
    context.drawImage.mock.calls.filter((call) => call[0] === icon).length
  context.drawImage.mockClear()
  engine?.render()
  expect(badgeDraws()).toBe(0)
  engine?.setIcons([icon, icon, icon, icon, icon, icon, icon, icon])
  for (stage of [2, 3, 4]) {
    context.drawImage.mockClear()
    engine?.render()
    expect(badgeDraws()).toBeGreaterThanOrEqual(stage === 4 ? 1 : 8)
  }
  engine?.destroy()
})
