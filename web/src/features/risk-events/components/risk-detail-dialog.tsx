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
import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import { useAuthStore } from '@/stores/auth-store'

import { getRiskDetail, type RiskEvent, type RiskScope } from '../api'
import {
  appealStatusLabel,
  latestAppealStatus,
  riskActionText,
  riskLevelLabel,
  riskStageLabel,
  riskStatusLabel,
} from '../status'
import { RiskActionForm } from './risk-action-form'
import { RiskUserStateSection } from './risk-user-state-section'

export function RiskDetailDialog(props: {
  event: Pick<RiskEvent, 'event_id'>
  scope: RiskScope
  canReview: boolean
  onAccessDenied: () => void
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = props.open ?? internalOpen
  const setOpen = props.onOpenChange ?? setInternalOpen
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('Risk event details')}
      description={t(
        'A blocked request is a risk signal, not a confirmed violation. Normal requests do not wait for manual review.'
      )}
      trigger={
        props.trigger ?? (
          <Button size='sm' variant='ghost'>
            {t('Details')}
          </Button>
        )
      }
    >
      {open && <RiskDetailContent {...props} />}
    </Dialog>
  )
}

function RiskDetailContent(props: {
  event: Pick<RiskEvent, 'event_id'>
  scope: RiskScope
  canReview: boolean
  onAccessDenied: () => void
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const query = useQuery({
    queryKey: ['risk', userId, props.scope, 'detail', props.event.event_id],
    queryFn: () => getRiskDetail(props.scope, props.event.event_id),
    retry: false,
  })
  const denied =
    props.scope === 'all' &&
    isAxiosError(query.error) &&
    query.error.response?.status === 403
  const onAccessDenied = props.onAccessDenied
  useEffect(() => {
    if (denied) onAccessDenied()
  }, [denied, onAccessDenied])
  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        title={t('Failed to load risk events')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  const detail = query.data
  const event = detail.event
  const pendingAppeals = new Set(
    detail.appeals.filter((appeal) => appeal.status === 'pending')
  )
  const appealSummary = latestAppealStatus(detail.appeals)
  return (
    <div className='space-y-5 text-sm'>
      <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-all'>
        <dt>{t('Appeal status')}</dt>
        <dd>{appealStatusLabel(appealSummary, t)}</dd>
        <dt>{t('Status')}</dt>
        <dd>{riskStatusLabel(event.review_status, t)}</dd>
        <dt>{t('Category')}</dt>
        <dd>{event.category_name || event.category}</dd>
        <dt>{t('Disposition')}</dt>
        <dd>
          {riskActionText(
            event.action,
            event.restriction_until,
            event.created_at,
            t
          )}
        </dd>
        <dt>{t('Level')}</dt>
        <dd>{riskLevelLabel(event.level, t)}</dd>
        {props.scope === 'all' && (
          <>
            <dt>{t('Stage')}</dt>
            <dd>{riskStageLabel(event.stage, t)}</dd>
          </>
        )}
        {!!event.restriction_until && (
          <>
            <dt>{t('Restriction expires')}</dt>
            <dd>
              {dayjs
                .unix(event.restriction_until)
                .format('YYYY-MM-DD HH:mm:ss')}
            </dd>
          </>
        )}
        <dt>{t('Model')}</dt>
        <dd>{event.model}</dd>
        <dt>{t('Request ID')}</dt>
        <dd className='flex items-center gap-2'>
          {event.request_id}
          <CopyButton value={event.request_id} />
        </dd>
        <dt>{t('Event ID')}</dt>
        <dd>{event.event_id}</dd>
        <dt>{t('Time')}</dt>
        <dd>{dayjs.unix(event.created_at).format('YYYY-MM-DD HH:mm:ss')}</dd>
        {event.user_id !== undefined && (
          <>
            <dt>{t('User ID')}</dt>
            <dd>{event.user_id}</dd>
          </>
        )}
        {event.rule_version && (
          <>
            <dt>{t('Rule version')}</dt>
            <dd className='font-mono text-xs'>{event.rule_version}</dd>
          </>
        )}
      </dl>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Conversation bodies, matched words and API keys are not retained in this ledger.'
        )}
      </p>
      {props.scope === 'all' && event.user_id !== undefined && (
        <RiskUserStateSection
          userId={event.user_id}
          canReview={props.canReview}
        />
      )}
      {props.scope === 'all' && props.canReview && (
        <RiskActionForm event={event} mode='review' />
      )}
      <section className='space-y-3' aria-label={t('Appeals')}>
        <h3 className='font-medium'>{t('Appeals')}</h3>
        {!detail.appeals.length && (
          <p className='text-muted-foreground'>{t('No appeals')}</p>
        )}
        {detail.appeals.map((appeal) => (
          <article key={appeal.id} className='space-y-2 rounded-md border p-3'>
            <p className='break-words whitespace-pre-wrap'>{appeal.reason}</p>
            <p className='text-muted-foreground text-xs'>
              {dayjs.unix(appeal.created_at).format('YYYY-MM-DD HH:mm:ss')} ·{' '}
              {riskStatusLabel(appeal.status, t)}
              {appeal.outcome && ` · ${riskStatusLabel(appeal.outcome, t)}`}
            </p>
            {props.canReview &&
              props.scope === 'all' &&
              pendingAppeals.has(appeal) && (
                <RiskActionForm event={event} mode='review' appeal={appeal} />
              )}
          </article>
        ))}
      </section>
      {!!detail.changes?.length && (
        <section aria-label={t('Review history')} className='space-y-3'>
          <h3 className='font-medium'>{t('Review history')}</h3>
          {detail.changes.map((change) => (
            <div key={change.id} className='border-l-2 pl-3'>
              <p>
                {riskStatusLabel(change.status, t)} ·{' '}
                {dayjs.unix(change.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </p>
              <p className='text-muted-foreground break-words whitespace-pre-wrap'>
                {change.reason}
              </p>
            </div>
          ))}
        </section>
      )}
      {props.scope === 'self' &&
        (appealSummary === 'pending' ? (
          <p role='status' className='text-muted-foreground'>
            {t('Your appeal is already being processed.')}
          </p>
        ) : (
          <RiskActionForm event={event} mode='appeal' />
        ))}
      <Button
        variant='outline'
        onClick={() => void query.refetch()}
        disabled={query.isFetching}
      >
        {t('Refresh')}
      </Button>
    </div>
  )
}
