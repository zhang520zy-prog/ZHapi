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

import { PublicLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'

import { RegistrationNoticeContent } from './registration-notice-content'

/**
 * Public legal-centre view of the registration/risk notice. The same body is
 * shown inside the sign-up gate, but here it is read-only and always
 * accessible.
 */
export function RegistrationNotice() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const related = [
    status?.user_agreement_enabled
      ? { to: '/user-agreement', label: t('User Agreement') }
      : null,
    status?.privacy_policy_enabled
      ? { to: '/privacy-policy', label: t('Privacy Policy') }
      : null,
  ].filter((item): item is { to: string; label: string } => item !== null)

  return (
    <PublicLayout>
      <div className='mx-auto max-w-4xl space-y-6 py-12'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('Registration notice')}
          </h1>
          <p className='text-muted-foreground'>
            {t(
              'Read this notice in full before registering, especially the prohibited uses, operator duties, and liability limitations.'
            )}
          </p>
          {related.length > 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('Related documents')}:{' '}
              {related.map((item, index) => (
                <span key={item.to}>
                  {index > 0 ? ' · ' : ''}
                  <Link
                    to={item.to}
                    className='text-primary underline underline-offset-4'
                  >
                    {item.label}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className='text-sm leading-7 break-words'>
          <RegistrationNoticeContent />
        </div>
      </div>
    </PublicLayout>
  )
}
