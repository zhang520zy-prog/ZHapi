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

import { createMorphRenderer } from '../morph-renderer'

let reduced = false
let frameId = 0
const frames = new Map<number, FrameRequestCallback>()
const disconnect = vi.fn()

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
    clearRect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    stroke: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('the morph study can inspect the final frame without starting playback and disposes all animation work', () => {
  const canvas = document.createElement('canvas')
  const onFrame = vi.fn()
  const renderer = createMorphRenderer(canvas, onFrame)
  renderer?.seek(24)
  expect(onFrame).toHaveBeenLastCalledWith(24)
  expect(canvas.dataset.frame).toBe('1440')
  expect(frames.size).toBe(0)
  renderer?.setActive(true)
  expect(frames.size).toBe(1)
  renderer?.setActive(false)
  expect(frames.size).toBe(0)
  renderer?.destroy()
  renderer?.setActive(true)
  onFrame.mockClear()
  renderer?.seek(4)
  expect(frames.size).toBe(0)
  expect(onFrame).not.toHaveBeenCalled()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('the morph clock keeps its rate over a delayed frame and resume excludes paused time', () => {
  const onFrame = vi.fn()
  const renderer = createMorphRenderer(
    document.createElement('canvas'),
    onFrame
  )
  const nextFrame = (now: number) => {
    const next = frames.entries().next().value
    if (!next) throw new Error('No animation frame scheduled')
    frames.delete(next[0])
    next[1](now)
  }
  renderer?.setRate(0.5)
  renderer?.setActive(true)
  nextFrame(1000)
  nextFrame(1100)
  expect(onFrame).toHaveBeenLastCalledWith(0.05)
  renderer?.setActive(false)
  renderer?.setActive(true)
  nextFrame(5000)
  expect(onFrame).toHaveBeenLastCalledWith(0.05)
  renderer?.destroy()
})
