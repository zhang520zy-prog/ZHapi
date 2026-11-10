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
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import { RISK_RESTRICTED_EVENT } from '@/lib/risk-restricted'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { getRiskSelfState, riskStateQueryKey, type RiskSelfState } from '../api'
import { RiskDetailDialog } from './risk-detail-dialog'

export function RiskRestrictionBanner() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: riskStateQueryKey(userId),
    queryFn: getRiskSelfState,
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const state = q.state.data
      return state && state.restricted_until * 1000 > Date.now()
        ? 60_000
        : 5 * 60_000
    },
  })
  useEffect(() => {
    const onRestricted = () =>
      void client.invalidateQueries({ queryKey: riskStateQueryKey(userId) })
    window.addEventListener(RISK_RESTRICTED_EVENT, onRestricted)
    return () => window.removeEventListener(RISK_RESTRICTED_EVENT, onRestricted)
  }, [client, userId])

  const state = query.data
  if (!state) return null
  if (state.disabled) return <DisabledBanner state={state} />
  if (state.restricted_until * 1000 <= Date.now()) return null
  return <RestrictedBanner state={state} refetch={query.refetch} />
}

function BannerShell(props: { title: string; children: ReactNode }) {
  return (
    <Alert
      role='status'
      variant='destructive'
      className='border-destructive/40 bg-destructive/10'
    >
      <ShieldAlert aria-hidden='true' />
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4'>
        {props.children}
      </AlertDescription>
    </Alert>
  )
}

function BannerActions(props: { state: RiskSelfState }) {
  const { t } = useTranslation()
  return (
    <span className='flex w-full flex-col gap-2 sm:w-auto sm:flex-row'>
      <Link
        to='/risk-events'
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'w-full sm:w-auto'
        )}
      >
        {t('View risk events')}
      </Link>
      {props.state.event_id && (
        <RiskDetailDialog
          event={{ event_id: props.state.event_id }}
          scope='self'
          canReview={false}
          onAccessDenied={() => {}}
          trigger={
            <Button size='sm' className='w-full sm:w-auto'>
              {t('Submit appeal')}
            </Button>
          }
        />
      )}
    </span>
  )
}

function DisabledBanner(props: { state: RiskSelfState }) {
  const { t } = useTranslation()
  return (
    <BannerShell title={t('Account disabled')}>
      <span>
        {t(
          'API access is disabled for this account. You can view the risk events or submit an appeal.'
        )}
      </span>
      {props.state.category_name && (
        <span>
          {t('Reason: {{category}}', {
            category: props.state.category_name,
          })}
        </span>
      )}
      <BannerActions state={props.state} />
    </BannerShell>
  )
}

function RestrictedBanner(props: {
  state: RiskSelfState
  refetch: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const remainingMs = props.state.restricted_until * 1000 - now
  const expired = remainingMs <= 0
  const refetch = props.refetch
  useEffect(() => {
    if (expired) void refetch()
  }, [expired, refetch])
  if (expired) return null

  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const countdown = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))

  return (
    <BannerShell title={t('Account API access is restricted')}>
      {props.state.category_name && (
        <span>
          {t('Reason: {{category}}', {
            category: props.state.category_name,
          })}
        </span>
      )}
      <span>
        {t('Expected release at {{time}}', {
          time: dayjs
            .unix(props.state.restricted_until)
            .format('YYYY-MM-DD HH:mm:ss'),
        })}
      </span>
      <span aria-hidden='true' className='font-mono tabular-nums'>
        {t('Remaining')} {countdown}
      </span>
      <span className='sr-only'>
        {t('Restriction lifts in about {{count}} minutes', {
          count: remainingMinutes,
        })}
      </span>
      <BannerActions state={props.state} />
    </BannerShell>
  )
}
