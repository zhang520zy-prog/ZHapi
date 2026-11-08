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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'

import {
  getReferralInvitees,
  getReferralRecords,
  getReferralSettlements,
  type CommissionRecord,
  type CommissionSettlement,
  type InviteeRow,
} from '../api'

const EMPTY: never[] = []
const PAGE_SIZE = 10

const RECORD_STATUS_LABELS: Record<string, string> = {
  frozen: 'Frozen',
  settled: 'Settled',
  reversed: 'Reversed',
  due: 'Due',
}

function quotaCell(v: number) {
  return <span className='font-mono'>{formatQuotaWithCurrency(v)}</span>
}

function usePagedQuery<T>(key: unknown[], fetcher: (p: { p: number; page_size: number }) => Promise<T>) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: [...key, page],
    queryFn: () => fetcher({ p: page, page_size: PAGE_SIZE }),
  })
  return { page, setPage, query }
}

function usePageTable<TData>(columns: ColumnDef<TData>[], data: TData[], total: number, page: number, setPage: (p: number) => void) {
  return useDataTable({
    columns,
    data,
    totalCount: total,
    pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    onPaginationChange: (u) => {
      const n = typeof u === 'function' ? u({ pageIndex: page - 1, pageSize: PAGE_SIZE }) : u
      setPage(n.pageIndex + 1)
    },
    manualPagination: true,
    enableSorting: false,
  })
}

function recordColumns(t: (k: string) => string): ColumnDef<CommissionRecord>[] {
  return [
    {
      accessorKey: 'created_at',
      header: t('Time'),
      cell: ({ row }) => dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm'),
    },
    { accessorKey: 'invitee', header: t('Source') },
    {
      accessorKey: 'paid_money',
      header: t('Actual paid'),
      cell: ({ row }) =>
        row.original.paid_money > 0
          ? `${row.original.currency} ${row.original.paid_money.toFixed(2)}`
          : '—',
    },
    {
      accessorKey: 'base_quota',
      header: t('Commission base'),
      cell: ({ row }) => quotaCell(row.original.base_quota),
    },
    {
      accessorKey: 'commission_quota',
      header: t('Commission'),
      cell: ({ row }) => quotaCell(row.original.commission_quota),
    },
    {
      accessorKey: 'display_status',
      header: t('Status'),
      cell: ({ row }) => (
        <Badge variant='outline'>
          {t(RECORD_STATUS_LABELS[row.original.display_status ?? row.original.status] ?? row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'available_at',
      header: t('Unlock date'),
      cell: ({ row }) =>
        row.original.available_at > 0
          ? dayjs.unix(row.original.available_at).format('YYYY-MM-DD')
          : '—',
    },
  ]
}

export function RecordsTable() {
  const { t } = useTranslation()
  const { page, setPage, query } = usePagedQuery(['referral', 'records'], getReferralRecords)
  const columns = useMemo(() => recordColumns(t), [t])
  const { table } = usePageTable(columns, query.data?.items ?? EMPTY, query.data?.total ?? 0, page, setPage)
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isPending}
      emptyTitle={t('No commission records')}
      paginationInFooter
    />
  )
}

function settlementColumns(t: (k: string) => string): ColumnDef<CommissionSettlement>[] {
  return [
    {
      accessorKey: 'created_at',
      header: t('Time'),
      cell: ({ row }) => dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm'),
    },
    { accessorKey: 'trigger', header: t('Type') },
    {
      accessorKey: 'credited_quota',
      header: t('Amount'),
      cell: ({ row }) => quotaCell(row.original.credited_quota),
    },
    {
      accessorKey: 'balance_after',
      header: t('Balance after'),
      cell: ({ row }) => quotaCell(row.original.balance_after),
    },
    {
      accessorKey: 'debt_added_quota',
      header: t('Debt added'),
      cell: ({ row }) => quotaCell(row.original.debt_added_quota),
    },
    { accessorKey: 'note', header: t('Note') },
  ]
}

export function SettlementsTable() {
  const { t } = useTranslation()
  const { page, setPage, query } = usePagedQuery(['referral', 'settlements'], getReferralSettlements)
  const columns = useMemo(() => settlementColumns(t), [t])
  const { table } = usePageTable(columns, query.data?.items ?? EMPTY, query.data?.total ?? 0, page, setPage)
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isPending}
      emptyTitle={t('No settlements')}
      paginationInFooter
    />
  )
}

export function InviteesTable() {
  const { t } = useTranslation()
  const { page, setPage, query } = usePagedQuery(['referral', 'invitees'], getReferralInvitees)
  const columns = useMemo<ColumnDef<InviteeRow>[]>(
    () => [
      { accessorKey: 'username', header: t('Username') },
      {
        accessorKey: 'created_at',
        header: t('Registered'),
        cell: ({ row }) => dayjs.unix(row.original.created_at).format('YYYY-MM-DD'),
      },
      {
        accessorKey: 'topup_quota',
        header: t('Total top-up'),
        cell: ({ row }) => quotaCell(row.original.topup_quota),
      },
    ],
    [t]
  )
  const { table } = usePageTable(columns, query.data?.items ?? EMPTY, query.data?.total ?? 0, page, setPage)
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isPending}
      emptyTitle={t('No invitees yet')}
      paginationInFooter
    />
  )
}
