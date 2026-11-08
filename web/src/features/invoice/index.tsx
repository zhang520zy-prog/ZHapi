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
import { FileText, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dayjs from '@/lib/dayjs'

import { getInvoiceOptions, listMyInvoices, type InvoiceRequest } from './api'
import { ApplyInvoiceDialog } from './components/apply-dialog'

const PAGE_SIZE = 10

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  pending: 'Pending issuance',
  processing: 'Processing',
  issued: 'Issued',
  rejected: 'Rejected',
}

const STATUS_VARIANTS: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  awaiting_payment: 'outline',
  pending: 'secondary',
  processing: 'outline',
  issued: 'default',
  rejected: 'destructive',
}

const TYPE_LABELS: Record<string, string> = {
  normal_fast: 'Standard (same-day)',
  normal: 'Standard',
  vat: 'VAT special',
}

export function InvoicePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [applyOpen, setApplyOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const options = useQuery({
    queryKey: ['invoices', 'options'],
    queryFn: getInvoiceOptions,
  })
  const list = useQuery({
    queryKey: ['invoices', 'list', status, page],
    queryFn: () =>
      listMyInvoices({ p: page, page_size: PAGE_SIZE, status: status || undefined }),
  })

  const columns = useMemo<ColumnDef<InvoiceRequest>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Applied at'),
        cell: ({ row }) =>
          dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm'),
      },
      { accessorKey: 'buyer_name', header: t('Buyer name') },
      {
        accessorKey: 'amount_cny',
        header: t('Amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>¥{row.original.amount_cny}</span>
        ),
      },
      {
        accessorKey: 'invoice_type',
        header: t('Type'),
        cell: ({ row }) =>
          t(TYPE_LABELS[row.original.invoice_type] ?? row.original.invoice_type),
      },
      {
        accessorKey: 'fee_cny',
        header: t('Service fee'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            ¥{row.original.fee_cny} ({(row.original.fee_rate_bps / 100).toFixed(0)}%)
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'outline'}>
            {t(STATUS_LABELS[row.original.status] ?? row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: 'file_url',
        header: t('Invoice file'),
        cell: ({ row }) => {
          const inv = row.original
          if (inv.file_url) {
            return (
              <a
                href={inv.file_url}
                target='_blank'
                rel='noreferrer'
                className='text-primary underline-offset-2 hover:underline'
              >
                {t('Download')}
              </a>
            )
          }
          if (inv.status === 'rejected' && inv.review_note) {
            return (
              <span className='text-muted-foreground text-xs'>
                {inv.review_note}
              </span>
            )
          }
          return '—'
        },
      },
    ],
    [t]
  )

  const items = list.data?.items ?? []
  const { table } = useDataTable({
    columns,
    data: items,
    totalCount: list.data?.total ?? 0,
    pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    onPaginationChange: (u) => {
      const n =
        typeof u === 'function'
          ? u({ pageIndex: page - 1, pageSize: PAGE_SIZE })
          : u
      setPage(n.pageIndex + 1)
    },
    manualPagination: true,
    enableSorting: false,
  })

  const enabled = options.data?.enabled !== false

  return (
    <>
      <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Apply for invoice')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
          }
        >
          {t('Refresh')}
        </Button>
        {enabled ? (
          <Button
            size='sm'
            disabled={options.isLoading}
            onClick={() => {
              if (!options.data) {
                toast.error(t('Failed to load invoice options'))
                return
              }
              setApplyOpen(true)
            }}
          >
            <Plus aria-hidden='true' className='size-4' />
            {t('Apply for invoice')}
          </Button>
        ) : null}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <p className='text-muted-foreground mb-4 text-sm'>
          {t(
            'A service fee (invoice amount × rate) is deducted from your balance on submission; once issued, the invoice can be downloaded here and is sent to your email.'
          )}
        </p>
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value=''>{t('All')}</TabsTrigger>
            <TabsTrigger value='pending'>{t('Pending issuance')}</TabsTrigger>
            <TabsTrigger value='processing'>{t('Processing')}</TabsTrigger>
            <TabsTrigger value='issued'>{t('Issued')}</TabsTrigger>
            <TabsTrigger value='rejected'>{t('Rejected')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Card className='mt-4'>
          <CardContent className='p-3 sm:p-4'>
            {!list.isLoading && items.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t('No invoice requests yet')}
                description={t(
                  'Click "Apply for invoice" to submit your first request.'
                )}
              />
            ) : (
              <DataTablePage
                table={table}
                columns={columns}
                isLoading={list.isLoading}
                paginationInFooter
              />
            )}
          </CardContent>
        </Card>
      </SectionPageLayout.Content>
      </SectionPageLayout>
      {options.data ? (
        <ApplyInvoiceDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          options={options.data}
        />
      ) : null}
    </>
  )
}
