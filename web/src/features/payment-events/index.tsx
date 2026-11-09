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
import type { ColumnDef } from '@tanstack/react-table'
import { isAxiosError } from 'axios'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { hasPermission } from '@/lib/admin-permissions'
import dayjs from '@/lib/dayjs'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { getPaymentEvents, type PaymentEvent } from './api'
import { PaymentHistoryDialog } from './components/history-dialog'
import { RetryPaymentDialog } from './components/retry-dialog'

const EMPTY_EVENTS: PaymentEvent[] = []
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  retry: 'Awaiting retry',
  needs_review: 'Needs financial review',
  succeeded: 'Processed',
  resolved: 'Financially reviewed',
}
export function PaymentEvents() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  if (
    !user ||
    user.role < ROLE.ADMIN ||
    !hasPermission(user, 'payment', 'read')
  ) {
    return <ErrorState title={t('Payment permission required')} />
  }
  return (
    <PaymentEventList
      userID={user.id}
      canOperate={hasPermission(user, 'payment', 'operate')}
      canReview={hasPermission(user, 'payment', 'review')}
    />
  )
}
function PaymentEventList(props: {
  userID: number
  canOperate: boolean
  canReview: boolean
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<{
    p: number
    page_size: number
    status?: string
    trade_no?: string
  }>({ p: 1, page_size: 20 })
  const [tradeNo, setTradeNo] = useState('')
  const query = useQuery({
    queryKey: ['payment-events', props.userID, filters],
    queryFn: () => getPaymentEvents(filters),
    retry: false,
  })
  const columns = useMemo<ColumnDef<PaymentEvent>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) =>
          dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm:ss'),
      },
      {
        accessorKey: 'trade_no',
        header: t('Order number'),
        cell: ({ row }) =>
          row.original.trade_no || row.original.related_trade_no || '—',
      },
      { accessorKey: 'provider', header: t('Payment provider') },
      { accessorKey: 'event_id', header: t('Event ID') },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) =>
          t(STATUS_LABELS[row.original.status] ?? row.original.status),
      },
      { accessorKey: 'attempts', header: t('Attempts') },
      { accessorKey: 'last_error_code', header: t('Error code') },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-2'>
            <PaymentHistoryDialog
              event={row.original}
              userID={props.userID}
              canReview={props.canReview}
            />
            {props.canOperate &&
              ['pending', 'retry', 'needs_review'].includes(
                row.original.status
              ) && (
                <RetryPaymentDialog
                  event={row.original}
                  userID={props.userID}
                />
              )}
          </div>
        ),
      },
    ],
    [props.canOperate, props.canReview, props.userID, t]
  )
  const { table } = useDataTable({
    columns,
    data: query.isError ? EMPTY_EVENTS : (query.data?.items ?? EMPTY_EVENTS),
    totalCount: query.isError ? 0 : (query.data?.total ?? 0),
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    getRowId: (row) => String(row.id),
    manualPagination: true,
    enableSorting: false,
    enableRowSelection: false,
    onPaginationChange: (updater) => {
      setFilters((previous) => {
        const old = { pageIndex: previous.p - 1, pageSize: previous.page_size }
        const next = typeof updater === 'function' ? updater(old) : updater
        return {
          ...previous,
          p: next.pageSize === old.pageSize ? next.pageIndex + 1 : 1,
          page_size: next.pageSize,
        }
      })
    },
  })
  if (isAxiosError(query.error) && query.error.response?.status === 403) {
    return (
      <ErrorState
        title={t('Payment access changed. Refresh your account permissions.')}
      />
    )
  }
  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Payment exceptions')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Inspect payment gateway events, signatures and processing results.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Verified payments that need retry or financial review. Retry uses the original order and cannot change its amount.'
            )}
          </p>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            className='min-h-0 flex-1'
            paginationInFooter
            emptyTitle={
              query.isError
                ? t('Failed to load payment events')
                : t('No payment events')
            }
            toolbar={
              <div className='space-y-2'>
                <form
                  className='flex flex-wrap gap-2'
                  onSubmit={(event) => {
                    event.preventDefault()
                    setFilters((previous) => ({
                      ...previous,
                      p: 1,
                      trade_no: tradeNo.trim() || undefined,
                    }))
                  }}
                >
                  <Input
                    aria-label={t('Order number')}
                    placeholder={t('Order number')}
                    maxLength={255}
                    className='w-64'
                    value={tradeNo}
                    onChange={(event) => setTradeNo(event.target.value)}
                  />
                  <Select
                    items={[
                      { value: 'all', label: t('All') },
                      ...Object.entries(STATUS_LABELS).map(
                        ([value, label]) => ({
                          value,
                          label: t(label),
                        })
                      ),
                    ]}
                    value={filters.status ?? 'all'}
                    onValueChange={(value) =>
                      setFilters((previous) => ({
                        ...previous,
                        p: 1,
                        status:
                          value && value !== 'all' ? String(value) : undefined,
                      }))
                    }
                  >
                    <SelectTrigger aria-label={t('Status')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>{t('All')}</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {t(label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type='submit'
                    variant='outline'
                    disabled={query.isFetching}
                  >
                    {t('Search')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={query.isFetching}
                    onClick={() => void query.refetch()}
                  >
                    {t('Refresh')}
                  </Button>
                </form>
                {query.isError && (
                  <ErrorState
                    title={t('Failed to load payment events')}
                    onRetry={() => void query.refetch()}
                  />
                )}
              </div>
            }
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
