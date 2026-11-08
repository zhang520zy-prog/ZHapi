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
import { afterEach, expect, it, vi } from 'vitest'

import { createGlyphEngine } from '../glyph-engine'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('stopping or destroying the canvas cancels scheduled drawing and font readiness cannot revive it', async () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame))
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    }
  )
  let resolveFont: (faces: FontFace[]) => void = () => undefined
  const fontReady = new Promise<FontFace[]>((resolve) => {
    resolveFont = resolve
  })
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: () => fontReady },
  })
  const clearRect = vi.fn()
  const gradient = { addColorStop: vi.fn() }
  const context = {
    clearRect,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) data[(y * width + x) * 4 + 3] = 255
      }
      return { data }
    },
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  try {
    const canvas = document.createElement('canvas')
    const engine = createGlyphEngine(canvas, 'dark')
    engine?.setActive(true)
    expect(frames.size).toBe(1)
    engine?.setActive(false)
    expect(frames.size).toBe(0)
    const pausedDraws = clearRect.mock.calls.length
    expect(canvas.dataset.animating).toBe('false')
    engine?.setActive(true)
    expect(frames.size).toBe(1)
    engine?.destroy()
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
    resolveFont([])
    await fontReady
    await Promise.resolve()
    expect(clearRect.mock.calls.length).toBe(pausedDraws)
    expect(frames.size).toBe(0)
  } finally {
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
    else Reflect.deleteProperty(document, 'fonts')
  }
})
