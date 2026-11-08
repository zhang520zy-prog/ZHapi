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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { createServerError } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getDatabaseHealth } from '../api'

export function DatabaseHealthPanel() {
  const { t, i18n } = useTranslation()
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['system-info', 'database-health'],
    enabled: isRoot,
    queryFn: async () => {
      const res = await getDatabaseHealth()
      if (!res.success || !res.data) {
        throw createServerError(res, t('Database health unavailable'))
      }
      return res.data
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })
  if (!isRoot) return null
  const health = query.data
  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>
            <h3>{t('Database health')}</h3>
          </CardTitle>
          <CardDescription>
            {t('Database availability and retained audit deliveries.')}
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? t('Refreshing...') : t('Refresh database health')}
        </Button>
      </CardHeader>
      <CardContent aria-busy={query.isFetching}>
        {query.isLoading && <LoadingState />}
        {query.isError && (
          <ErrorState
            title={t('Database health unavailable')}
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        )}
        {!query.isError && health && (
          <div className='space-y-3' aria-live='polite'>
            <dl className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
              <div
                role='group'
                aria-label={t('Main database')}
                className='space-y-2 rounded-md border p-3'
              >
                <dt className='text-muted-foreground text-xs'>
                  {t('Main database')}
                </dt>
                <dd>
                  <Badge
                    variant={health.main_healthy ? 'outline' : 'destructive'}
                  >
                    {health.main_healthy ? t('Healthy') : t('Unavailable')}
                  </Badge>
                </dd>
                <dd className='text-muted-foreground text-xs'>
                  {health.main_engine}
                </dd>
              </div>
              <div
                role='group'
                aria-label={t('Log database')}
                className='space-y-2 rounded-md border p-3'
              >
                <dt className='text-muted-foreground text-xs'>
                  {t('Log database')}
                </dt>
                <dd>
                  <Badge
                    variant={health.log_healthy ? 'outline' : 'destructive'}
                  >
                    {health.log_healthy ? t('Healthy') : t('Unavailable')}
                  </Badge>
                </dd>
                <dd className='text-muted-foreground text-xs'>
                  {health.log_engine}
                </dd>
              </div>
              <div
                role='group'
                aria-label={t('Audit pending delivery')}
                className='space-y-2 rounded-md border p-3'
              >
                <dt className='text-muted-foreground text-xs'>
                  {t('Audit pending delivery')}
                </dt>
                <dd className='font-mono text-lg'>
                  {health.recovery_healthy
                    ? formatNumber(health.audit_pending, locale)
                    : t('Unknown')}
                </dd>
              </div>
              <div
                role='group'
                aria-label={t('Audit needs review')}
                className='space-y-2 rounded-md border p-3'
              >
                <dt className='text-muted-foreground text-xs'>
                  {t('Audit needs review')}
                </dt>
                <dd className='font-mono text-lg'>
                  {health.recovery_healthy
                    ? formatNumber(health.audit_needs_review, locale)
                    : t('Unknown')}
                </dd>
              </div>
              <div
                role='group'
                aria-label={t('Audit write failures in this process')}
                className='space-y-2 rounded-md border p-3'
              >
                <dt className='text-muted-foreground text-xs'>
                  {t('Audit write failures in this process')}
                </dt>
                <dd className='font-mono text-lg'>
                  {formatNumber(health.audit_write_failures, locale)}
                </dd>
              </div>
            </dl>
            <p className='text-muted-foreground text-xs'>
              {health.independent_log
                ? t('Independent log database')
                : t('Shared main and log database')}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Audit delivery retries run automatically. Exhausted deliveries require operator review.'
              )}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Failure counters reset when this instance restarts. If the main database is unavailable, failed audit metadata cannot be retained.'
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
