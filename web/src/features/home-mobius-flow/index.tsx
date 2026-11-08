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
import { useTheme } from '@/context/theme-provider'
import { ScrollHeader } from '@/features/home-mobius-scroll/components/scroll-header'
import { sectionProgress } from '@/features/home-mobius-scroll/lib/scroll-timeline'
import { useHomeMotion } from '@/features/home/hooks/use-home-motion'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'

import { FlowSections, TERMINAL_LINE_COUNT } from './components/flow-sections'
import { createFlowEngine, type FlowEngine } from './lib/flow-engine'
import { smooth, type Box, type FlowLayout } from './lib/flow-shapes'

const APP_ORIGIN = 'http://127.0.0.1:31088'
const EMPTY: Box = { left: 0, top: 0, width: 0, height: 0 }

function box(element: Element | null): Box {
  if (!element) return EMPTY
  const r = element.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Reads every attachment box from the live layout; called once per frame. */
function measure(page: HTMLElement): FlowLayout {
  const width = window.innerWidth
  const height = window.innerHeight
  const one = (name: string) => page.querySelector(`[data-flow='${name}']`)
  const all = (name: string) => [
    ...page.querySelectorAll(`[data-flow='${name}']`),
  ]
  const centers = [...page.querySelectorAll('[data-flow-section]')].map(
    (section) => {
      const r = section.getBoundingClientRect()
      return r.top + r.height / 2
    }
  )
  const models = all('model').map(box)
  const nodes = all('node').map(box)
  // A model lights up as the data column carries it past the reading line.
  const reading = height * 0.62
  return {
    width,
    height,
    progress: sectionProgress(centers, height / 2),
    hero: {
      section: box(one('hero')),
      head: box(one('hero-head')),
      body: box(one('hero-body')),
    },
    pillar: box(one('pillar')),
    models,
    modelLit: models.map((m) => smooth((reading - m.top) / 120)),
    terminal: box(one('terminal')),
    timeline: box(one('timeline')),
    nodes,
    nodeActive: nodes.map((n) => {
      const c = n.top + n.height / 2
      return 1 - smooth((Math.abs(c - height * 0.5) - height * 0.12) / 90)
    }),
    ring: box(one('ring')),
    copy: [...page.querySelectorAll('[data-flow-copy]')].map(box),
  }
}

export function MobiusFlowPreview() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const theme = useTheme()
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FlowEngine | null>(null)
  const [paused, setPaused] = useState(false)
  const [supported, setSupported] = useState(true)
  const active = useHomeMotion(canvasRef, paused)
  const activeRef = useRef(active)
  activeRef.current = active
  const siteName = status?.system_name || 'ZH Api'

  useEffect(() => {
    const page = pageRef.current
    const canvas = canvasRef.current
    if (!page || !canvas) return
    const target = window.location.hash
      ? document.getElementById(
          decodeURIComponent(window.location.hash.slice(1))
        )
      : null
    target?.scrollIntoView({ behavior: 'instant', block: 'start' })

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const engine = createFlowEngine(canvas, {
      theme: document.documentElement.classList.contains('light')
        ? 'light'
        : 'dark',
      skipIntro: reduced.matches || !!target || window.scrollY > 0,
    })
    engineRef.current = engine
    setSupported(!!engine)

    const lines = [...page.querySelectorAll<HTMLElement>('[data-line]')]
    const items = [
      ...page.querySelectorAll<HTMLElement>('[data-flow-node-item]'),
    ]
    let shownLines = -1
    let frame = 0
    let last = 0
    let lastScroll = window.scrollY
    let surge = 0
    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      const elapsed = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      const layout = measure(page)
      // The terminal fills as the stream reaches it: lines follow scroll, not a clock.
      const terminalFill = smooth((layout.progress - 1.55) / 0.5)
      const count = Math.round(terminalFill * TERMINAL_LINE_COUNT)
      if (count !== shownLines) {
        shownLines = count
        lines.forEach((line, i) => {
          line.dataset.shown = String(i < count)
        })
      }
      items.forEach((item, i) => {
        item.dataset.active = String((layout.nodeActive[i] ?? 0) > 0.5)
      })
      // Scrolling pushes the traffic: faster scroll, faster data.
      const speed =
        Math.abs(window.scrollY - lastScroll) / Math.max(elapsed, 0.016)
      lastScroll = window.scrollY
      surge +=
        (Math.min(2.5, speed / 1100) - surge) * (1 - Math.exp(-elapsed * 6))
      const moving = activeRef.current && !reduced.matches
      engine?.render(layout, moving ? elapsed * (1 + surge) : 0)
    }
    frame = requestAnimationFrame(step)
    const onResize = () => engine?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      engine?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setTheme(theme.resolvedTheme)
  }, [theme.resolvedTheme])

  return (
    <div
      ref={pageRef}
      className='scroll-page flow-page'
      lang={toIntlLocale(i18n.resolvedLanguage || i18n.language)}
    >
      <a href='#main' className='scroll-skip'>
        {t('Skip to content')}
      </a>
      <canvas
        ref={canvasRef}
        className='flow-canvas'
        aria-hidden='true'
        data-animating={active}
      />
      <ScrollHeader siteName={siteName} appOrigin={APP_ORIGIN} />
      <main id='main' tabIndex={-1} className='flow-main'>
        <FlowSections appOrigin={APP_ORIGIN} />
        <footer className='scroll-credit flow-credit'>
          <span>{siteName} / AI GATEWAY</span>
          <span>
            Powered by{' '}
            <a
              href='https://github.com/QuantumNous/new-api'
              target='_blank'
              rel='noopener noreferrer'
            >
              ZH Api · QuantumNous
            </a>
          </span>
        </footer>
      </main>
      <Button
        variant='ghost'
        className='scroll-icon-button scroll-motion'
        disabled={!supported}
        aria-pressed={paused}
        aria-label={
          paused ? t('Play visual effects') : t('Pause visual effects')
        }
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play aria-hidden='true' /> : <Pause aria-hidden='true' />}
      </Button>
    </div>
  )
}
