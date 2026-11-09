import { Link } from '@tanstack/react-router'
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
import { KeyRound, ListChecks, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { useServerAddress } from '@/hooks/use-server-address'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ClientCards } from './components/client-cards'
import { ProtocolExamples } from './components/protocol-examples'

const SECTION_IDS = [
  'quick-start',
  'examples',
  'clients',
  'errors',
  'extra',
] as const

type SectionId = (typeof SECTION_IDS)[number]

const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  'quick-start': 'Quick start',
  examples: 'API examples',
  clients: 'Client configuration',
  errors: 'Common errors',
  extra: 'Notes',
}

const ERROR_ROWS: {
  symptom: string
  status: string
  code: string
  handling: string
}[] = [
  {
    symptom: 'Invalid API key',
    status: '401',
    code: '—',
    handling: 'The key is wrong or deleted; confirm it on the API keys page.',
  },
  {
    symptom: 'Access denied',
    status: '403',
    code: 'access_denied',
    handling:
      'Your IP is not on the allowlist, or the token group does not permit this model.',
  },
  {
    symptom: 'Insufficient balance',
    status: '403',
    code: 'insufficient_user_quota',
    handling: 'Top up in the wallet page.',
  },
  {
    symptom: 'Account restricted',
    status: '403',
    code: 'risk_restricted',
    handling:
      'Risk control triggered a temporary restriction; the message states when it lifts. You can appeal on the risk events page.',
  },
  {
    symptom: 'Too many requests',
    status: '429',
    code: '—',
    handling: 'Lower the request frequency.',
  },
  {
    symptom: 'Model unavailable',
    status: '503',
    code: 'model_not_found',
    handling:
      'The model name is wrong or no channel in this group serves it; check the model marketplace.',
  },
  {
    symptom: 'Content blocked',
    status: '422',
    code: 'sensitive_words_detected',
    handling:
      'The request or response hit the content filter; the specific word is not disclosed.',
  },
]

function scrollToSection(id: SectionId) {
  document.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth' })
}

function Toc(props: { extra: boolean }) {
  const { t } = useTranslation()
  const sections = SECTION_IDS.filter((id) => id !== 'extra' || props.extra)
  return (
    <nav aria-label={t('On this page')} className='space-y-1'>
      <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase'>
        {t('On this page')}
      </p>
      {sections.map((id) => (
        <button
          key={id}
          type='button'
          onClick={() => scrollToSection(id)}
          className='text-muted-foreground hover:text-foreground block w-full rounded px-2 py-1 text-left text-sm transition-colors'
        >
          {t(SECTION_LABEL_KEYS[id])}
        </button>
      ))}
    </nav>
  )
}

export function Docs() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const baseUrl = useServerAddress().replace(/\/+$/, '')
  const { status } = useStatus()
  const extra =
    typeof status?.docs_guide_extra === 'string'
      ? status.docs_guide_extra.trim()
      : ''
  const keyHref = user ? '/keys' : '/sign-in'

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-5xl gap-10 py-8 lg:pr-44'>
        <div className='min-w-0 flex-1 space-y-12'>
          <header className='space-y-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('Integration guide')}
            </h1>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Connect your application to this gateway with an API key and one of the supported protocols.'
              )}
            </p>
          </header>

          <section id='quick-start' aria-labelledby='docs-quick-start'>
            <div className='mb-4 flex items-center gap-2'>
              <Rocket className='text-muted-foreground size-4' />
              <h2 id='docs-quick-start' className='text-lg font-semibold'>
                {t('Quick start')}
              </h2>
            </div>
            <div className='space-y-4'>
              <div className='space-y-1'>
                <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('Base URL')}
                </p>
                <div className='flex items-center gap-2'>
                  <code className='bg-muted min-w-0 flex-1 truncate rounded px-3 py-2 font-mono text-sm'>
                    {baseUrl}
                  </code>
                  <CopyButton value={baseUrl} aria-label={t('Copy base URL')} />
                </div>
              </div>
              <ol className='text-muted-foreground list-decimal space-y-2 pl-5 text-sm'>
                <li>
                  <Link
                    to={keyHref}
                    className='text-primary underline-offset-4 hover:underline'
                  >
                    {t('Create an API key')}
                  </Link>
                </li>
                <li>
                  <Link
                    to='/pricing'
                    className='text-primary underline-offset-4 hover:underline'
                  >
                    {t('Pick a model from the marketplace')}
                  </Link>
                </li>
                <li>
                  <button
                    type='button'
                    onClick={() => scrollToSection('examples')}
                    className='text-primary hover:underline'
                  >
                    {t('Send a request using the examples below')}
                  </button>
                </li>
              </ol>
            </div>
          </section>

          <section id='examples' aria-labelledby='docs-examples'>
            <div className='mb-4 flex items-center gap-2'>
              <ListChecks className='text-muted-foreground size-4' />
              <h2 id='docs-examples' className='text-lg font-semibold'>
                {t('API examples')}
              </h2>
            </div>
            <ProtocolExamples baseUrl={baseUrl} />
          </section>

          <section id='clients' aria-labelledby='docs-clients'>
            <div className='mb-4 flex items-center gap-2'>
              <KeyRound className='text-muted-foreground size-4' />
              <h2 id='docs-clients' className='text-lg font-semibold'>
                {t('Client configuration')}
              </h2>
            </div>
            <ClientCards baseUrl={baseUrl} />
          </section>

          <section id='errors' aria-labelledby='docs-errors'>
            <h2 id='docs-errors' className='mb-4 text-lg font-semibold'>
              {t('Common errors')}
            </h2>
            <div className='overflow-x-auto rounded-lg border'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='bg-muted/50 border-b text-left'>
                    <th className='px-3 py-2 font-medium'>{t('Symptom')}</th>
                    <th className='px-3 py-2 font-medium'>{t('HTTP')}</th>
                    <th className='px-3 py-2 font-medium'>{t('Error code')}</th>
                    <th className='px-3 py-2 font-medium'>{t('Handling')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ERROR_ROWS.map((row) => (
                    <tr
                      key={row.code + row.status}
                      className='border-b last:border-0'
                    >
                      <td className='px-3 py-2'>{t(row.symptom)}</td>
                      <td className='px-3 py-2 font-mono'>{row.status}</td>
                      <td className='px-3 py-2 font-mono'>{row.code}</td>
                      <td className='text-muted-foreground px-3 py-2'>
                        {t(row.handling)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {extra && (
            <section id='extra' aria-labelledby='docs-extra'>
              <h2 id='docs-extra' className='mb-4 text-lg font-semibold'>
                {t('Notes')}
              </h2>
              <RichContent mode='markdown' content={extra} />
            </section>
          )}
        </div>

        <aside
          className={cn(
            'fixed top-24 right-[max(1rem,calc((100vw-64rem)/2))] hidden w-36',
            'lg:block'
          )}
        >
          <Toc extra={Boolean(extra)} />
        </aside>
      </div>
    </PublicLayout>
  )
}
