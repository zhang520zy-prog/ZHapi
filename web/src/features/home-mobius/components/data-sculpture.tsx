import Claude from '@lobehub/icons/es/Claude/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Doubao from '@lobehub/icons/es/Doubao/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Grok from '@lobehub/icons/es/Grok/components/Mono'
import Kimi from '@lobehub/icons/es/Kimi/components/Color'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import Qwen from '@lobehub/icons/es/Qwen/components/Color'
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
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useHomeMotion } from '@/features/home/hooks/use-home-motion'

import { createScrollEngine, type ScrollEngine } from '../lib/scroll-engine'

const MODEL_ICONS = [
  ['deepseek', DeepSeek],
  ['doubao', Doubao],
  ['kimi', Kimi],
  ['qwen', Qwen],
  ['openai', OpenAI],
  ['claude', Claude],
  ['grok', Grok],
  ['gemini', Gemini],
] as const

/** Turns the rendered brand SVGs into images the canvas can draw. */
function loadIcons(root: HTMLElement) {
  return Promise.all(
    [...root.querySelectorAll('svg')].map((svg) => {
      const markup = new XMLSerializer()
        .serializeToString(svg)
        .replaceAll('currentColor', '#0b120e')
      const image = new Image(64, 64)
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
      return image.decode().then(
        () => image,
        () => null
      )
    })
  ).then((images) => images.filter((image) => image !== null))
}

/** The fixed full-screen canvas behind the page; the scroll stage drives what it draws. */
export function DataSculpture(props: {
  paused: boolean
  onPauseChange: () => void
  readStage: () => number
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const iconsRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ScrollEngine | null>(null)
  const [supported, setSupported] = useState(true)
  const active = useHomeMotion(canvasRef, props.paused)
  const activeRef = useRef(active)
  activeRef.current = active
  const readStageRef = useRef(props.readStage)
  readStageRef.current = props.readStage

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = createScrollEngine(canvasRef.current, () =>
      readStageRef.current()
    )
    engineRef.current = engine
    setSupported(!!engine)
    engine?.setActive(activeRef.current)
    let cancelled = false
    if (engine && iconsRef.current) {
      void loadIcons(iconsRef.current).then((icons) => {
        if (!cancelled) engine.setIcons(icons)
      })
    }
    return () => {
      cancelled = true
      engine?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  return (
    <>
      <div className='mobius-sculpture' aria-hidden='true'>
        <canvas ref={canvasRef} data-animating={active} />
        {!supported && <div className='mobius-fallback'>∞</div>}
        <div ref={iconsRef} className='mobius-icon-source'>
          {MODEL_ICONS.map(([name, Icon]) => (
            <Icon key={name} size={64} />
          ))}
        </div>
      </div>
      <div className='mobius-motion-controls'>
        <Button
          variant='ghost'
          className='mobius-icon-button'
          disabled={!supported}
          aria-pressed={props.paused}
          aria-label={
            props.paused ? t('Play visual effects') : t('Pause visual effects')
          }
          onClick={props.onPauseChange}
        >
          {props.paused ? (
            <Play aria-hidden='true' />
          ) : (
            <Pause aria-hidden='true' />
          )}
        </Button>
      </div>
    </>
  )
}
