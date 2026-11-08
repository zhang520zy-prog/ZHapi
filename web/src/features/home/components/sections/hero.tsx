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
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import { GlyphStream } from '../glyph-stream'
import { TypewriterCommand } from '../typewriter-command'

interface HeroProps {
  paused: boolean
  onPauseChange: () => void
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const siteName = (status?.system_name as string | undefined) || 'AI API'

  return (
    <section className='relaydesk-hero' aria-labelledby='relaydesk-hero-title'>
      <div className='relaydesk-hero-inner'>
        <div className='relaydesk-hero-meta'>
          <span>SYS://GATEWAY_001</span>
          <span>{t('AI model access')}</span>
        </div>
        <h1 id='relaydesk-hero-title' className='sr-only'>
          {siteName} — {t('One gateway for your AI workflow')}
        </h1>
        <GlyphStream paused={props.paused} />
        <p className='relaydesk-hero-headline'>
          {t('One gateway for your AI workflow')}
        </p>
        <div
          className='relaydesk-hero-terminal'
          aria-label={t('Illustrative request, not live service data')}
        >
          <span aria-hidden='true'>$</span>
          <TypewriterCommand paused={props.paused} />
          <span className='relaydesk-hero-terminal-meta'>
            REQUEST / EXAMPLE · 200 · HTTP / JSON
          </span>
        </div>
        <div className='relaydesk-hero-foot'>
          <p>
            {t(
              'Explore available models and prices, create API keys, and review usage in one place.'
            )}
          </p>
          <div className='relaydesk-hero-actions'>
            <Button
              className='relaydesk-action relaydesk-action-primary'
              role='link'
              render={<Link to='/dashboard' />}
            >
              {t('Get Started')}
              <ArrowUpRight aria-hidden='true' className='size-4' />
            </Button>
            <Button
              variant='outline'
              role='link'
              className='relaydesk-action relaydesk-action-secondary'
              render={<a href='#relaydesk' />}
            >
              {t('Download RelayDesk')}
              <ArrowDown aria-hidden='true' className='size-4' />
            </Button>
          </div>
        </div>
        <a className='relaydesk-hero-bottom' href='#relaydesk'>
          <span>SHENLAN / WEB ACCESS</span>
          <span>
            {t('RelayDesk desktop app — one-click setup for local AI tools')}{' '}
            <ArrowDown aria-hidden='true' className='inline size-3' />
          </span>
        </a>
        <Button
          variant='ghost'
          className='glyph-motion-control'
          aria-pressed={props.paused}
          onClick={props.onPauseChange}
        >
          {props.paused ? (
            <Play aria-hidden='true' />
          ) : (
            <Pause aria-hidden='true' />
          )}
          {props.paused ? t('Play visual effects') : t('Pause visual effects')}
        </Button>
      </div>
    </section>
  )
}
