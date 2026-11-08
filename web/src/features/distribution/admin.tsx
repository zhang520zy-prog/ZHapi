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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  adminListInvoices,
  adminReviewInvoice,
  type InvoiceRequest,
} from '@/features/invoice/api'
import { hasPermission } from '@/lib/admin-permissions'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import { ROLE } from '@/lib/roles'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  adminBackfill,
  adminConfirmCommissions,
  adminListApplications,
  adminListCampaigns,
  adminListDebts,
  adminListProfiles,
  adminListRecords,
  adminListSettlements,
  adminListWithdrawals,
  adminMarkWithdrawalPaid,
  adminWaiveDebt,
  adminReverseRecord,
  adminReviewApplication,
  adminReviewWithdrawal,
  adminUpdateProfile,
  adminCreateCampaign,
  adminUpdateCampaign,
  adminCancelCampaign,
  adminSettleOutProfile,
  adminGetWithdrawal,
  type CommissionCampaign,
  type CommissionDebt,
  type CommissionRecord,
  type CommissionSettlement,
  type DistributorApplication,
  type DistributorProfile,
  type DistributorWithdrawal,
} from './api'

const EMPTY: never[] = []
const ts = (v: number) => (v > 0 ? dayjs.unix(v).format('MM-DD HH:mm') : '—')
const q = formatQuotaWithCurrency

function usePagedTable<T>(
  key: readonly unknown[],
  fetcher: (p: number) => Promise<{ items: T[]; total: number }>,
  columns: ColumnDef<T>[],
  emptyTitle: string
) {
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: [...key, page], queryFn: () => fetcher(page) })
  const { table } = useDataTable({
    columns,
    data: query.data?.items ?? (EMPTY as T[]),
    totalCount: query.data?.total ?? 0,
    pagination: { pageIndex: page - 1, pageSize: 20 },
    onPaginationChange: (u) => {
      const n = typeof u === 'function' ? u({ pageIndex: page - 1, pageSize: 20 }) : u
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
      emptyTitle={emptyTitle}
      paginationInFooter
    />
  )
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['distribution-admin'] })
}

function ApplicationsTab() {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [notes, setNotes] = useState<Record<number, string>>({})
  const review = useMutation({
    mutationFn: ({ id, action, version, note }: { id: number; action: string; version: number; note?: string }) =>
      adminReviewApplication(id, { action, note, expected_version: version }),
    onSuccess: () => {
      toast.success(t('Reviewed'))
      invalidate()
    },
    onError: (e) => handleServerError(e, t('Review failed')),
  })
  const rejectApp = useCallback(
    (id: number, version: number) => {
      const note = (notes[id] ?? '').trim()
      if (!note) {
        toast.error(t('A rejection note is required'))
        return
      }
      review.mutate({ id, action: 'reject', version, note })
    },
    [notes, review, t]
  )
  const columns = useMemo<ColumnDef<DistributorApplication>[]>(
    () => [
      { accessorKey: 'user_id', header: t('User') },
      { accessorKey: 'contact', header: t('Contact') },
      { accessorKey: 'channel_desc', header: t('Channel') },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => <Badge variant='outline'>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'created_at',
        header: t('Applied'),
        cell: ({ row }) => ts(row.original.created_at),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <div className='flex gap-1'>
              <Button
                size='sm'
                onClick={() =>
                  review.mutate({ id: row.original.id, action: 'approve', version: row.original.version })
                }
              >
                {t('Approve')}
              </Button>
              <Input
                className='w-36'
                placeholder={t('Rejection note')}
                value={notes[row.original.id] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [row.original.id]: e.target.value }))}
              />
              <Button
                size='sm'
                variant='outline'
                onClick={() => rejectApp(row.original.id, row.original.version)}
              >
                {t('Reject')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, review, notes, rejectApp]
  )
  return usePagedTable(
    ['distribution-admin', 'applications'],
    (p) => adminListApplications({ p, page_size: 20 }),
    columns,
    t('No applications')
  )
}

// ProfileEditDialog B1.10 前端语义：留空 = 保留现值；勾选"恢复默认" = 显式清空
// 个人配置（提交 null）；填写 = 覆盖。
function ProfileEditDialog(props: {
  profile: DistributorProfile | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [rate, setRate] = useState('')
  const [clearRate, setClearRate] = useState(false)
  const [hold, setHold] = useState('')
  const [clearHold, setClearHold] = useState(false)
  const [note, setNote] = useState('')
  const p = props.profile
  let rateBps: number | null | undefined
  if (clearRate) rateBps = null
  else if (rate) rateBps = Math.round(Number(rate) * 100)
  let holdDays: number | null | undefined
  if (clearHold) holdDays = null
  else if (hold) holdDays = Number(hold)
  const update = useMutation({
    mutationFn: () =>
      adminUpdateProfile(p?.user_id ?? 0, {
        rate_bps: rateBps,
        hold_days: holdDays,
        note: note || undefined,
        expected_version: p?.version ?? 0,
      }),
    onSuccess: () => {
      toast.success(t('Profile updated'))
      props.onOpenChange(false)
      props.onDone()
    },
    onError: (e) => handleServerError(e, t('Update failed')),
  })
  return (
    <Dialog open={p !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Edit distributor')} #{p?.user_id}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label>{t('Personal rate % (current: {{value}})', { value: p?.rate_bps ? (p.rate_bps / 100).toFixed(2) : t('Default') })}</Label>
            <div className='flex items-center gap-2'>
              <Input value={rate} disabled={clearRate} onChange={(e) => setRate(e.target.value)} />
              <label className='flex shrink-0 items-center gap-1.5 text-xs'>
                <Checkbox checked={clearRate} onCheckedChange={(v) => { setClearRate(v === true); if (v) setRate('') }} />
                {t('Default')}
              </label>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Personal hold days (current: {{value}})', { value: p?.hold_days ?? t('Default') })}</Label>
            <div className='flex items-center gap-2'>
              <Input value={hold} disabled={clearHold} onChange={(e) => setHold(e.target.value)} />
              <label className='flex shrink-0 items-center gap-1.5 text-xs'>
                <Checkbox checked={clearHold} onCheckedChange={(v) => { setClearHold(v === true); if (v) setHold('') }} />
                {t('Default')}
              </label>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Note')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>{t('Cancel')}</Button>
          <Button disabled={update.isPending} onClick={() => update.mutate()}>{t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// SettleOutDialog B1.7：suspended 分销商结清——冻结返现 confirm/reverse +
// 余额 transfer/payout；payout 需填币种金额凭证；理由必填。
function SettleOutDialog(props: {
  profile: DistributorProfile | null
  methods: string[]
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [frozen, setFrozen] = useState<'confirm' | 'reverse'>('confirm')
  const [balance, setBalance] = useState<'transfer' | 'payout'>('transfer')
  const [method, setMethod] = useState('alipay')
  const [currency, setCurrency] = useState('CNY')
  const [amount, setAmount] = useState('')
  const [payoutRef, setPayoutRef] = useState('')
  const [reason, setReason] = useState('')
  const p = props.profile
  const settle = useMutation({
    mutationFn: () =>
      adminSettleOutProfile(p?.user_id ?? 0, {
        frozen,
        balance,
        payout_method: balance === 'payout' ? method : undefined,
        payout_currency: balance === 'payout' ? currency : undefined,
        payout_amount: balance === 'payout' ? amount : undefined,
        payout_ref: balance === 'payout' ? payoutRef : undefined,
        reason,
      }),
    onSuccess: () => {
      toast.success(t('Settled out'))
      props.onOpenChange(false)
      props.onDone()
    },
    onError: (e) => handleServerError(e, t('Settle-out failed')),
  })
  const valid = reason.trim() !== '' &&
    (balance !== 'payout' || (method && currency && amount && payoutRef))
  return (
    <Dialog open={p !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Settle out distributor')} #{p?.user_id}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3 text-sm'>
          <div className='space-y-1.5'>
            <Label>{t('Frozen commissions')}</Label>
            <Select value={frozen} onValueChange={(v) => setFrozen((v as 'confirm' | 'reverse') ?? frozen)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='confirm'>{t('Settle (confirm)')}</SelectItem>
                <SelectItem value='reverse'>{t('Void (reverse)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Wallet balance')}</Label>
            <Select value={balance} onValueChange={(v) => setBalance((v as 'transfer' | 'payout') ?? balance)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='transfer'>{t('Transfer to account balance')}</SelectItem>
                <SelectItem value='payout'>{t('Offline payout')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {balance === 'payout' ? (
            <>
              <div className='grid grid-cols-2 gap-2'>
                <div className='space-y-1.5'>
                  <Label>{t('Method')}</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v ?? method)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {props.methods.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1.5'>
                  <Label>{t('Currency')}</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v ?? currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='CNY'>CNY</SelectItem>
                      <SelectItem value='USDT'>USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <div className='space-y-1.5'>
                  <Label>{t('Actual payout amount')}</Label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className='space-y-1.5'>
                  <Label>{t('Payment ref')}</Label>
                  <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} />
                </div>
              </div>
            </>
          ) : null}
          <div className='space-y-1.5'>
            <Label>{t('Reason (required)')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>{t('Cancel')}</Button>
          <Button variant='destructive' disabled={!valid || settle.isPending} onClick={() => settle.mutate()}>
            {t('Settle out')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfilesTab(props: { canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [editing, setEditing] = useState<DistributorProfile | null>(null)
  const [settling, setSettling] = useState<DistributorProfile | null>(null)
  const update = useMutation({
    mutationFn: ({ userId, status, version }: { userId: number; status: string; version: number }) =>
      adminUpdateProfile(userId, { status, expected_version: version }),
    onSuccess: invalidate,
    onError: (e) => handleServerError(e, t('Update failed')),
  })
  const columns = useMemo<ColumnDef<DistributorProfile>[]>(
    () => [
      { accessorKey: 'user_id', header: t('User') },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => <Badge variant='outline'>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'rate_bps',
        header: t('Rate'),
        cell: ({ row }) => (row.original.rate_bps ? `${(row.original.rate_bps / 100).toFixed(2)}%` : t('Default')),
      },
      {
        accessorKey: 'balance_quota',
        header: t('Balance'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.balance_quota)}</span>,
      },
      {
        accessorKey: 'total_withdrawn_quota',
        header: t('Withdrawn'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.total_withdrawn_quota)}</span>,
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            <Button size='sm' variant='outline' onClick={() => setEditing(row.original)}>
              {t('Edit')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                update.mutate({
                  userId: row.original.user_id,
                  status: row.original.status === 'active' ? 'suspended' : 'active',
                  version: row.original.version,
                })
              }
            >
              {row.original.status === 'active' ? t('Suspend') : t('Resume')}
            </Button>
            {props.canSettle && row.original.status === 'suspended' ? (
              <Button size='sm' variant='destructive' onClick={() => setSettling(row.original)}>
                {t('Settle out')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [t, update, props.canSettle]
  )
  const table = usePagedTable(
    ['distribution-admin', 'profiles'],
    (p) => adminListProfiles({ p, page_size: 20 }),
    columns,
    t('No distributors')
  )
  return (
    <>
      {table}
      <ProfileEditDialog
        profile={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onDone={invalidate}
      />
      <SettleOutDialog
        profile={settling}
        methods={['alipay', 'wechat', 'bank', 'usdt']}
        onOpenChange={(o) => !o && setSettling(null)}
        onDone={invalidate}
      />
    </>
  )
}

// 退款/冲正相关行不可勾选（F4.6 "退款禁选"）。
function recordSelectable(r: CommissionRecord): boolean {
  if (r.status !== 'frozen') return false
  const display = r.display_status ?? ''
  return !/refund|revers/i.test(display)
}

function PendingTab(props: { program: 'referral' | 'distributor'; canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['distribution-admin', 'pending', props.program],
    queryFn: () => adminListRecords({ p: 1, page_size: 100, program: props.program, status: 'frozen' }),
  })
  const rows = useMemo(() => query.data?.items ?? EMPTY, [query.data])
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  )
  const earlyConfirm = selectedRows.some((r) => r.available_at * 1000 > Date.now())
  const confirm = useMutation({
    mutationFn: () =>
      adminConfirmCommissions({
        ids: [...selected],
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success(t('Confirmed'))
      setSelected(new Set())
      setReason('')
      invalidate()
      query.refetch()
    },
    onError: (e) => handleServerError(e, t('Confirmation failed')),
  })
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const columns = useMemo<ColumnDef<CommissionRecord>[]>(
    () => [
      ...(props.canSettle
        ? [
            {
              id: 'select',
              header: '',
              cell: ({ row }: { row: { original: CommissionRecord } }) => (
                <Checkbox
                  disabled={!recordSelectable(row.original)}
                  checked={selected.has(row.original.id)}
                  onCheckedChange={(v) => toggle(row.original.id, v === true)}
                  aria-label={t('Select record')}
                />
              ),
            } as ColumnDef<CommissionRecord>,
          ]
        : []),
      { accessorKey: 'id', header: 'ID' },
      { accessorKey: 'beneficiary_user_id', header: t('Beneficiary') },
      { accessorKey: 'invitee', header: t('Invitee') },
      {
        accessorKey: 'commission_quota',
        header: t('Commission'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.commission_quota)}</span>,
      },
      {
        accessorKey: 'available_at',
        header: t('Available at'),
        cell: ({ row }) => ts(row.original.available_at),
      },
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) => ts(row.original.created_at),
      },
    ],
    [t, props.canSettle, selected]
  )
  const table = useDataTable({
    columns,
    data: rows,
    totalCount: rows.length,
    manualPagination: false,
    enableSorting: false,
  })
  return (
    <div className='space-y-3'>
      {props.canSettle && (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {t('{{count}} selected', { count: selected.size })}
            {earlyConfirm ? ` · ${t('Early confirmation requires a reason')}` : ''}
          </span>
          <Input
            className='w-64'
            placeholder={t('Reason (required for early confirm)')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            size='sm'
            disabled={selected.size === 0 || (earlyConfirm && !reason.trim()) || confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {t('Confirm selected')}
          </Button>
        </div>
      )}
      <DataTablePage
        table={table.table}
        columns={columns}
        isLoading={query.isPending}
        emptyTitle={t('No pending commissions')}
      />
    </div>
  )
}

function RecordsTab(props: { program: 'referral' | 'distributor'; canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [reason, setReason] = useState('')
  const reverse = useMutation({
    mutationFn: ({ id }: { id: number }) => adminReverseRecord(id, { reason }),
    onSuccess: invalidate,
    onError: (e) => handleServerError(e, t('Reversal failed')),
  })
  const reverseRecord = useCallback(
    (id: number) => {
      if (!reason.trim()) {
        toast.error(t('A reason is required'))
        return
      }
      reverse.mutate({ id })
    },
    [reason, reverse, t]
  )
  const columns = useMemo<ColumnDef<CommissionRecord>[]>(
    () => [
      { accessorKey: 'id', header: 'ID' },
      { accessorKey: 'program', header: t('Program') },
      { accessorKey: 'beneficiary_user_id', header: t('Beneficiary') },
      {
        accessorKey: 'commission_quota',
        header: t('Commission'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.commission_quota)}</span>,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => <Badge variant='outline'>{row.original.display_status ?? row.original.status}</Badge>,
      },
      {
        accessorKey: 'available_at',
        header: t('Available at'),
        cell: ({ row }) => ts(row.original.available_at),
      },
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) => ts(row.original.created_at),
      },
      ...(props.canSettle
        ? [
            {
              id: 'actions',
              header: t('Actions'),
              cell: ({ row }: { row: { original: CommissionRecord } }) =>
                row.original.status !== 'reversed' ? (
                  <Button size='sm' variant='outline' onClick={() => reverseRecord(row.original.id)}>
                    {t('Reverse')}
                  </Button>
                ) : null,
            } as ColumnDef<CommissionRecord>,
          ]
        : []),
    ],
    [t, props.canSettle, reverseRecord]
  )
  const table = usePagedTable(
    ['distribution-admin', 'records', props.program],
    (p) => adminListRecords({ p, page_size: 20, program: props.program }),
    columns,
    t('No records')
  )
  return (
    <div className='space-y-3'>
      {props.canSettle && (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>{t('Reversal reason')}:</span>
          <Input
            className='w-64'
            placeholder={t('Reason (required)')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
      {table}
    </div>
  )
}

function SettlementsTab(props: { program: 'referral' | 'distributor' }) {
  const { t } = useTranslation()
  const columns = useMemo<ColumnDef<CommissionSettlement>[]>(
    () => [
      { accessorKey: 'program', header: t('Program') },
      { accessorKey: 'beneficiary_user_id', header: t('Beneficiary') },
      { accessorKey: 'trigger', header: t('Trigger') },
      {
        accessorKey: 'credited_quota',
        header: t('Amount'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.credited_quota)}</span>,
      },
      {
        accessorKey: 'balance_after',
        header: t('Balance after'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.balance_after)}</span>,
      },
      { accessorKey: 'note', header: t('Note') },
      { accessorKey: 'created_at', header: t('Time'), cell: ({ row }) => ts(row.original.created_at) },
    ],
    [t]
  )
  return usePagedTable(
    ['distribution-admin', 'settlements', props.program],
    (p) => adminListSettlements({ p, page_size: 20, program: props.program }),
    columns,
    t('No settlements')
  )
}

function DebtsTab(props: { program: 'referral' | 'distributor'; canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const waive = useMutation({
    mutationFn: ({ userId, balanceType, amount, reason }: { userId: number; balanceType: string; amount: number; reason: string }) =>
      adminWaiveDebt(userId, { balance_type: balanceType, amount_quota: amount, reason }),
    onSuccess: invalidate,
    onError: (e) => handleServerError(e, t('Waive failed')),
  })
  const waiveDebt = useCallback(
    (userId: number, balanceType: string) => {
      const reason = (reasons[userId] ?? '').trim()
      if (!reason) {
        toast.error(t('A reason is required'))
        return
      }
      waive.mutate({ userId, balanceType, amount: Number(amounts[userId] || 0), reason })
    },
    [reasons, amounts, waive, t]
  )
  const columns = useMemo<ColumnDef<CommissionDebt>[]>(
    () => [
      { accessorKey: 'user_id', header: t('User') },
      { accessorKey: 'balance_type', header: t('Balance type') },
      {
        accessorKey: 'debt_quota',
        header: t('Debt'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.debt_quota)}</span>,
      },
      {
        accessorKey: 'total_debt_quota',
        header: t('Total debt'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.total_debt_quota)}</span>,
      },
      { accessorKey: 'updated_at', header: t('Updated'), cell: ({ row }) => ts(row.original.updated_at) },
      ...(props.canSettle
        ? [
            {
              id: 'actions',
              header: t('Waive'),
              cell: ({ row }: { row: { original: CommissionDebt } }) => (
                <div className='flex gap-1'>
                  <Input
                    className='w-28'
                    placeholder={t('Amount')}
                    value={amounts[row.original.user_id] ?? ''}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [row.original.user_id]: e.target.value }))
                    }
                  />
                  <Input
                    className='w-36'
                    placeholder={t('Reason')}
                    value={reasons[row.original.user_id] ?? ''}
                    onChange={(e) =>
                      setReasons((prev) => ({ ...prev, [row.original.user_id]: e.target.value }))
                    }
                  />
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => waiveDebt(row.original.user_id, row.original.balance_type)}
                  >
                    {t('Waive')}
                  </Button>
                </div>
              ),
            } as ColumnDef<CommissionDebt>,
          ]
        : []),
    ],
    [t, props.canSettle, amounts, reasons, waiveDebt]
  )
  return usePagedTable(
    ['distribution-admin', 'debts', props.program],
    (p) => adminListDebts({ p, page_size: 20, program: props.program }),
    columns,
    t('No debts')
  )
}

interface CampaignForm {
  name: string
  rate: string
  start: string
  end: string
}

function CampaignsTab(props: { program: 'referral' | 'distributor'; canManage: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [form, setForm] = useState<CampaignForm>({ name: '', rate: '', start: '', end: '' })
  const [editing, setEditing] = useState<CommissionCampaign | null>(null)
  const [cancelling, setCancelling] = useState<CommissionCampaign | null>(null)
  const [highRateConfirm, setHighRateConfirm] = useState<null | (() => void)>(null)

  const create = useMutation({
    mutationFn: () =>
      adminCreateCampaign({
        name: form.name,
        program: props.program,
        rate_bps: Math.round(Number(form.rate) * 100),
        starts_at: dayjs(form.start).unix(),
        ends_at: dayjs(form.end).unix(),
        confirm_high_rate: Number(form.rate) > 30,
      }),
    onSuccess: () => {
      toast.success(t('Campaign created'))
      invalidate()
    },
    onError: (e) => handleServerError(e, t('Creation failed')),
  })
  const update = useMutation({
    mutationFn: (input: { c: CommissionCampaign; f: CampaignForm }) =>
      adminUpdateCampaign(input.c.id, {
        name: input.f.name,
        rate_bps: Math.round(Number(input.f.rate) * 100),
        starts_at: dayjs(input.f.start).unix(),
        ends_at: dayjs(input.f.end).unix(),
        confirm_high_rate: Number(input.f.rate) > 30,
        expected_version: input.c.version,
      }),
    onSuccess: () => {
      toast.success(t('Campaign updated'))
      setEditing(null)
      invalidate()
    },
    onError: (e) => handleServerError(e, t('Update failed')),
  })
  const cancel = useMutation({
    mutationFn: (c: CommissionCampaign) => adminCancelCampaign(c.id, c.version),
    onSuccess: () => {
      toast.success(t('Campaign cancelled'))
      setCancelling(null)
      invalidate()
    },
    onError: (e) => handleServerError(e, t('Cancel failed')),
  })

  // F4.7：比例超过 30% 需二次确认后才提交。
  const submitWithRateCheck = (ratePct: number, submitFn: () => void) => {
    if (ratePct > 30) {
      setHighRateConfirm(() => submitFn)
      return
    }
    submitFn()
  }

  const columns = useMemo<ColumnDef<CommissionCampaign>[]>(
    () => [
      { accessorKey: 'name', header: t('Name') },
      {
        accessorKey: 'rate_bps',
        header: t('Rate'),
        cell: ({ row }) => `${(row.original.rate_bps / 100).toFixed(2)}%`,
      },
      { accessorKey: 'starts_at', header: t('Start'), cell: ({ row }) => ts(row.original.starts_at) },
      { accessorKey: 'ends_at', header: t('End'), cell: ({ row }) => ts(row.original.ends_at) },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => <Badge variant='outline'>{row.original.status}</Badge>,
      },
      ...(props.canManage
        ? [
            {
              id: 'actions',
              header: t('Actions'),
              cell: ({ row }: { row: { original: CommissionCampaign } }) =>
                row.original.status === 'active' || row.original.status === 'scheduled' ? (
                  <div className='flex gap-1'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        const c = row.original
                        setEditing(c)
                        setForm({
                          name: c.name,
                          rate: (c.rate_bps / 100).toString(),
                          start: dayjs.unix(c.starts_at).format('YYYY-MM-DDTHH:mm'),
                          end: dayjs.unix(c.ends_at).format('YYYY-MM-DDTHH:mm'),
                        })
                      }}
                    >
                      {t('Edit')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setCancelling(row.original)}
                    >
                      {t('End early')}
                    </Button>
                  </div>
                ) : null,
            } as ColumnDef<CommissionCampaign>,
          ]
        : []),
    ],
    [t, props.canManage]
  )
  const table = usePagedTable(
    ['distribution-admin', 'campaigns', props.program],
    (p) => adminListCampaigns({ p, page_size: 20, program: props.program }),
    columns,
    t('No campaigns')
  )
  const formFields = (
    <div className='flex flex-wrap gap-2'>
      <Input className='w-40' placeholder={t('Name')} value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input className='w-28' placeholder={t('Rate %')} value={form.rate}
        onChange={(e) => setForm({ ...form, rate: e.target.value })} />
      <Input className='w-40' type='datetime-local' value={form.start}
        onChange={(e) => setForm({ ...form, start: e.target.value })} />
      <Input className='w-40' type='datetime-local' value={form.end}
        onChange={(e) => setForm({ ...form, end: e.target.value })} />
    </div>
  )
  const formValid = form.name && form.rate && form.start && form.end
  return (
    <div className='space-y-3'>
      {props.canManage && (
        <div className='space-y-2'>
          {formFields}
          <Button size='sm' disabled={!formValid || create.isPending}
            onClick={() => submitWithRateCheck(Number(form.rate), () => create.mutate())}>
            {t('Create campaign')}
          </Button>
        </div>
      )}
      {table}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Edit campaign')}</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditing(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={!formValid || update.isPending}
              onClick={() =>
                editing &&
                submitWithRateCheck(Number(form.rate), () =>
                  update.mutate({ c: editing, f: form })
                )
              }
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t('End campaign early')}
        desc={t('The campaign will be ended and no longer apply to new records.')}
        confirmText={t('End early')}
        destructive
        handleConfirm={() => cancelling && cancel.mutate(cancelling)}
      />
      <ConfirmDialog
        open={highRateConfirm !== null}
        onOpenChange={(o) => !o && setHighRateConfirm(null)}
        title={t('Rate above 30%')}
        desc={t('A commission rate above 30% is unusually high. Confirm to continue.')}
        confirmText={t('Confirm')}
        handleConfirm={() => {
          const fn = highRateConfirm
          setHighRateConfirm(null)
          fn?.()
        }}
      />
    </div>
  )
}

// WithdrawalDrawer F4.6：提现详情抽屉，所有处置动作在抽屉内完成（不手输 ID）。
function WithdrawalDrawer(props: {
  id: number | null
  canSettle: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [ref, setRef] = useState('')
  const detail = useQuery({
    queryKey: ['distribution-admin', 'withdrawal', props.id],
    queryFn: () => adminGetWithdrawal(props.id ?? 0),
    enabled: props.id !== null,
  })
  const w = detail.data
  const review = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      adminReviewWithdrawal(props.id ?? 0, { action, note: note || undefined, expected_version: w?.version ?? 0 }),
    onSuccess: () => {
      toast.success(t('Reviewed'))
      props.onDone()
      detail.refetch()
    },
    onError: (e) => handleServerError(e, t('Review failed')),
  })
  const markPaid = useMutation({
    mutationFn: () =>
      adminMarkWithdrawalPaid(props.id ?? 0, { paid_ref: ref, expected_version: w?.version ?? 0 }),
    onSuccess: () => {
      toast.success(t('Marked paid'))
      props.onDone()
      detail.refetch()
    },
    onError: (e) => handleServerError(e, t('Mark paid failed')),
  })
  const accountRows = w?.account ? Object.entries(w.account) : []
  return (
    <Sheet open={props.id !== null} onOpenChange={props.onOpenChange}>
      <SheetContent className='w-[min(28rem,100vw)] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{t('Withdrawal')} #{props.id}</SheetTitle>
          <SheetDescription>{w ? `${w.username ?? ''} · ${w.method}` : ''}</SheetDescription>
        </SheetHeader>
        {!w ? (
          <LoadingState />
        ) : (
          <div className='space-y-4 px-4 pb-4 text-sm'>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5'>
              <dt className='text-muted-foreground'>{t('Status')}</dt>
              <dd><Badge variant='outline'>{w.status}</Badge></dd>
              <dt className='text-muted-foreground'>{t('Amount')}</dt>
              <dd className='font-mono'>{q(w.amount_quota)}</dd>
              <dt className='text-muted-foreground'>{t('Payout')}</dt>
              <dd className='font-mono'>{w.payout_amount} {w.payout_currency}</dd>
              <dt className='text-muted-foreground'>{t('FX rate')}</dt>
              <dd className='font-mono'>{w.fx_rate || '—'}</dd>
              <dt className='text-muted-foreground'>{t('Method')}</dt>
              <dd>{w.method}{w.usdt_network ? ` · ${w.usdt_network}` : ''}</dd>
              <dt className='text-muted-foreground'>{t('Applied')}</dt>
              <dd>{ts(w.created_at)}</dd>
              {w.paid_ref ? (
                <>
                  <dt className='text-muted-foreground'>{t('Payment ref')}</dt>
                  <dd className='font-mono'>{w.paid_ref}</dd>
                </>
              ) : null}
              {w.review_note ? (
                <>
                  <dt className='text-muted-foreground'>{t('Review note')}</dt>
                  <dd>{w.review_note}</dd>
                </>
              ) : null}
            </dl>
            {accountRows.length > 0 ? (
              <div>
                <p className='text-muted-foreground mb-1.5 text-xs'>{t('Payout account')}</p>
                <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3'>
                  {accountRows.map(([k, v]) => (
                    <div key={k} className='contents'>
                      <dt className='text-muted-foreground'>{k}</dt>
                      <dd className='font-mono break-all'>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {accountRows.length === 0 && w.masked_account ? (
              <p className='text-muted-foreground text-xs'>{t('Account')}: {w.masked_account}</p>
            ) : null}
            {props.canSettle && w.status === 'pending' ? (
              <div className='space-y-2 border-t pt-3'>
                <Input
                  placeholder={t('Note (required to reject)')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className='flex gap-2'>
                  <Button size='sm' disabled={review.isPending} onClick={() => review.mutate('approve')}>
                    {t('Approve')}
                  </Button>
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={review.isPending || !note.trim()}
                    onClick={() => review.mutate('reject')}
                  >
                    {t('Reject')}
                  </Button>
                </div>
              </div>
            ) : null}
            {props.canSettle && w.status === 'approved' ? (
              <div className='space-y-2 border-t pt-3'>
                <Input
                  placeholder={t('Payment ref (required)')}
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
                <Button
                  size='sm'
                  disabled={markPaid.isPending || !ref.trim()}
                  onClick={() => markPaid.mutate()}
                >
                  {t('Mark paid')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function WithdrawalsTab(props: { canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const columns = useMemo<ColumnDef<DistributorWithdrawal>[]>(
    () => [
      { accessorKey: 'id', header: 'ID' },
      { accessorKey: 'user_id', header: t('User') },
      {
        accessorKey: 'amount_quota',
        header: t('Amount'),
        cell: ({ row }) => <span className='font-mono'>{q(row.original.amount_quota)}</span>,
      },
      {
        accessorKey: 'payout_amount',
        header: t('Payout'),
        cell: ({ row }) => `${row.original.payout_amount} ${row.original.payout_currency}`,
      },
      { accessorKey: 'method', header: t('Method') },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => <Badge variant='outline'>{row.original.status}</Badge>,
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <Button size='sm' variant='outline' onClick={() => setDrawerId(row.original.id)}>
            {t('Details')}
          </Button>
        ),
      },
    ],
    [t]
  )
  const table = usePagedTable(
    ['distribution-admin', 'withdrawals'],
    (p) => adminListWithdrawals({ p, page_size: 20 }),
    columns,
    t('No withdrawals')
  )
  return (
    <>
      {table}
      <WithdrawalDrawer
        id={drawerId}
        canSettle={props.canSettle}
        onOpenChange={(o) => !o && setDrawerId(null)}
        onDone={invalidate}
      />
    </>
  )
}

function InvoicesTab() {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [inputs, setInputs] = useState<Record<number, { note: string; file: string }>>({})
  const review = useMutation({
    mutationFn: ({ id, action, version }: { id: number; action: 'processing' | 'issued' | 'rejected'; version: number }) =>
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
        cell: ({ row }) => <Badge variant='outline'>{row.original.status}</Badge>,
      },
      { accessorKey: 'created_at', header: t('Applied'), cell: ({ row }) => ts(row.original.created_at) },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => {
          const inv = row.original
          if (inv.status !== 'pending' && inv.status !== 'processing') {
            return inv.file_url ? (
              <a href={inv.file_url} target='_blank' rel='noreferrer' className='text-primary text-sm hover:underline'>
                {t('File')}
              </a>
            ) : null
          }
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
                <Button size='sm' variant='outline' onClick={() => review.mutate({ id: inv.id, action: 'processing', version: inv.version })}>
                  {t('Start')}
                </Button>
              ) : null}
              <Button
                size='sm'
                disabled={!(inputs[inv.id]?.file ?? '')}
                onClick={() => review.mutate({ id: inv.id, action: 'issued', version: inv.version })}
              >
                {t('Issue')}
              </Button>
              <Button
                size='sm'
                variant='destructive'
                disabled={!(inputs[inv.id]?.note ?? '')}
                onClick={() => review.mutate({ id: inv.id, action: 'rejected', version: inv.version })}
              >
                {t('Reject')}
              </Button>
            </div>
          )
        },
      },
    ],
    [t, inputs, review]
  )
  return usePagedTable(
    ['distribution-admin', 'invoices'],
    (p) => adminListInvoices({ p, page_size: 20 }),
    columns,
    t('No invoice requests')
  )
}

function BackfillTab(props: { canSettle: boolean }) {
  const { t } = useTranslation()
  const [ids, setIds] = useState('')
  const backfill = useMutation({
    mutationFn: () =>
      adminBackfill({ topup_ids: ids.split(',').map((s) => Number(s.trim())).filter((n) => n > 0) }),
    onSuccess: () => toast.success(t('Backfill done')),
    onError: (e) => handleServerError(e, t('Backfill failed')),
  })
  if (!props.canSettle) return <ErrorState title={t('Settle permission required')} />
  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        {t('Backfill commissions for historical completed top-ups (idempotent)')}
      </p>
      <div className='flex gap-2'>
        <Input className='w-64' placeholder={t('Top-up IDs, comma separated')} value={ids}
          onChange={(e) => setIds(e.target.value)} />
        <Button size='sm' disabled={!ids || backfill.isPending} onClick={() => backfill.mutate()}>
          {t('Run backfill')}
        </Button>
      </div>
    </div>
  )
}

function AdminShell(props: {
  title: string
  tabs: { value: string; label: string; node: React.ReactNode }[]
}) {
  const [tab, setTab] = useState(props.tabs[0]?.value ?? '')
  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{props.title}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='flex-wrap'>
          {props.tabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className='mt-4'>{props.tabs.find((item) => item.value === tab)?.node}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function DistributionAdmin() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  if (!user || user.role < ROLE.ADMIN || !hasPermission(user, 'distributor', 'read')) {
    return <ErrorState title={t('Distributor permission required')} />
  }
  const canSettle = hasPermission(user, 'distributor', 'settle')
  const canManage = hasPermission(user, 'distributor', 'manage')
  const canInvoiceReview = hasPermission(user, 'invoice', 'review')
  return (
    <AdminShell
      title={t('Distribution admin')}
      tabs={[
        { value: 'pending', label: t('Pending confirmation'), node: <PendingTab program='distributor' canSettle={canSettle} /> },
        { value: 'withdrawals', label: t('Withdrawals'), node: <WithdrawalsTab canSettle={canSettle} /> },
        { value: 'applications', label: t('Applications'), node: <ApplicationsTab /> },
        { value: 'profiles', label: t('Distributors'), node: <ProfilesTab canSettle={canSettle} /> },
        { value: 'campaigns', label: t('Campaigns'), node: <CampaignsTab program='distributor' canManage={canManage} /> },
        { value: 'records', label: t('Records'), node: <RecordsTab program='distributor' canSettle={canSettle} /> },
        { value: 'settlements', label: t('Settlements'), node: <SettlementsTab program='distributor' /> },
        { value: 'debts', label: t('Debts'), node: <DebtsTab program='distributor' canSettle={canSettle} /> },
        ...(canInvoiceReview
          ? [{ value: 'invoices', label: t('Invoices'), node: <InvoicesTab /> }]
          : []),
        { value: 'backfill', label: t('Backfill'), node: <BackfillTab canSettle={canSettle} /> },
      ]}
    />
  )
}

// F4.5 推广管理页：只挂 referral.* 权限，内容全部 program='referral'。
export function ReferralAdmin() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  if (!user || user.role < ROLE.ADMIN || !hasPermission(user, 'referral', 'read')) {
    return <ErrorState title={t('Referral permission required')} />
  }
  const canSettle = hasPermission(user, 'referral', 'settle')
  const canManage = hasPermission(user, 'referral', 'manage')
  return (
    <AdminShell
      title={t('Referral admin')}
      tabs={[
        { value: 'pending', label: t('Pending confirmation'), node: <PendingTab program='referral' canSettle={canSettle} /> },
        { value: 'records', label: t('Records'), node: <RecordsTab program='referral' canSettle={canSettle} /> },
        { value: 'settlements', label: t('Settlements'), node: <SettlementsTab program='referral' /> },
        { value: 'debts', label: t('Debts'), node: <DebtsTab program='referral' canSettle={canSettle} /> },
        { value: 'campaigns', label: t('Campaigns'), node: <CampaignsTab program='referral' canManage={canManage} /> },
        { value: 'backfill', label: t('Backfill'), node: <BackfillTab canSettle={canSettle} /> },
      ]}
    />
  )
}
