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
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useIsAdmin } from '@/hooks/use-admin'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useDebounce } from '@/hooks/use-debounce'
import { formatQuotaWithCurrency, formatServerMoney } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getBillingSelf } from '../api'
import {
  BILLING_KIND_LABELS,
  BILLING_KINDS,
  type BillingKindFilter,
  formatTimestamp,
  getBillingStatusConfig,
  getPaymentMethodName,
} from '../lib/billing'
import type { BillingEntry } from '../types'
import { AdminBillingView } from './admin-billing-view'

// Same chip styling as the pricing filter bar (N2).
const CHIP_BASE =
  'inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'
const CHIP_ACTIVE = 'bg-accent border-primary text-primary'
const CHIP_INACTIVE =
  'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'

function entryDescription(
  entry: BillingEntry,
  quotaText: (q: number) => string
) {
  if (entry.kind === 'topup' && entry.quota != null) {
    return quotaText(entry.quota)
  }
  return entry.title || '—'
}

export function BillingTab() {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const [adminMode, setAdminMode] = useState(false)

  return (
    <div className='space-y-3'>
      {isAdmin && (
        <div className='flex items-center justify-end gap-2'>
          <Label
            htmlFor='billing-all-users'
            className='text-muted-foreground text-xs'
          >
            {t('All users')}
          </Label>
          <Switch
            id='billing-all-users'
            checked={adminMode}
            onCheckedChange={(v) => setAdminMode(v === true)}
          />
        </div>
      )}
      {adminMode ? <AdminBillingView /> : <BillingSelfView />}
    </div>
  )
}

function BillingSelfView() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/_authenticated/wallet/' })
  const navigate = useNavigate({ from: '/wallet/' })

  const kind: BillingKindFilter = search.kind ?? 'all'
  const urlKeyword = search.keyword ?? ''
  const page = search.p ?? 1
  const [pageSize, setPageSize] = useState(10)

  const [draft, setDraft] = useState(urlKeyword)
  const debouncedDraft = useDebounce(draft)
  // URL is the source of truth; keep the input in sync when it changes
  // elsewhere (back/forward, deep links).
  useEffect(() => {
    setDraft(urlKeyword)
  }, [urlKeyword])
  useEffect(() => {
    if (debouncedDraft === urlKeyword) return
    void navigate({
      to: '/wallet',
      search: (prev) => ({
        ...prev,
        keyword: debouncedDraft || undefined,
        p: 1,
      }),
      replace: true,
    })
  }, [debouncedDraft, urlKeyword, navigate])

  const query = useQuery({
    queryKey: ['billing', 'self', kind, urlKeyword, page, pageSize],
    queryFn: async () =>
      requireServerSuccess(
        await getBillingSelf({
          p: page,
          pageSize,
          kind,
          keyword: urlKeyword,
        })
      ).data,
    placeholderData: (prev) => prev,
  })

  const entries = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const setKind = (value: BillingKindFilter) =>
    void navigate({
      to: '/wallet',
      search: (prev) => ({ ...prev, kind: value, p: 1 }),
    })
  const setPage = (value: number) =>
    void navigate({
      to: '/wallet',
      search: (prev) => ({ ...prev, p: value }),
    })

  const hasFilters = kind !== 'all' || urlKeyword !== ''
  const quotaText = (q: number) =>
    formatQuotaWithCurrency(q, { abbreviate: false })

  return (
    <div className='space-y-3'>
      {/* Kind chips */}
      <div className='flex flex-wrap items-center gap-2'>
        {BILLING_KINDS.map((value) => (
          <button
            key={value}
            type='button'
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              CHIP_BASE,
              kind === value ? CHIP_ACTIVE : CHIP_INACTIVE
            )}
          >
            <span className='truncate'>{t(BILLING_KIND_LABELS[value])}</span>
          </button>
        ))}
      </div>

      {/* Search + page size */}
      <div className='flex items-center gap-2'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('Search by order number...')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className='h-9 pl-10'
            aria-label={t('Search by order number')}
          />
        </div>
        <Select
          items={[
            { value: '10', label: t('10 / page') },
            { value: '20', label: t('20 / page') },
            { value: '50', label: t('50 / page') },
            { value: '100', label: t('100 / page') },
          ]}
          value={pageSize.toString()}
          onValueChange={(value) => {
            if (value === null) return
            setPageSize(Number.parseInt(value))
            setPage(1)
          }}
        >
          <SelectTrigger className='h-9 w-[92px] sm:w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='10'>{t('10 / page')}</SelectItem>
              <SelectItem value='20'>{t('20 / page')}</SelectItem>
              <SelectItem value='50'>{t('50 / page')}</SelectItem>
              <SelectItem value='100'>{t('100 / page')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <BillingSelfList
        entries={entries}
        loading={query.isPending}
        hasFilters={hasFilters}
        quotaText={quotaText}
      />

      {/* Pagination */}
      {!query.isPending && entries.length > 0 && (
        <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-muted-foreground text-xs sm:text-sm'>
            {t('Showing')} {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)} {t('of')} {total}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className='h-8 w-8 p-0'
              aria-label={t('Previous page')}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <div className='text-muted-foreground flex items-center gap-1 text-sm'>
              <span className='font-medium'>{page}</span>
              <span>/</span>
              <span>{totalPages}</span>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className='h-8 w-8 p-0'
              aria-label={t('Next page')}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function BillingSelfList(props: {
  entries: BillingEntry[]
  loading: boolean
  hasFilters: boolean
  quotaText: (q: number) => string
}) {
  const { t } = useTranslation()
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })

  if (props.loading) {
    return (
      <div className='space-y-3'>
        {['first', 'second', 'third', 'fourth', 'fifth'].map((key) => (
          <Skeleton key={key} className='h-16 w-full' />
        ))}
      </div>
    )
  }

  if (props.entries.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('No billing records')}
        description={
          props.hasFilters
            ? t('Try adjusting your filters')
            : t('Your transaction history will appear here')
        }
      />
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className='bg-card hidden overflow-x-auto rounded-[var(--rd-radius-card)] border md:block'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-muted-foreground border-b text-xs'>
              <th className='px-3 py-2.5 text-left font-medium'>{t('Time')}</th>
              <th className='px-3 py-2.5 text-left font-medium'>{t('Type')}</th>
              <th className='px-3 py-2.5 text-left font-medium'>
                {t('Description')}
              </th>
              <th className='px-3 py-2.5 text-left font-medium'>
                {t('Payment Method')}
              </th>
              <th className='px-3 py-2.5 text-right font-medium'>
                {t('Credited')}
              </th>
              <th className='px-3 py-2.5 text-right font-medium'>
                {t('Service fee')}
              </th>
              <th className='px-3 py-2.5 text-right font-medium'>
                {t('Total')}
              </th>
              <th className='px-3 py-2.5 text-right font-medium'>
                {t('Status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.entries.map((entry) => {
              const statusConfig = getBillingStatusConfig(entry.status)
              return (
                <tr
                  key={`${entry.kind}-${entry.trade_no}`}
                  className='border-b last:border-b-0'
                >
                  <td className='text-muted-foreground px-3 py-2.5 whitespace-nowrap'>
                    {formatTimestamp(entry.create_time)}
                  </td>
                  <td className='px-3 py-2.5'>
                    <StatusBadge
                      label={t(BILLING_KIND_LABELS[entry.kind])}
                      variant='neutral'
                      size='sm'
                      copyable={false}
                    />
                  </td>
                  <td className='text-muted-foreground max-w-40 truncate px-3 py-2.5'>
                    {entryDescription(entry, props.quotaText)}
                  </td>
                  <td className='px-3 py-2.5 whitespace-nowrap'>
                    {getPaymentMethodName(entry.payment_method, t)}
                  </td>
                  <td className='px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums'>
                    {formatServerMoney(entry.credited_money, entry.currency)}
                  </td>
                  <td
                    className='px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums'
                    title={
                      entry.fee_money == null
                        ? t(
                            'Orders before the upgrade did not record a service fee'
                          )
                        : undefined
                    }
                  >
                    {entry.fee_money == null
                      ? '—'
                      : formatServerMoney(entry.fee_money, entry.currency)}
                  </td>
                  <td className='px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap tabular-nums'>
                    {formatServerMoney(entry.total_money, entry.currency)}
                  </td>
                  <td className='px-3 py-2.5 text-right'>
                    <StatusBadge
                      label={t(statusConfig.label)}
                      variant={statusConfig.variant}
                      size='sm'
                      showDot
                      copyable={false}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className='space-y-3 md:hidden'>
        {props.entries.map((entry) => {
          const statusConfig = getBillingStatusConfig(entry.status)
          return (
            <div
              key={`${entry.kind}-${entry.trade_no}`}
              className='bg-card space-y-2 rounded-[var(--rd-radius-card)] border p-3'
            >
              <div className='flex items-center justify-between gap-2'>
                <StatusBadge
                  label={t(BILLING_KIND_LABELS[entry.kind])}
                  variant='neutral'
                  size='sm'
                  copyable={false}
                />
                <StatusBadge
                  label={t(statusConfig.label)}
                  variant={statusConfig.variant}
                  size='sm'
                  showDot
                  copyable={false}
                />
              </div>
              <div className='font-mono text-lg font-semibold tabular-nums'>
                {formatServerMoney(entry.total_money, entry.currency)}
              </div>
              <div className='text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs'>
                <span className='shrink-0'>
                  {formatTimestamp(entry.create_time)}
                </span>
                <span className='text-muted-foreground/40'>·</span>
                <code className='truncate font-mono'>{entry.trade_no}</code>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-5 w-5 shrink-0 p-0'
                  aria-label={t('Copy order number')}
                  onClick={() => copyToClipboard(entry.trade_no)}
                >
                  {copiedText === entry.trade_no ? (
                    <Check className='h-3 w-3' />
                  ) : (
                    <Copy className='h-3 w-3' />
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
