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
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { RegistrationNotice } from '@/features/auth/components/registration-notice'

export function RegistrationNoticePage(props: { onContinue: () => void }) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const { status } = useStatus()
  const hasUserAgreement = Boolean(status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(status?.privacy_policy_enabled)

  return (
    <div className='bg-background flex min-h-svh flex-col'>
      <header className='flex items-center justify-between border-b px-4 py-3 sm:px-8'>
        <Link to='/' className='flex items-center gap-2'>
          {loading ? (
            <Skeleton className='h-8 w-8 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-8 w-8 rounded-full object-cover'
            />
          )}
          {loading ? (
            <Skeleton className='h-5 w-20' />
          ) : (
            <span className='text-lg font-semibold'>{systemName}</span>
          )}
        </Link>
        <Link
          to='/sign-in'
          className='text-muted-foreground hover:text-foreground text-sm'
        >
          {t('Sign in')}
        </Link>
      </header>
      <main className='flex flex-1 items-center justify-center px-4 py-8'>
        <div className='w-full max-w-3xl space-y-6'>
          <div className='space-y-1 text-center'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('Registration notice')}
            </h1>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Please read the following notice carefully before creating your account.'
              )}
            </p>
          </div>
          <RegistrationNotice onContinue={props.onContinue} />
          {(hasUserAgreement || hasPrivacyPolicy) && (
            <p className='text-muted-foreground text-center text-xs'>
              {hasUserAgreement && (
                <Link
                  to='/user-agreement'
                  className='hover:text-foreground underline underline-offset-4'
                >
                  {t('User Agreement')}
                </Link>
              )}
              {hasUserAgreement && hasPrivacyPolicy && ' · '}
              {hasPrivacyPolicy && (
                <Link
                  to='/privacy-policy'
                  className='hover:text-foreground underline underline-offset-4'
                >
                  {t('Privacy Policy')}
                </Link>
              )}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
