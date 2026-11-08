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
import { useHomeMotion } from '@/features/home/hooks/use-home-motion'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'

import { ScrollHeader } from './components/scroll-header'
import { ScrollSections } from './components/scroll-sections'
import { createScrollEngine, type ScrollEngine } from './lib/scroll-engine'
import {
  morphAt,
  readingAt,
  sectionOpacity,
  sectionProgress,
  turnAt,
} from './lib/scroll-timeline'

const APP_ORIGIN = 'http://127.0.0.1:31088'
const SECTION_COUNT = 6

export function MobiusScrollPreview() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const theme = useTheme()
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ScrollEngine | null>(null)
  const panels = useRef<(HTMLDivElement | null)[]>([])
  const chapters = useRef<(HTMLAnchorElement | null)[]>([])
  const progressRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [current, setCurrent] = useState(0)
  const [supported, setSupported] = useState(true)
  const active = useHomeMotion(canvasRef, paused)
  const siteName = status?.system_name || 'ZH Api'
  const chapterLinks = [
    { anchor: 'top', label: t('Home') },
    { anchor: 'platform', label: t('AI model access') },
    { anchor: 'relaydesk', label: 'RelayDesk' },
    { anchor: 'tools', label: t('Tools') },
    { anchor: 'features', label: t('footer.columns.about.links.features') },
    { anchor: 'start', label: t('Get Started') },
  ]

  // Scroll → section progress → panel opacity, reading dim, and the target form.
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    let frame = 0
    let lastSection = -1
    const update = () => {
      frame = 0
      const focus = window.scrollY + window.innerHeight / 2
      const centers = [
        ...page.querySelectorAll<HTMLElement>('.scroll-segment'),
      ].map((segment) => {
        const bounds = segment.getBoundingClientRect()
        return window.scrollY + bounds.top + bounds.height / 2
      })
      const progress = sectionProgress(centers, focus)
      progressRef.current = progress
      const reading = readingAt(progress)
      // Only a light dim while reading; no blur, so the sculpture stays crisp.
      page.style.setProperty('--art-opacity', String(1 - reading * 0.22))
      page.style.setProperty(
        '--scroll-progress',
        String(progress / (SECTION_COUNT - 1))
      )
      panels.current.forEach((panel, index) => {
        if (!panel) return
        const opacity = sectionOpacity(progress, index)
        panel.style.setProperty('--panel-opacity', String(opacity))
        // Copy drifts with the scroll direction, so text and form move as one.
        panel.style.setProperty('--panel-shift', String(progress - index))
        panel.style.visibility = opacity > 0.001 ? 'visible' : 'hidden'
        // Off-screen copy stays out of the tab order and the accessibility tree.
        panel.inert = opacity < 0.5
      })
      chapters.current.forEach((chapter, index) => {
        if (!chapter) return
        const fill = Math.max(0, Math.min(1, progress - index + 0.5))
        chapter.style.setProperty('--chapter-fill', String(fill))
      })
      const section = Math.round(progress)
      if (section !== lastSection) {
        lastSection = section
        setCurrent(section)
      }
      engineRef.current?.redraw()
    }
    const request = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    // React mounts after the browser has already tried the URL hash, so deep
    // links such as #relaydesk would otherwise stay on the hero.
    const target = window.location.hash
      ? document.getElementById(
          decodeURIComponent(window.location.hash.slice(1))
        )
      : null
    target?.scrollIntoView({ behavior: 'instant', block: 'start' })
    update()
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const engine = createScrollEngine(canvas, {
      getMorph: () => morphAt(progressRef.current),
      getTurn: () => turnAt(progressRef.current),
      readingSelector: '.scroll-panel',
      // Deep links and reduced motion land on a formed sculpture, not the opening.
      skipIntro:
        reduced || window.location.hash.length > 1 || window.scrollY > 0,
      theme: document.documentElement.classList.contains('light')
        ? 'light'
        : 'dark',
    })
    engineRef.current = engine
    setSupported(!!engine)
    return () => {
      engine?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  useEffect(() => {
    engineRef.current?.setTheme(theme.resolvedTheme)
  }, [theme.resolvedTheme])

  return (
    <div
      ref={pageRef}
      className='scroll-page'
      lang={toIntlLocale(i18n.resolvedLanguage || i18n.language)}
    >
      <a href='#main' className='scroll-skip'>
        {t('Skip to content')}
      </a>
      <div className='scroll-stage' aria-hidden='true'>
        <canvas ref={canvasRef} data-animating={active} />
        {!supported && <div className='scroll-fallback'>∞</div>}
      </div>

      <ScrollHeader siteName={siteName} appOrigin={APP_ORIGIN} />

      <main id='main' tabIndex={-1} className='scroll-main'>
        <ScrollSections
          appOrigin={APP_ORIGIN}
          terminalPaused={paused || current !== 3}
          panelRef={(index) => (node) => {
            panels.current[index] = node
          }}
        />
        <footer className='scroll-credit'>
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

      <nav className='scroll-chapters' aria-label={t('Home')}>
        {chapterLinks.map((chapter, index) => (
          <a
            key={chapter.anchor}
            ref={(node) => {
              chapters.current[index] = node
            }}
            href={`#${chapter.anchor}`}
            aria-current={current === index ? 'step' : undefined}
            data-current={current === index}
          >
            <span className='chapter-number'>0{index + 1}</span>
            <span className='chapter-label'>{chapter.label}</span>
            <span className='chapter-track' aria-hidden='true'>
              <i />
            </span>
          </a>
        ))}
      </nav>
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
