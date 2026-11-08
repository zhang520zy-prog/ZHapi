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
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { useAuthStore } from '@/stores/auth-store'

import '@/styles/home-mobius.css'

import { DataSculpture } from './components/data-sculpture'
import { RELAYDESK_RELEASES_URL } from './constants'
import {
  autoplayAt,
  sectionReveal,
  stageAt,
  type AutoplayStop,
} from './lib/scroll-morph'

const SCRAMBLE = '01アイウカキクサシ数链流源∑<>[]{}#$%01'
const DECODE_MS = 900
/** Seconds each section rests on screen while autoplaying, then seconds to glide on. */
const AUTOPLAY_HOLD = [3.2, 4, 4.2, 5, 6]
const AUTOPLAY_MOVE = [3.4, 3.6, 5.6, 5.2]

/**
 * Overlays a scrambled copy of the heading (same nodes, so lines wrap identically)
 * whose characters resolve left to right as `reveal` approaches 1.
 */
function decodeHeading(heading: HTMLElement, reveal: number) {
  let overlay = heading.querySelector<HTMLElement>(':scope > .mobius-decode')
  if (reveal >= 0.999) {
    heading.dataset.decoding = 'false'
    return
  }
  if (!overlay) {
    overlay = document.createElement('span')
    overlay.className = 'mobius-decode'
    overlay.setAttribute('aria-hidden', 'true')
    heading.append(overlay)
  }
  heading.dataset.decoding = 'true'
  const copy = document.createDocumentFragment()
  for (const node of heading.childNodes) {
    if (node !== overlay) copy.append(node.cloneNode(true))
  }
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  while (walker.nextNode()) texts.push(walker.currentNode as Text)
  const total = texts.reduce((sum, text) => sum + text.data.length, 0)
  const resolved = Math.floor(total * Math.min(1, reveal * 1.25))
  const tick = Math.floor(performance.now() / 70)
  let index = 0
  for (const text of texts) {
    let next = ''
    for (const char of text.data) {
      next +=
        index < resolved || char.trim() === ''
          ? char
          : SCRAMBLE[(index * 7 + tick) % SCRAMBLE.length]
      index++
    }
    text.data = next
  }
  overlay.replaceChildren(copy)
}

/**
 * Normal scrolling page over one fixed canvas. Each section's place in the
 * document sets the sculpture's stage; its own place in the viewport sets how
 * readable its copy is.
 */
export function MobiusHome() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const pageRef = useRef<HTMLDivElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])
  const decoded = useRef<boolean[]>([])
  const [cueGone, setCueGone] = useState(false)
  const [paused, setPaused] = useState(false)
  // The scroll hint is split into characters so it can break up like particles.
  const cueChars = [...t('Scroll down')].map((char, order) => ({
    char,
    order,
    id: `${order}:${char}`,
  }))
  // ZH Api is this site's own brand; the backend default system name is not shown here.
  const siteName = 'ZH Api'

  const readStage = useCallback(() => {
    const centers = sections.current.map((section) =>
      section ? section.offsetTop + section.offsetHeight / 2 : 0
    )
    return stageAt(window.scrollY + window.innerHeight / 2, centers)
  }, [])

  // Scope html-level styles (smooth scroll, scroll padding) to this page only;
  // the attribute is removed on unmount so the console keeps its own behaviour.
  useEffect(() => {
    const element = document.documentElement
    element.dataset.mobiusPage = 'true'
    return () => {
      delete element.dataset.mobiusPage
      delete element.dataset.autoplay
    }
  }, [])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const decodes = new Map<number, number>()
    const decodeStep = (now: number) => {
      for (const [index, started] of decodes) {
        const heading =
          sections.current[index]?.querySelector<HTMLElement>('h1, h2')
        const progress = Math.min(1, (now - started) / DECODE_MS)
        if (heading) decodeHeading(heading, progress)
        if (progress >= 1) decodes.delete(index)
      }
      if (decodes.size) frame = requestAnimationFrame(decodeStep)
      else frame = 0
    }
    const update = () => {
      const viewport = window.innerHeight
      sections.current.forEach((section, index) => {
        if (!section) return
        const box = section.getBoundingClientRect()
        const state = sectionReveal(box.top, box.height, viewport)
        const reveal = reduced.matches ? 1 : state.reveal
        section.style.setProperty('--reveal', reveal.toFixed(3))
        section.style.setProperty('--offset', state.offset.toFixed(3))
        section.dataset.visible = String(reveal > 0.01)
        section.dataset.active = String(reveal > 0.5)
        if (index === sections.current.length - 1) {
          pageRef.current?.style.setProperty('--closing', reveal.toFixed(3))
          if (pageRef.current) {
            pageRef.current.dataset.closing = String(reveal > 0.5)
          }
        }
        // Headings decode once each time their section arrives, never mid-scroll frozen.
        if (reveal > 0.45 && !decoded.current[index]) {
          decoded.current[index] = true
          if (!reduced.matches) {
            decodes.set(index, performance.now())
            if (!frame) frame = requestAnimationFrame(decodeStep)
          }
        }
        if (reveal < 0.02) decoded.current[index] = false
      })
      // The hero rests a little below the top, so the hint waits for a real move away.
      setCueGone(window.scrollY > window.innerHeight * 0.15)
    }
    // Copy is pinned to the screen, so focusing a link in a later shot must move
    // the timeline there; the browser cannot scroll a fixed element into view.
    const onFocus = (event: FocusEvent) => {
      const section = sections.current.find(
        (item) =>
          item && event.target instanceof Node && item.contains(event.target)
      )
      if (!section) return
      window.scrollTo({
        top:
          section.offsetTop + section.offsetHeight / 2 - window.innerHeight / 2,
        behavior: 'instant',
      })
    }
    document.addEventListener('focusin', onFocus)
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Autoplay: the page plays itself from the hero to the ocean on load. Any wheel,
  // touch, key or pointer input hands control back to the visitor for good.
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // `?autoplay=0` keeps the page still, for screenshots and design review.
    if (new URLSearchParams(window.location.search).get('autoplay') === '0') {
      return
    }
    let frame = 0
    let elapsed = 0
    let last = 0
    let stopped = false
    const stops = (): AutoplayStop[] => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const list = sections.current.map((section, index) => ({
        top: section
          ? Math.max(
              0,
              Math.min(
                max,
                section.offsetTop +
                  section.offsetHeight / 2 -
                  window.innerHeight / 2
              )
            )
          : 0,
        hold: AUTOPLAY_HOLD[index] ?? 4,
        move: AUTOPLAY_MOVE[index] ?? 4,
      }))
      // Finish at the very bottom so the footer comes into view too.
      const last = list.at(-1)
      if (last) last.top = max
      return list
    }
    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      document.documentElement.dataset.autoplay = 'off'
    }
    const step = (now: number) => {
      if (stopped) return
      const delta = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (!pausedRef.current && document.visibilityState === 'visible') {
        elapsed += delta
      }
      const { top, done } = autoplayAt(elapsed, stops())
      window.scrollTo({ top, behavior: 'instant' })
      if (done) {
        stop()
        return
      }
      frame = requestAnimationFrame(step)
    }
    const SCROLL_KEYS = new Set([
      'ArrowDown',
      'ArrowUp',
      'PageDown',
      'PageUp',
      'Tab',
      'Home',
      'End',
      ' ',
    ])
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) stop()
    }
    const events = ['wheel', 'touchmove'] as const
    for (const name of events) {
      window.addEventListener(name, stop, { passive: true, once: true })
    }
    window.addEventListener('keydown', onKey)
    document.documentElement.dataset.autoplay = 'on'
    window.scrollTo({ top: 0, behavior: 'instant' })
    frame = requestAnimationFrame(step)
    return () => {
      stop()
      for (const name of events) window.removeEventListener(name, stop)
      window.removeEventListener('keydown', onKey)
      delete document.documentElement.dataset.autoplay
    }
  }, [])

  const register = (index: number) => (node: HTMLElement | null) => {
    sections.current[index] = node
  }

  return (
    <div
      ref={pageRef}
      className='mobius-page mobius-scroll'
      id='top'
      lang={toIntlLocale(i18n.resolvedLanguage || i18n.language)}
    >
      <a href='#main' className='mobius-skip'>
        {t('Skip to content')}
      </a>
      <header className='mobius-header'>
        <a href='#top' className='mobius-brand' aria-label={t('Go to home')}>
          <img src='/zh-logo.png' alt='' aria-hidden='true' />
          <span>
            {siteName}
            <small>AI GATEWAY</small>
          </span>
        </a>
        <nav aria-label={t('Main navigation')}>
          <a href='#top'>{t('Homepage')}</a>
          <Link to='/pricing'>{t('Models')}</Link>
          <Link to='/dashboard'>{t('Console')}</Link>
          <a href='#relaydesk'>
            RelayDesk <span className='mobius-nav-dot' />
          </a>
        </nav>
        <div className='mobius-header-actions'>
          <LanguageSwitcher />
          <Button
            className='mobius-button mobius-header-cta'
            role='link'
            render={<Link to={user ? '/dashboard' : '/sign-in'} />}
          >
            {user ? t('Console') : t('Sign In')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
        </div>
      </header>

      <DataSculpture
        paused={paused}
        onPauseChange={() => setPaused((value) => !value)}
        readStage={readStage}
      />

      <main id='main' tabIndex={-1} className='mobius-flow'>
        <section
          ref={register(0)}
          className='mobius-section section-hero'
          aria-labelledby='mobius-title'
        >
          <div className='mobius-shot'>
            <div className='mobius-copy'>
              <p className='mobius-eyebrow'>
                <span />
                {t('One connection. Infinite possibilities.')}
              </p>
              <h1 id='mobius-title'>
                {t('Intelligence,')}
                <em>{t('in continuous flow.')}</em>
              </h1>
              <p className='section-description'>
                {t(
                  'Connect your tools to a world of AI. One API, a continuous flow of possibilities.'
                )}
              </p>
              <div className='mobius-actions'>
                <Button
                  className='mobius-button'
                  role='link'
                  render={<Link to={user ? '/dashboard' : '/sign-up'} />}
                >
                  {t('Get Started')}
                  <ArrowUpRight aria-hidden='true' />
                </Button>
                <Button
                  variant='ghost'
                  className='mobius-button mobius-button-ghost'
                  role='link'
                  render={<a href='#relaydesk' />}
                >
                  {t('Discover RelayDesk')}
                  <ArrowRight aria-hidden='true' />
                </Button>
              </div>
            </div>
            <a
              href='#models'
              className='mobius-scroll-cue'
              data-hidden={cueGone}
            >
              <ArrowDown aria-hidden='true' />
              <span
                className='mobius-scroll-cue-text'
                aria-label={t('Scroll down')}
              >
                {cueChars.map((item) => (
                  <span
                    key={item.id}
                    aria-hidden='true'
                    style={{ '--i': item.order } as React.CSSProperties}
                  >
                    {item.char}
                  </span>
                ))}
              </span>
            </a>
          </div>
        </section>

        <section
          ref={register(1)}
          id='models'
          className='mobius-section section-models'
          aria-labelledby='model-title'
        >
          <div className='mobius-shot'>
            <div className='mobius-copy'>
              <p className='mobius-eyebrow'>01 / {t('AI model access')}</p>
              <h2 id='model-title'>
                {t('Many models.')}
                <em>{t('One connection.')}</em>
              </h2>
              <p className='section-description'>
                {t(
                  'Explore available models and prices, create API keys, and review usage in one place.'
                )}
              </p>
              <Button
                className='mobius-button'
                role='link'
                render={<Link to='/pricing' />}
              >
                {t('Models & Pricing')}
                <ArrowUpRight aria-hidden='true' />
              </Button>
              <div
                className='section-providers'
                aria-label={t('AI model access')}
              >
                <strong>OpenAI</strong>
                <strong className='mobius-claude'>Claude</strong>
                <strong>Gemini ✦</strong>
                <strong>deepseek</strong>
                <strong>Qwen</strong>
              </div>
              <p className='section-note'>
                {t('Model availability depends on site configuration.')}
              </p>
            </div>
          </div>
        </section>

        <section
          ref={register(2)}
          id='relaydesk'
          className='mobius-section section-desktop'
          aria-labelledby='desktop-title'
        >
          <div className='mobius-shot'>
            <div className='mobius-copy'>
              <p className='mobius-eyebrow'>
                02 / {t('From the cloud to your desktop')}
              </p>
              <h2 id='desktop-title'>
                {t('The flow continues.')}
                <em>RelayDesk.</em>
              </h2>
              <p className='section-description'>
                {t(
                  'Sign into your site, pick a model and tools; RelayDesk writes the endpoint, key, and model into your local AI tools in one click.'
                )}
              </p>
              <Button
                className='mobius-button'
                role='link'
                render={
                  <a
                    href={RELAYDESK_RELEASES_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('Download RelayDesk')}
                <ArrowUpRight aria-hidden='true' />
              </Button>
              <span className='mobius-platforms'>macOS / Windows / Linux</span>
            </div>
          </div>
        </section>

        <section
          ref={register(3)}
          id='tools'
          className='mobius-section section-tools'
          aria-labelledby='tools-title'
        >
          <div className='mobius-shot'>
            <div className='mobius-copy'>
              <p className='mobius-eyebrow'>
                03 / CLAUDE CODE · CODEX · GEMINI CLI
              </p>
              <h2 id='tools-title'>{t('Your tools, in sync.')}</h2>
            </div>
            <div className='section-tools-grid'>
              <div className='mobius-tool-strip' aria-label='RelayDesk'>
                <span>Claude Code</span>
                <span>Codex</span>
                <span>Gemini CLI</span>
              </div>
              <div className='section-features'>
                <div className='section-feature'>
                  <span>01</span>
                  <h3>{t('One-click apply')}</h3>
                  <p>
                    {t(
                      'Auto-creates a grouped API key; endpoint, key, and model are written into Claude Code, Codex, and Gemini CLI.'
                    )}
                  </p>
                </div>
                <div className='section-feature'>
                  <span>02</span>
                  <h3>{t('Site overview')}</h3>
                  <p>
                    {t(
                      'Balance, total spend, and 7-day usage stay visible after sign-in; switching models switches configs.'
                    )}
                  </p>
                </div>
                <div className='section-feature'>
                  <span>03</span>
                  <h3>{t('Diagnostics export')}</h3>
                  <p>
                    {t(
                      'One-click export of sanitized logs plus environment report — no more screenshot ping-pong when reporting issues.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          ref={register(4)}
          className='mobius-section section-closing'
          aria-labelledby='closing-title'
        >
          <div className='mobius-shot'>
            <div className='mobius-copy'>
              <p className='mobius-eyebrow'>
                {t('Less configuration. More creation.')}
              </p>
              <h2 id='closing-title'>
                {t('Where will your next')}
                <em>{t('connection take you?')}</em>
              </h2>
              <Button
                className='mobius-button'
                role='link'
                render={<Link to={user ? '/dashboard' : '/sign-up'} />}
              >
                {t('Get Started')}
                <ArrowUpRight aria-hidden='true' />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className='mobius-footer'>
        <span>{siteName} / AI GATEWAY</span>
        <nav aria-label={t('Footer')}>
          <Link to='/pricing'>{t('Models & Pricing')}</Link>
          <a href='#relaydesk'>RelayDesk</a>
          <Link to='/dashboard'>{t('Console')}</Link>
        </nav>
        <span>
          {/* Attribution and link required by NOTICE (AGPLv3 §7(b)); wording must stay verbatim. */}
          <a
            href='https://github.com/QuantumNous/new-api'
            target='_blank'
            rel='noopener noreferrer'
          >
            Frontend design and development by New API contributors.
          </a>
        </span>
      </footer>
    </div>
  )
}
