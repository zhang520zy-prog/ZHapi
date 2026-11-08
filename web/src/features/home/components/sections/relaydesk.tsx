/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { RelayDeskTerminal } from '../relaydesk-terminal'

export const RELAYDESK_RELEASES_URL =
  'https://github.com/zhang520zy-prog/RelayDesk/releases'

export function RelayDeskSection(props: { paused?: boolean }) {
  const { t } = useTranslation()

  return (
    <section
      id='relaydesk'
      className='relaydesk-spotlight'
      aria-labelledby='relaydesk-heading'
    >
      <div className='relaydesk-section-head'>
        <div>
          <p className='relaydesk-eyebrow'>DESKTOP / COMPANION</p>
          <h2 id='relaydesk-heading'>RelayDesk</h2>
        </div>
        <a
          href={RELAYDESK_RELEASES_URL}
          target='_blank'
          rel='noopener noreferrer'
        >
          {t('View GitHub Releases')}{' '}
          <ExternalLink aria-hidden='true' className='inline size-3' />
        </a>
      </div>
      <div className='relaydesk-spotlight-grid'>
        <div>
          <p className='relaydesk-spotlight-lead'>
            {t(
              'Sign into your site, pick a model and tools; RelayDesk writes the endpoint, key, and model into your local AI tools in one click.'
            )}
          </p>
          <ul className='relaydesk-points'>
            <li>
              <b>{t('One-click apply')}</b>
              <span>
                {t(
                  'Auto-creates a grouped API key; endpoint, key, and model are written into Claude Code, Codex, and Gemini CLI.'
                )}
              </span>
            </li>
            <li>
              <b>{t('Site overview')}</b>
              <span>
                {t(
                  'Balance, total spend, and 7-day usage stay visible after sign-in; switching models switches configs.'
                )}
              </span>
            </li>
            <li>
              <b>{t('Diagnostics export')}</b>
              <span>
                {t(
                  'One-click export of sanitized logs plus environment report — no more screenshot ping-pong when reporting issues.'
                )}
              </span>
            </li>
          </ul>
          <Button
            className='relaydesk-action relaydesk-action-primary'
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
            <ExternalLink aria-hidden='true' className='size-4' />
          </Button>
          <p className='relaydesk-note'>
            {t(
              'Visit the official GitHub Releases page to read version notes and choose the installer for your platform.'
            )}
          </p>
        </div>
        <RelayDeskTerminal paused={props.paused ?? false} />
      </div>
      <div className='relaydesk-steps'>
        <div>
          <b>01 / INSTALL</b>
          <p>
            {t(
              'Grab the installer for your platform from GitHub Releases — install, open, done.'
            )}
          </p>
        </div>
        <div>
          <b>02 / CHECK</b>
          <p>
            {t(
              'Sign in to your site; the environment doctor checks Git, Node, and CLI tools — whatever is missing gets a guided install.'
            )}
          </p>
        </div>
        <div>
          <b>03 / APPLY</b>
          <p>
            {t(
              'Pick a model and targets, then apply — endpoint, grouped key, and model are written locally. Ready to call.'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
