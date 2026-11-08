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
import { ArrowDown, ArrowUpRight, Command } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { RelayDeskTerminal } from '@/features/home/components/relaydesk-terminal'
import { RELAYDESK_RELEASES_URL } from '@/features/home/components/sections/relaydesk'

/** A tall scroll segment whose panel stays pinned while its form is on screen. */
function Segment(props: {
  index: number
  anchor: string
  side: 'center' | 'left' | 'right'
  labelledBy: string
  panelRef: Ref<HTMLDivElement>
  children: ReactNode
}) {
  return (
    <section
      className='scroll-segment'
      data-section={props.index}
      aria-labelledby={props.labelledBy}
    >
      {/* Landing point for in-page links: the moment the panel is fully read. */}
      <span id={props.anchor} className='scroll-anchor' aria-hidden='true' />
      <div className='scroll-stick'>
        <div
          ref={props.panelRef}
          className='scroll-panel'
          data-side={props.side}
        >
          {props.children}
        </div>
      </div>
    </section>
  )
}

export function ScrollSections(props: {
  appOrigin: string
  terminalPaused: boolean
  panelRef: (index: number) => Ref<HTMLDivElement>
}) {
  const { t } = useTranslation()
  const app = props.appOrigin

  return (
    <>
      <Segment
        index={0}
        anchor='top'
        side='center'
        labelledBy='scroll-title'
        panelRef={props.panelRef(0)}
      >
        <p className='scroll-eyebrow'>
          <span aria-hidden='true' />
          {t('One connection. Infinite possibilities.')}
        </p>
        <h1 id='scroll-title'>{t('One gateway for your AI workflow')}</h1>
        <p className='scroll-description'>
          {t(
            'Connect your tools to a world of AI. One API, a continuous flow of possibilities.'
          )}
        </p>
        <div className='scroll-actions'>
          <Button
            className='scroll-button'
            role='link'
            render={<a href={`${app}/dashboard`} />}
          >
            {t('Get Started')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
          <Button
            variant='ghost'
            className='scroll-button scroll-button-line'
            role='link'
            render={<a href='#relaydesk' />}
          >
            {t('Download RelayDesk')}
            <ArrowDown aria-hidden='true' />
          </Button>
        </div>
        <p className='scroll-command'>
          <b>$</b> POST /v1/chat/completions → 200
          <span>{t('Illustrative request, not live service data')}</span>
        </p>
      </Segment>

      <Segment
        index={1}
        anchor='platform'
        side='right'
        labelledBy='scroll-models'
        panelRef={props.panelRef(1)}
      >
        <p className='scroll-eyebrow'>01 / {t('AI model access')}</p>
        <h2 id='scroll-models'>
          {t('Many models.')}
          <em>{t('One connection.')}</em>
        </h2>
        <p className='scroll-description'>
          {t(
            'Explore available models and prices, create API keys, and review usage in one place.'
          )}
        </p>
        <Button
          className='scroll-button'
          role='link'
          render={<a href={`${app}/pricing`} />}
        >
          {t('Models & Pricing')}
          <ArrowUpRight aria-hidden='true' />
        </Button>
        <p className='scroll-note'>
          {t('Model availability depends on site configuration.')}
        </p>
      </Segment>

      <Segment
        index={2}
        anchor='relaydesk'
        side='left'
        labelledBy='scroll-desktop'
        panelRef={props.panelRef(2)}
      >
        <p className='scroll-eyebrow'>
          02 / {t('From the cloud to your desktop')}
        </p>
        <h2 id='scroll-desktop'>
          {t('The flow continues.')}
          <em>RelayDesk.</em>
        </h2>
        <p className='scroll-description'>
          {t(
            'Sign into your site, pick a model and tools; RelayDesk writes the endpoint, key, and model into your local AI tools in one click.'
          )}
        </p>
        <Button
          className='scroll-button'
          role='link'
          render={
            <a
              href={RELAYDESK_RELEASES_URL}
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          {t('View GitHub Releases')}
          <ArrowUpRight aria-hidden='true' />
        </Button>
      </Segment>

      <Segment
        index={3}
        anchor='tools'
        side='left'
        labelledBy='scroll-tools'
        panelRef={props.panelRef(3)}
      >
        <p className='scroll-eyebrow'>03 / CLAUDE CODE · CODEX · GEMINI CLI</p>
        <h2 id='scroll-tools'>{t('Your tools, in sync.')}</h2>
        <div className='scroll-terminal'>
          <div className='scroll-terminal-heading'>
            <Command aria-hidden='true' />
            <span>RelayDesk</span>
            <span>{t('Illustrative demo')}</span>
          </div>
          <RelayDeskTerminal paused={props.terminalPaused} />
        </div>
      </Segment>

      <Segment
        index={4}
        anchor='features'
        side='right'
        labelledBy='scroll-features'
        panelRef={props.panelRef(4)}
      >
        <p className='scroll-eyebrow' id='scroll-features'>
          04 / RELAYDESK
        </p>
        <div className='scroll-feature'>
          <span>01</span>
          <h3>{t('One-click apply')}</h3>
          <p>
            {t(
              'Auto-creates a grouped API key; endpoint, key, and model are written into Claude Code, Codex, and Gemini CLI.'
            )}
          </p>
        </div>
        <div className='scroll-feature'>
          <span>02</span>
          <h3>{t('Site overview')}</h3>
          <p>
            {t(
              'Balance, total spend, and 7-day usage stay visible after sign-in; switching models switches configs.'
            )}
          </p>
        </div>
        <div className='scroll-feature'>
          <span>03</span>
          <h3>{t('Diagnostics export')}</h3>
          <p>
            {t(
              'One-click export of sanitized logs plus environment report — no more screenshot ping-pong when reporting issues.'
            )}
          </p>
        </div>
      </Segment>

      <Segment
        index={5}
        anchor='start'
        side='left'
        labelledBy='scroll-closing'
        panelRef={props.panelRef(5)}
      >
        <p className='scroll-eyebrow'>
          {t('Less configuration. More creation.')}
        </p>
        <h2 id='scroll-closing'>
          {t('Where will your next')}
          <em>{t('connection take you?')}</em>
        </h2>
        <div className='scroll-actions'>
          <Button
            className='scroll-button'
            role='link'
            render={<a href={`${app}/dashboard`} />}
          >
            {t('Get Started')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
        </div>
      </Segment>
    </>
  )
}
