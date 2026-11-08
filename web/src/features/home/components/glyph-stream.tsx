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
import { useEffect, useRef, useState } from 'react'

import { useTheme } from '@/context/theme-provider'

import { useHomeMotion } from '../hooks/use-home-motion'
import { createGlyphEngine, type GlyphEngine } from '../lib/glyph-engine'

export function GlyphStream(props: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GlyphEngine | null>(null)
  const [supported, setSupported] = useState(true)
  const { resolvedTheme } = useTheme()
  const active = useHomeMotion(canvasRef, props.paused)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = createGlyphEngine(canvas, resolvedTheme)
    engineRef.current = engine
    setSupported(!!engine)
    engine?.setActive(activeRef.current)
    return () => {
      engine?.destroy()
      engineRef.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  return (
    <div className='glyph-stream' aria-hidden='true'>
      <canvas ref={canvasRef} className='glyph-stream-canvas' />
      {!supported && <span className='glyph-static-word'>AI API</span>}
    </div>
  )
}
