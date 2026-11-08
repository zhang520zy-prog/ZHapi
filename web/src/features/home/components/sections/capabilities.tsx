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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function Capabilities() {
  const { t } = useTranslation()
  const items = [
    {
      id: 'models',
      num: '01',
      title: t('Models and pricing'),
      description: t(
        'Compare models, supported endpoints, groups, and current prices.'
      ),
      to: '/pricing' as const,
    },
    {
      id: 'keys',
      num: '02',
      title: t('API keys'),
      description: t(
        'Create keys and manage access, model limits, and usage quotas.'
      ),
      to: '/keys' as const,
    },
    {
      id: 'usage',
      num: '03',
      title: t('Usage and logs'),
      description: t('Review requests, tokens, cost, and task history.'),
      to: '/usage-logs' as const,
    },
    {
      id: 'wallet',
      num: '04',
      title: t('Wallet and subscriptions'),
      description: t(
        'View your balance, recharge options, and subscription plans.'
      ),
      to: '/wallet' as const,
    },
  ]

  return (
    <section
      id='platform-access'
      className='relaydesk-platform'
      aria-labelledby='capabilities-heading'
    >
      <div className='relaydesk-platform-inner'>
        <div className='relaydesk-section-head'>
          <div>
            <p className='relaydesk-eyebrow'>PLATFORM / ACCESS</p>
            <h2
              id='capabilities-heading'
              className='relaydesk-platform-heading'
            >
              {t('Everything you need to use the gateway')}
            </h2>
          </div>
          <Link to='/dashboard' className='relaydesk-section-link'>
            {t('Open console')}{' '}
            <ArrowUpRight aria-hidden='true' className='inline size-4' />
          </Link>
        </div>
        <div className='relaydesk-features'>
          {items.map((item) => (
            <Link key={item.id} to={item.to} className='relaydesk-feature'>
              <span className='relaydesk-feature-num'>{item.num}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ArrowUpRight
                aria-hidden='true'
                className='relaydesk-feature-arrow size-4'
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
