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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { RELAYDESK_RELEASES_URL } from '@/features/home/components/sections/relaydesk'

export const MODEL_NAMES = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen']

// Terminal lines appear one by one as the data stream reaches the window.
const TERMINAL_LINES = [
  { command: true, text: 'relaydesk doctor' },
  {
    command: false,
    text: '→ git · node · python · reachability',
    status: 'ok',
  },
  {
    command: false,
    text: '→ proxy · dir writable · 3 cli found',
    status: 'ok',
  },
  { command: true, text: 'relaydesk apply' },
  { command: false, text: '→ grouped key · endpoint · model', status: 'ok' },
  { command: false, text: '✓ Claude Code · Codex · Gemini CLI' },
]
export const TERMINAL_LINE_COUNT = TERMINAL_LINES.length

/**
 * Page sections. `data-flow` marks the boxes the sculpture attaches to and
 * `data-flow-copy` marks live text the glyphs thin out behind.
 */
export function FlowSections(props: { appOrigin: string }) {
  const { t } = useTranslation()
  const app = props.appOrigin

  return (
    <>
      <section
        id='top'
        className='flow-section flow-hero'
        data-flow='hero'
        data-flow-section
        aria-labelledby='flow-title'
      >
        <div className='flow-hero-head' data-flow='hero-head' data-flow-copy>
          <p className='flow-eyebrow'>
            <span aria-hidden='true' />
            {t('One connection. Infinite possibilities.')}
          </p>
          <h1 id='flow-title'>{t('One gateway for your AI workflow')}</h1>
        </div>
        <div className='flow-hero-body' data-flow='hero-body' data-flow-copy>
          <p className='flow-description'>
            {t(
              'Connect your tools to a world of AI. One API, a continuous flow of possibilities.'
            )}
          </p>
          <div className='flow-actions'>
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
          <p className='flow-command'>
            <b>$</b> POST /v1/chat/completions → 200
            <span>{t('Illustrative request, not live service data')}</span>
          </p>
        </div>
      </section>

      <section
        id='platform'
        className='flow-section flow-models'
        data-flow-section
        aria-labelledby='flow-models-title'
      >
        <div className='flow-copy' data-flow-copy>
          <p className='flow-eyebrow'>01 / {t('AI model access')}</p>
          <h2 id='flow-models-title'>
            {t('Many models.')}
            <em>{t('One connection.')}</em>
          </h2>
          <p className='flow-description'>
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
        </div>
        <div className='flow-pillar-row'>
          <div className='flow-pillar' data-flow='pillar' aria-hidden='true' />
          <ul className='flow-model-list'>
            {MODEL_NAMES.map((name) => (
              <li key={name} data-flow='model'>
                <span className='flow-model-dot' aria-hidden='true' />
                {name}
              </li>
            ))}
            <li className='flow-model-note'>
              {t('Model availability depends on site configuration.')}
            </li>
          </ul>
        </div>
      </section>

      <section
        id='relaydesk'
        className='flow-section flow-desktop'
        data-flow-section
        aria-labelledby='flow-desktop-title'
      >
        <div className='flow-copy' data-flow-copy>
          <p className='flow-eyebrow'>
            02 / {t('From the cloud to your desktop')}
          </p>
          <h2 id='flow-desktop-title'>
            {t('The flow continues.')}
            <em>RelayDesk.</em>
          </h2>
          <p className='flow-description'>
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
        </div>
        <div className='flow-terminal' data-flow='terminal'>
          <div className='flow-terminal-bar'>
            <Command aria-hidden='true' />
            <span>relaydesk</span>
            <span>{t('Illustrative demo')}</span>
          </div>
          <div className='flow-terminal-body'>
            {TERMINAL_LINES.map((line, index) => (
              <p key={line.text} data-line={index} data-shown='false'>
                {line.command ? <b>$</b> : null}
                <span>{line.text}</span>
                {line.status ? <em>{line.status}</em> : null}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section
        id='features'
        className='flow-section flow-features'
        data-flow-section
        aria-labelledby='flow-features-title'
      >
        <div className='flow-copy flow-features-head' data-flow-copy>
          <p className='flow-eyebrow'>03 / CLAUDE CODE · CODEX · GEMINI CLI</p>
          <h2 id='flow-features-title'>{t('Your tools, in sync.')}</h2>
        </div>
        <ol className='flow-timeline'>
          <span
            className='flow-timeline-rail'
            data-flow='timeline'
            aria-hidden='true'
          />
          {[
            [
              t('One-click apply'),
              t(
                'Auto-creates a grouped API key; endpoint, key, and model are written into Claude Code, Codex, and Gemini CLI.'
              ),
            ],
            [
              t('Site overview'),
              t(
                'Balance, total spend, and 7-day usage stay visible after sign-in; switching models switches configs.'
              ),
            ],
            [
              t('Diagnostics export'),
              t(
                'One-click export of sanitized logs plus environment report — no more screenshot ping-pong when reporting issues.'
              ),
            ],
          ].map(([title, description], index) => (
            <li key={title} data-flow-node-item data-active='false'>
              <span className='flow-node' data-flow='node' aria-hidden='true'>
                0{index + 1}
              </span>
              <div data-flow-copy>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        id='start'
        className='flow-section flow-closing'
        data-flow-section
        aria-labelledby='flow-closing-title'
      >
        <div className='flow-ring' data-flow='ring' data-flow-copy>
          <p className='flow-eyebrow'>
            {t('Less configuration. More creation.')}
          </p>
          <h2 id='flow-closing-title'>
            {t('Where will your next')}
            <em>{t('connection take you?')}</em>
          </h2>
          <div className='flow-actions'>
            <Button
              className='scroll-button'
              role='link'
              render={<a href={`${app}/dashboard`} />}
            >
              {t('Get Started')}
              <ArrowUpRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
