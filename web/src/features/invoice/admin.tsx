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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasPermission } from '@/lib/admin-permissions'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  adminListInvoices,
  adminReviewInvoice,
  type InvoiceRequest,
} from './api'

const EMPTY: never[] = []
const ts = (v: number) => (v > 0 ? dayjs.unix(v).format('MM-DD HH:mm') : '—')

function InvoicesTab(props: { canReview: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoice-admin'] })
  const [inputs, setInputs] = useState<
    Record<number, { note: string; file: string }>
  >({})
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['invoice-admin', 'invoices', page],
    queryFn: () => adminListInvoices({ p: page, page_size: 20 }),
  })
  const review = useMutation({
    mutationFn: ({
      id,
      action,
      version,
    }: {
      id: number
      action: 'processing' | 'issued' | 'rejected'
      version: number
    }) =>
      adminReviewInvoice(id, {
        action,
        note: inputs[id]?.note || undefined,
        file_url: inputs[id]?.file || undefined,
        expected_version: version,
      }),
    onSuccess: () => {
      toast.success(t('Reviewed'))
      invalidate()
    },
    onError: (e) => handleServerError(e, t('Review failed')),
  })
  const setInput = (id: number, key: 'note' | 'file', value: string) =>
    setInputs((prev) => {
      const current = prev[id] ?? { note: '', file: '' }
      return { ...prev, [id]: { ...current, [key]: value } }
    })
  const columns = useMemo<ColumnDef<InvoiceRequest>[]>(
    () => [
      { accessorKey: 'id', header: 'ID' },
      { accessorKey: 'user_id', header: t('User') },
      { accessorKey: 'buyer_name', header: t('Buyer') },
      {
        accessorKey: 'amount_cny',
        header: t('Amount'),
        cell: ({ row }) => `¥${row.original.amount_cny}`,
      },
      {
        accessorKey: 'fee_cny',
        header: t('Fee'),
        cell: ({ row }) => `¥${row.original.fee_cny}`,
      },
      { accessorKey: 'item', header: t('Item') },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => (
          <Badge variant='outline'>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: 'created_at',
        header: t('Applied'),
        cell: ({ row }) => ts(row.original.created_at),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => {
          const inv = row.original
          if (inv.status !== 'pending' && inv.status !== 'processing') {
            return inv.file_url ? (
              <a
                href={inv.file_url}
                target='_blank'
                rel='noreferrer'
                className='text-primary text-sm hover:underline'
              >
                {t('File')}
              </a>
            ) : null
          }
          if (!props.canReview) return null
          return (
            <div className='flex min-w-72 flex-wrap items-center gap-1'>
              <Input
                className='w-32'
                placeholder={t('File URL (for issuing)')}
                value={inputs[inv.id]?.file ?? ''}
                onChange={(e) => setInput(inv.id, 'file', e.target.value)}
              />
              <Input
                className='w-32'
                placeholder={t('Note (required to reject)')}
                value={inputs[inv.id]?.note ?? ''}
                onChange={(e) => setInput(inv.id, 'note', e.target.value)}
              />
              {inv.status === 'pending' ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    review.mutate({
                      id: inv.id,
                      action: 'processing',
                      version: inv.version,
                    })
                  }
                >
                  {t('Start')}
                </Button>
              ) : null}
              <Button
                size='sm'
                disabled={!(inputs[inv.id]?.file ?? '')}
                onClick={() =>
                  review.mutate({
                    id: inv.id,
                    action: 'issued',
                    version: inv.version,
                  })
                }
              >
                {t('Issue')}
              </Button>
              <Button
                size='sm'
                variant='destructive'
                disabled={!(inputs[inv.id]?.note ?? '')}
                onClick={() =>
                  review.mutate({
                    id: inv.id,
                    action: 'rejected',
                    version: inv.version,
                  })
                }
              >
                {t('Reject')}
              </Button>
            </div>
          )
        },
      },
    ],
    [t, inputs, review, props.canReview]
  )
  const { table } = useDataTable({
    columns,
    data: query.data?.items ?? (EMPTY as InvoiceRequest[]),
    totalCount: query.data?.total ?? 0,
    pagination: { pageIndex: page - 1, pageSize: 20 },
    onPaginationChange: (u) => {
      const n =
        typeof u === 'function' ? u({ pageIndex: page - 1, pageSize: 20 }) : u
      setPage(n.pageIndex + 1)
    },
    manualPagination: true,
    enableSorting: false,
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isPending}
      emptyTitle={t('No invoice requests')}
      paginationInFooter
    />
  )
}

// 发票审核管理页：invoice.read 看列表，invoice.review 执行审核操作。
export function InvoiceAdmin() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  if (
    !user ||
    user.role < ROLE.ADMIN ||
    !hasPermission(user, 'invoice', 'read')
  ) {
    return <ErrorState title={t('Invoice permission required')} />
  }
  const canReview = hasPermission(user, 'invoice', 'review')
  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Invoice review')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Review invoice requests and issue invoices.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <InvoicesTab canReview={canReview} />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
