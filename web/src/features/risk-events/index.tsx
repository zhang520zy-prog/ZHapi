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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { isAxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { hasPermission } from '@/lib/admin-permissions'
import dayjs from '@/lib/dayjs'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getRiskEvents,
  type RiskEvent,
  type RiskFilters,
  type RiskScope,
} from './api'
import { RiskDetailDialog } from './components/risk-detail-dialog'
import { riskStatusLabel } from './status'

const EMPTY_EVENTS: RiskEvent[] = []
export function RiskEvents() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const client = useQueryClient()
  const [scope, setScope] = useState<RiskScope>('all')
  const [revoked, setRevoked] = useState(false)
  const canRead =
    !!user &&
    user.role >= ROLE.ADMIN &&
    hasPermission(user, 'risk', 'read') &&
    !revoked
  const effectiveScope = canRead ? scope : 'self'
  const canReview = canRead && hasPermission(user, 'risk', 'review')
  const userID = user?.id
  const onAccessDenied = useCallback(() => {
    setRevoked(true)
    setScope('self')
    void client
      .cancelQueries({ queryKey: ['risk', userID, 'all'] })
      .then(() => client.removeQueries({ queryKey: ['risk', userID, 'all'] }))
  }, [client, userID])
  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Risk events')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {canRead && (
          <Tabs
            value={scope}
            onValueChange={(value) =>
              setScope(value === 'all' ? 'all' : 'self')
            }
          >
            <TabsList aria-label={t('View scope')}>
              <TabsTrigger value='all'>{t('All')}</TabsTrigger>
              <TabsTrigger value='self'>{t('Only Mine')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'A blocked request is a risk signal, not a confirmed violation. Normal requests do not wait for manual review.'
            )}
          </p>
          {revoked && (
            <p role='status'>
              {t('Risk access changed. Showing only your records.')}
            </p>
          )}
          <RiskEventViewer
            key={`${String(userID)}:${effectiveScope}`}
            scope={effectiveScope}
            canReview={canReview}
            onAccessDenied={onAccessDenied}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
function RiskEventViewer(props: {
  scope: RiskScope
  canReview: boolean
  onAccessDenied: () => void
}) {
  const { t } = useTranslation()
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [filters, setFilters] = useState<RiskFilters>({ p: 1, page_size: 20 })
  const [requestID, setRequestID] = useState('')
  const query = useQuery({
    queryKey: ['risk', userID, props.scope, 'list', filters],
    queryFn: () => getRiskEvents(props.scope, filters),
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
  const columns = useMemo<ColumnDef<RiskEvent>[]>(() => {
    const result: ColumnDef<RiskEvent>[] = [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) =>
          dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm:ss'),
      },
      { accessorKey: 'model', header: t('Model') },
      {
        accessorKey: 'review_status',
        header: t('Status'),
        cell: ({ row }) => riskStatusLabel(row.original.review_status, t),
      },
      { accessorKey: 'request_id', header: t('Request ID') },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <RiskDetailDialog
            event={row.original}
            scope={props.scope}
            canReview={props.canReview}
            onAccessDenied={onAccessDenied}
          />
        ),
      },
    ]
    if (props.scope === 'all') {
      result.splice(1, 0, { accessorKey: 'user_id', header: t('User ID') })
    }
    return result
  }, [props.scope, props.canReview, onAccessDenied, t])
  const { table } = useDataTable({
    columns,
    data: query.isError ? EMPTY_EVENTS : (query.data?.items ?? EMPTY_EVENTS),
    totalCount: query.isError ? 0 : (query.data?.total ?? 0),
    getRowId: (row) => row.event_id,
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater) => {
      if (query.isFetching || query.isError) return
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
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isPending}
      isFetching={query.isFetching}
      emptyTitle={
        query.isError ? t('Failed to load risk events') : t('No risk events')
      }
      className='min-h-0 flex-1'
      paginationInFooter
      toolbar={
        <div className='space-y-3'>
          <form
            className='flex flex-wrap gap-2'
            onSubmit={(e) => {
              e.preventDefault()
              setFilters((previous) => ({
                ...previous,
                p: 1,
                request_id: requestID.trim() || undefined,
              }))
            }}
          >
            <Input
              aria-label={t('Request ID')}
              value={requestID}
              onChange={(e) => setRequestID(e.target.value)}
              maxLength={64}
              placeholder={t('Request ID')}
              className='w-64'
            />
            <Select
              items={[
                { value: 'all', label: t('All') },
                ...['pending', 'confirmed', 'false_positive'].map((status) => ({
                  value: status,
                  label: riskStatusLabel(status, t),
                })),
              ]}
              value={filters.status ?? 'all'}
              onValueChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  p: 1,
                  status: value && value !== 'all' ? String(value) : undefined,
                }))
              }
            >
              <SelectTrigger aria-label={t('Review status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All')}</SelectItem>
                {['pending', 'confirmed', 'false_positive'].map((status) => (
                  <SelectItem key={status} value={status}>
                    {riskStatusLabel(status, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type='submit' variant='outline' disabled={query.isFetching}>
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
            <Alert variant='destructive'>
              <AlertDescription className='flex items-center justify-between gap-2'>
                <span>{t('Failed to load risk events')}</span>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void query.refetch()}
                >
                  {t('Retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      }
    />
  )
}
