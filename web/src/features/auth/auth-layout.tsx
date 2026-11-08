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
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { GlyphStream } from '@/features/home/components/glyph-stream'

type AuthLayoutProps = {
  children: React.ReactNode
}

const BRAND_FEATURES = [
  {
    num: '01',
    title: 'Models and pricing',
    description: 'Compare models, supported endpoints, groups, and current prices.',
  },
  {
    num: '02',
    title: 'API keys',
    description: 'Create keys and manage access, model limits, and usage quotas.',
  },
  {
    num: '03',
    title: 'Usage and logs',
    description: 'Review requests, tokens, cost, and task history.',
  },
  {
    num: '04',
    title: 'Wallet and subscriptions',
    description: 'View your balance, recharge options, and subscription plans.',
  },
] as const

function BrandMark() {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  return (
    <Link to='/' className='flex items-center gap-2 transition-opacity hover:opacity-80'>
      <div className='relative h-9 w-9'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-9 w-9 rounded-full object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <span className='text-xl font-semibold'>{systemName}</span>
      )}
    </Link>
  )
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/30 relative flex min-h-svh items-center justify-center p-4 sm:p-6'>
      <div className='bg-card grid w-full max-w-5xl overflow-hidden rounded-2xl border shadow-sm lg:grid-cols-2'>
        <aside className='relative hidden flex-col justify-between gap-10 overflow-hidden border-r bg-zinc-950 p-10 text-zinc-100 lg:flex'>
          <div
            aria-hidden='true'
            className='absolute inset-0 opacity-45 [&_.glyph-stream]:absolute [&_.glyph-stream]:inset-0 [&_.glyph-stream]:m-0 [&_.glyph-stream-canvas]:h-full [&_.glyph-stream-canvas]:w-full [&_.glyph-static-word]:text-zinc-500'
          >
            <GlyphStream paused={false} />
          </div>
          <div
            aria-hidden='true'
            className='absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/55 to-zinc-950/80'
          />
          <div className='relative'>
            <BrandMark />
          </div>
          <div className='relative space-y-5'>
            <span className='inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-300'>
              {t('AI model access')}
            </span>
            <h1 className='text-3xl leading-tight font-semibold tracking-tight'>
              {t('One gateway for your AI workflow')}
            </h1>
            <p className='text-sm leading-relaxed text-zinc-300'>
              {t(
                'Explore available models and prices, create API keys, and review usage in one place.'
              )}
            </p>
          </div>
          <ul className='relative grid grid-cols-2 gap-3'>
            {BRAND_FEATURES.map((item) => (
              <li
                key={item.num}
                className='rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur-sm'
              >
                <div className='font-mono text-xs text-emerald-300/80'>
                  {item.num}
                </div>
                <div className='mt-1 text-sm font-medium'>{t(item.title)}</div>
                <div className='mt-1 text-xs leading-relaxed text-zinc-400'>
                  {t(item.description)}
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <div className='flex min-h-svh flex-col lg:min-h-0'>
          <div className='p-6 pb-0 lg:hidden'>
            <BrandMark />
          </div>
          <div className='flex flex-1 items-center justify-center'>
            <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-10'>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
