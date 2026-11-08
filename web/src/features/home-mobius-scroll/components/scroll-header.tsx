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
import {
  ArrowDown,
  ArrowUpRight,
  Infinity as InfinityIcon,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/theme-provider'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
} from '@/i18n/languages'

const SHORT_LABELS: Record<string, string> = {
  zhCN: '简',
  zhTW: '繁',
  en: 'EN',
}

export function ScrollHeader(props: { siteName: string; appOrigin: string }) {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const language = normalizeInterfaceLanguage(i18n.language)
  const dark = theme.resolvedTheme === 'dark'

  return (
    <header className='scroll-header' data-open={open}>
      <a href='#top' className='scroll-brand' onClick={() => setOpen(false)}>
        <InfinityIcon aria-hidden='true' />
        <span>
          {props.siteName}
          <small>AI GATEWAY</small>
        </span>
      </a>
      <nav
        id='scroll-nav'
        className='scroll-nav'
        aria-label={t('Main navigation')}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <a href='#platform'>{t('Platform')}</a>
        <a href={`${props.appOrigin}/pricing`}>
          {t('Models & Pricing')}
          <ArrowUpRight aria-hidden='true' />
        </a>
        <a href='#relaydesk'>
          RelayDesk
          <ArrowDown aria-hidden='true' />
        </a>
        <a className='scroll-nav-mobile' href={`${props.appOrigin}/sign-in`}>
          {t('Sign In')}
        </a>
        <a className='scroll-nav-mobile' href={`${props.appOrigin}/dashboard`}>
          {t('Console')}
          <ArrowUpRight aria-hidden='true' />
        </a>
      </nav>
      <div className='scroll-tools'>
        <div
          className='scroll-languages'
          role='group'
          aria-label={t('Switch language')}
        >
          {INTERFACE_LANGUAGE_OPTIONS.map((option) => (
            <Button
              key={option.code}
              variant='ghost'
              aria-label={option.label}
              aria-pressed={language === option.code}
              onClick={() => void i18n.changeLanguage(option.code)}
            >
              {SHORT_LABELS[option.code]}
            </Button>
          ))}
        </div>
        <Button
          variant='ghost'
          className='scroll-icon-button'
          aria-label={`${t('Toggle theme')}: ${dark ? t('Light') : t('Dark')}`}
          onClick={() => theme.setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <Sun aria-hidden='true' /> : <Moon aria-hidden='true' />}
        </Button>
        <a className='scroll-login' href={`${props.appOrigin}/sign-in`}>
          {t('Sign In')}
        </a>
        <Button
          className='scroll-button scroll-header-cta'
          role='link'
          render={<a href={`${props.appOrigin}/dashboard`} />}
        >
          {t('Console')}
          <ArrowUpRight aria-hidden='true' />
        </Button>
        <Button
          variant='ghost'
          className='scroll-icon-button scroll-menu-button'
          aria-expanded={open}
          aria-controls='scroll-nav'
          aria-label={open ? t('Close menu') : t('Open menu')}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden='true' /> : <Menu aria-hidden='true' />}
        </Button>
      </div>
    </header>
  )
}
