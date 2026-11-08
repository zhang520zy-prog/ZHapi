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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { hasPermission } from '@/lib/admin-permissions'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import { ROLE } from '@/lib/roles'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  adminBackfill,
  adminConfirmCommissions,
  adminListCampaigns,
  adminListDebts,
  adminListRecords,
  adminListSettlements,
  adminWaiveDebt,
  adminReverseRecord,
  adminCreateCampaign,
  adminUpdateCampaign,
  adminCancelCampaign,
  type CommissionCampaign,
  type CommissionDebt,
  type CommissionRecord,
  type CommissionSettlement,
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
  return () => qc.invalidateQueries({ queryKey: ['referral-admin'] })
}

// 退款/冲正相关行不可勾选（F4.6 "退款禁选"）。
function recordSelectable(r: CommissionRecord): boolean {
  if (r.status !== 'frozen') return false
  const display = r.display_status ?? ''
  return !/refund|revers/i.test(display)
}

function PendingTab(props: { canSettle: boolean }) {
  const { t } = useTranslation()
  const invalidate = useInvalidate()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['referral-admin', 'pending'],
    queryFn: () => adminListRecords({ p: 1, page_size: 100, program: 'referral', status: 'frozen' }),
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

function RecordsTab(props: { canSettle: boolean }) {
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
    ['referral-admin', 'records'],
    (p) => adminListRecords({ p, page_size: 20, program: 'referral' }),
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

function SettlementsTab() {
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
    ['referral-admin', 'settlements'],
    (p) => adminListSettlements({ p, page_size: 20, program: 'referral' }),
    columns,
    t('No settlements')
  )
}

function DebtsTab(props: { canSettle: boolean }) {
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
    ['referral-admin', 'debts'],
    (p) => adminListDebts({ p, page_size: 20, program: 'referral' }),
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

function CampaignsTab(props: { canManage: boolean }) {
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
        program: 'referral',
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
    ['referral-admin', 'campaigns'],
    (p) => adminListCampaigns({ p, page_size: 20, program: 'referral' }),
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
        { value: 'pending', label: t('Pending confirmation'), node: <PendingTab canSettle={canSettle} /> },
        { value: 'records', label: t('Records'), node: <RecordsTab canSettle={canSettle} /> },
        { value: 'settlements', label: t('Settlements'), node: <SettlementsTab /> },
        { value: 'debts', label: t('Debts'), node: <DebtsTab canSettle={canSettle} /> },
        { value: 'campaigns', label: t('Campaigns'), node: <CampaignsTab canManage={canManage} /> },
        { value: 'backfill', label: t('Backfill'), node: <BackfillTab canSettle={canSettle} /> },
      ]}
    />
  )
}
