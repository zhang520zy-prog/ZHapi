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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import { formatNumber } from '@/lib/format'

import { getPaymentEventDetail, type PaymentEvent } from '../api'
import { FinancialReviewDialog } from './financial-review-dialog'

export function PaymentHistoryDialog(props: {
  event: PaymentEvent
  userID: number
  canReview: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('Payment history')}
      trigger={
        <Button size='sm' variant='ghost'>
          {t('Details')}
        </Button>
      }
    >
      {open && (
        <PaymentHistory
          event={props.event}
          userID={props.userID}
          canReview={props.canReview}
        />
      )}
    </Dialog>
  )
}
function PaymentHistory(props: {
  event: PaymentEvent
  userID: number
  canReview: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['payment-events', props.userID, 'detail', props.event.id, page],
    queryFn: () => getPaymentEventDetail(props.event.id, page),
    retry: false,
  })
  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        title={t('Payment history unavailable')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  const detail = query.data
  return (
    <div className='space-y-4 text-sm'>
      <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-all'>
        <dt>{t('Order number')}</dt>
        <dd>{detail.event.trade_no || detail.receipt?.trade_no || '—'}</dd>
        <dt>{t('Event ID')}</dt>
        <dd>{detail.event.event_id}</dd>
        <dt>{t('Provider event type')}</dt>
        <dd>{detail.event.event_type}</dd>
        <dt>{t('Payment reference')}</dt>
        <dd>{detail.event.payment_intent || '—'}</dd>
        <dt>{t('Paid amount in minor units')}</dt>
        <dd>
          {detail.event.paid_minor === undefined
            ? '—'
            : formatNumber(detail.event.paid_minor, locale)}{' '}
          {detail.event.currency}
        </dd>
      </dl>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Amounts use the payment currency minor unit. Raw webhook bodies and credentials are not retained.'
        )}
      </p>
      {detail.receipt && (
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-all'>
          <dt>{t('Original credited quota')}</dt>
          <dd>{formatNumber(detail.receipt.credited_quota, locale)}</dd>
          <dt>{t('Refunded amount in minor units')}</dt>
          <dd>
            {formatNumber(detail.receipt.refunded_minor, locale)}{' '}
            {detail.receipt.currency}
          </dd>
          <dt>{t('Recovered quota')}</dt>
          <dd>{formatNumber(detail.receipt.reversed_quota, locale)}</dd>
          <dt>{t('Waived recovery quota')}</dt>
          <dd>{formatNumber(detail.receipt.waived_quota, locale)}</dd>
        </dl>
      )}
      {props.canReview &&
        detail.receipt &&
        detail.event.status === 'needs_review' &&
        (detail.event.event_type === 'charge.refunded' ||
          (detail.event.event_type === 'charge.dispute.closed' &&
            detail.event.dispute_status === 'lost')) && (
          <FinancialReviewDialog
            event={detail.event}
            receipt={detail.receipt}
            userID={props.userID}
          />
        )}
      {!detail.history.items.length && <p>{t('No payment history')}</p>}
      {detail.history.items.map((action) => (
        <article key={action.id} className='space-y-2 rounded-md border p-3'>
          <p>
            {t('Attempt')} {formatNumber(action.attempt, locale)} ·{' '}
            {action.action} ·{' '}
            {dayjs.unix(action.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </p>
          {!!action.actor_id && (
            <p>
              {t('Operator')} {formatNumber(action.actor_id, locale)}
            </p>
          )}
          {action.reason && (
            <p className='break-words whitespace-pre-wrap'>{action.reason}</p>
          )}
          {action.error_code && (
            <p className='font-mono text-xs'>{action.error_code}</p>
          )}
        </article>
      ))}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          variant='outline'
          disabled={page * 20 >= detail.history.total || query.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('Next')}
        </Button>
        <Button
          variant='outline'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t('Refresh')}
        </Button>
      </div>
    </div>
  )
}
