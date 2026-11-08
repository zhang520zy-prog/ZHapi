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
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getAffiliateCode } from '@/features/wallet/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  ackDistributorAgreement,
  getCommissionTerms,
  getDistributorSummary,
  getDistributorWallet,
  getDistributorWithdrawals,
  getReferralSummary,
  getSelfDistributor,
  markTermsRead,
  submitDistributorApplication,
  transferDistributorBalance,
  transferReferral,
  withdrawDistributorApplication,
} from './api'
import {
  InviteesTable,
  RecordsTable,
  SettlementsTable,
  WithdrawalsTable,
} from './components/tables'
import { TermsDialog } from './components/terms-dialog'
import { TransferDialog } from './components/transfer-dialog'
import { WithdrawalDialog } from './components/withdrawal-dialog'

const QUOTA_PER_USD = 500000

function usd(quota: number) {
  return `$${(quota / QUOTA_PER_USD).toFixed(2)}`
}

function KpiCard(props: { label: string; value: string; note?: string }) {
  return (
    <Card className='py-0'>
      <CardContent className='p-3 sm:p-4'>
        <div className='text-muted-foreground flex items-baseline justify-between gap-2 text-xs'>
          <span className='truncate'>{props.label}</span>
          {props.note ? (
            <span className='text-muted-foreground/70 shrink-0 text-[10px]'>
              {props.note}
            </span>
          ) : null}
        </div>
        <div className='mt-1.5 truncate text-xl font-semibold tabular-nums'>
          {props.value}
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <div className='space-y-1 border-b pb-3'>
      <h3 className='text-sm font-semibold'>{props.title}</h3>
      <p className='text-muted-foreground text-xs'>{props.description}</p>
    </div>
  )
}

function InviteLinkCard(props: {
  title?: string
  onTransfer?: () => void
  canTransfer?: boolean
  hint?: string
  /** 分销模式：param=dist 时使用外部传入的 dist_code，不再拉取推广码 */
  param?: 'aff' | 'dist'
  code?: string | null
}) {
  const { t } = useTranslation()
  const isDist = props.param === 'dist'
  const [affCode, setAffCode] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const code = isDist ? (props.code ?? '') : affCode
  const link = code
    ? `${window.location.origin}/sign-up?${isDist ? 'dist' : 'aff'}=${code}`
    : ''

  useEffect(() => {
    if (isDist) return
    getAffiliateCode()
      .then((r) => setAffCode(String(requireServerSuccess(r).data ?? '')))
      .catch(() => {})
  }, [isDist])

  return (
    <Card className='h-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm'>
          {t(props.title ?? 'Exclusive referral link')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex gap-2'>
          <Input
            value={link}
            readOnly
            className='bg-muted/40 h-9 min-w-0 flex-1 font-mono text-xs'
          />
          <CopyButton
            value={link}
            variant='outline'
            className='size-9 shrink-0'
            iconClassName='size-4'
            aria-label={t('Copy referral link')}
          />
        </div>
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground shrink-0'>{t('Referral code')}:</span>
          <span className='font-mono font-semibold'>{code || '—'}</span>
          {code ? (
            <CopyButton value={code} variant='ghost' className='size-6' iconClassName='size-3.5' aria-label={t('Copy referral code')} />
          ) : null}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={() => setQrOpen(true)}>
            {t('Share via QR code')}
          </Button>
          {props.onTransfer ? (
            <Button
              size='sm'
              disabled={!props.canTransfer}
              onClick={props.onTransfer}
            >
              {t('Transfer to balance')}
            </Button>
          ) : null}
        </div>
        {props.hint ? (
          <p className='text-muted-foreground text-xs'>{props.hint}</p>
        ) : null}
      </CardContent>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className='max-w-xs'>
          <DialogHeader>
            <DialogTitle>{t('Referral QR code')}</DialogTitle>
          </DialogHeader>
          {link ? (
            <div className='flex justify-center py-2'>
              <QRCodeSVG value={link} size={220} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ReferralPanel() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const [transferOpen, setTransferOpen] = useState(false)
  const summary = useQuery({
    queryKey: ['distribution', 'referral-summary'],
    queryFn: getReferralSummary,
  })
  const data = summary.data
  const affQuota = user?.aff_quota ?? 0
  const debtQuota = data?.debt?.debt_quota ?? 0

  if (data && !data.enabled) return null

  return (
    <div className='space-y-3'>
      <SectionHeader
        title={t('Referral rewards')}
        description={t(
          'Share your link to invite new users. Referral commissions can only be transferred to your account balance for spending — withdrawal is not supported.'
        )}
      />
      <div className='grid gap-3 lg:grid-cols-[minmax(300px,1.1fr)_2fr]'>
        <InviteLinkCard
          canTransfer={affQuota > 0}
          onTransfer={() => setTransferOpen(true)}
          hint={t(
            'Referral commission can only be transferred to account balance and cannot be withdrawn.'
          )}
        />
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
          <KpiCard
            label={t('Available commission')}
            note={t('Transferable to balance')}
            value={usd(affQuota)}
          />
          <KpiCard
            label={t('Pending unlock')}
            note={t('Awaiting settlement')}
            value={usd(data?.frozen_quota ?? 0)}
          />
          <KpiCard
            label={t('Total earned')}
            note={t('Lifetime')}
            value={usd(data?.total_commission ?? 0)}
          />
          <KpiCard
            label={t('Refunded')}
            note={t('Clawed back')}
            value={usd(data?.reversed_quota ?? 0)}
          />
          <KpiCard
            label={t('Outstanding deduction')}
            note={debtQuota > 0 ? t('Offset first') : undefined}
            value={usd(debtQuota)}
          />
          <KpiCard
            label={t('Registered')}
            note={t('Invitees')}
            value={String(data?.invited_count ?? 0)}
          />
        </div>
      </div>
      {data?.campaign ? (
        <div className='flex items-center gap-2 text-sm'>
          <Badge>{t('Campaign rate active')}</Badge>
          <span className='text-muted-foreground'>
            {data.campaign.name} · {(data.rate_bps / 100).toFixed(2)}%
          </span>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('Current rate')}: {(data ? data.rate_bps / 100 : 0).toFixed(2)}%
        </p>
      )}
      <Card>
        <CardContent className='p-3 sm:p-4'>
          <Tabs defaultValue='records'>
            <TabsList>
              <TabsTrigger value='records'>{t('Income details')}</TabsTrigger>
              <TabsTrigger value='invitees'>{t('My referrals')}</TabsTrigger>
              <TabsTrigger value='settlements'>{t('Settlements')}</TabsTrigger>
            </TabsList>
            <TabsContent value='records'>
              <RecordsTable program='referral' />
            </TabsContent>
            <TabsContent value='invitees'>
              <InviteesTable program='referral' />
            </TabsContent>
            <TabsContent value='settlements'>
              <SettlementsTable program='referral' />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        balanceQuota={affQuota}
        onTransfer={transferReferral}
      />
    </div>
  )
}

function useCountdown(targetAt?: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!targetAt || targetAt * 1000 <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [targetAt])
  return Math.max(0, (targetAt ?? 0) - Math.floor(now / 1000))
}

function ApplyForm(props: {
  termsVersion: number
  rejectedNote?: string
  reapplyAt?: number
  onReadAgreement: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [contact, setContact] = useState('')
  const [channelDesc, setChannelDesc] = useState('')
  const [agreed, setAgreed] = useState(false)
  const remaining = useCountdown(props.reapplyAt)
  const blocked = remaining > 0
  const submit = useMutation({
    mutationFn: () =>
      submitDistributorApplication({
        contact,
        channel_desc: channelDesc,
        agreed_terms_version: props.termsVersion,
      }),
    onSuccess: () => {
      toast.success(t('Application submitted'))
      queryClient.invalidateQueries({ queryKey: ['distribution'] })
    },
    onError: (e) => handleServerError(e, t('Application submission failed')),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Become a distributor')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {props.rejectedNote ? (
          <p className='text-destructive text-sm'>
            {t('Previous application rejected')}: {props.rejectedNote}
          </p>
        ) : null}
        {blocked ? (
          <p className='text-muted-foreground text-sm'>
            {t('You can re-apply in {{time}}', {
              time: `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s`,
            })}
          </p>
        ) : null}
        <div className='space-y-1.5'>
          <Label>{t('Contact (wechat / telegram / email)')}</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Promotion channel description')}</Label>
          <Textarea
            rows={3}
            value={channelDesc}
            onChange={(e) => setChannelDesc(e.target.value)}
          />
        </div>
        <label className='flex items-center gap-2 text-sm'>
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <span className='text-muted-foreground'>
            {t('I have read and agree to the')}{' '}
            <button
              type='button'
              className='text-primary underline underline-offset-2'
              onClick={props.onReadAgreement}
            >
              {t('Distributor Agreement')}
            </button>
          </span>
        </label>
        <Button
          disabled={blocked || !contact || !channelDesc || !agreed || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {t('Submit application')}
        </Button>
      </CardContent>
    </Card>
  )
}

function DistributorDashboard(props: { distCode?: string | null }) {
  const { t } = useTranslation()
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const summary = useQuery({
    queryKey: ['distribution', 'distributor-summary'],
    queryFn: getDistributorSummary,
  })
  const wallet = useQuery({
    queryKey: ['distribution', 'wallet'],
    queryFn: getDistributorWallet,
  })
  const withdrawals = useQuery({
    queryKey: ['distribution', 'withdrawals', 'pending-check'],
    queryFn: () => getDistributorWithdrawals({ p: 1, page_size: 5 }),
  })
  const data = summary.data
  const w = wallet.data
  const hasPending = (withdrawals.data?.items ?? []).some(
    (x) => x.status === 'pending' || x.status === 'approved'
  )

  return (
    <div className='space-y-3'>
      <SectionHeader
        title={t('Distributor centre')}
        description={t(
          'Distributor commissions settle to a separate wallet and can be withdrawn or transferred to your account balance.'
        )}
      />
      <div className='flex flex-wrap items-center gap-2'>
        {data ? (
          <Badge variant={data.rate_source === 'campaign' ? 'default' : 'outline'}>
            {(data.rate_bps / 100).toFixed(2)}%
            {data.rate_source === 'campaign' && data.campaign
              ? ` · ${data.campaign.name}`
              : ''}
            {data.rate_source === 'personal' ? ` · ${t('Personal rate')}` : ''}
          </Badge>
        ) : null}
        <span className='text-muted-foreground ml-auto flex gap-2'>
          <Button size='sm' onClick={() => setWithdrawOpen(true)}>
            {t('Apply for withdrawal')}
          </Button>
          <Button size='sm' variant='outline' onClick={() => setTransferOpen(true)}>
            {t('Transfer to balance')}
          </Button>
        </span>
      </div>
      <InviteLinkCard
        title={t('Distributor promotion link')}
        param='dist'
        code={props.distCode}
        hint={t(
          'Distributor commissions are settled to your distributor wallet and can be withdrawn. Your referral link is on the referral page.'
        )}
      />
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <KpiCard
          label={t('Withdrawable')}
          note={t('Settled')}
          value={usd(w?.balance_quota ?? 0)}
        />
        <KpiCard
          label={t('Frozen')}
          note={data ? `${data.hold_days} ${t('days')}` : undefined}
          value={usd(data?.frozen_quota ?? 0)}
        />
        <KpiCard
          label={t('Pending confirmation')}
          note={data ? `${data.due_count}` : undefined}
          value={usd(data?.due_quota ?? 0)}
        />
        <KpiCard
          label={t('Withdrawing')}
          note={t('Under review')}
          value={usd(w?.withdrawing_quota ?? 0)}
        />
        <KpiCard
          label={t('Total earned')}
          note={t('Lifetime')}
          value={usd(data?.settled_quota ?? 0)}
        />
        <KpiCard
          label={t('Refunded')}
          note={t('Clawed back')}
          value={usd(data?.reversed_quota ?? 0)}
        />
        <KpiCard
          label={t('Outstanding debt')}
          value={usd(w?.debt_quota ?? 0)}
        />
        <KpiCard
          label={t('Invitees')}
          note={data ? `${t('Top-up')} ${usd(data.topup_base)}` : undefined}
          value={String(data?.invited_count ?? 0)}
        />
      </div>
      <Card>
        <CardContent className='p-3 sm:p-4'>
          <Tabs defaultValue='commissions'>
            <TabsList>
              <TabsTrigger value='commissions'>{t('Commissions')}</TabsTrigger>
              <TabsTrigger value='invitees'>{t('My referrals')}</TabsTrigger>
              <TabsTrigger value='settlements'>{t('Settlements')}</TabsTrigger>
              <TabsTrigger value='withdrawals'>{t('Withdrawals')}</TabsTrigger>
            </TabsList>
            <TabsContent value='commissions'>
              <RecordsTable program='distributor' />
            </TabsContent>
            <TabsContent value='invitees'>
              <InviteesTable program='distributor' />
            </TabsContent>
            <TabsContent value='settlements'>
              <SettlementsTable program='distributor' />
            </TabsContent>
            <TabsContent value='withdrawals'>
              <WithdrawalsTable />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      {w ? (
        <>
          <WithdrawalDialog
            open={withdrawOpen}
            onOpenChange={setWithdrawOpen}
            wallet={w}
            hasPending={hasPending}
          />
          <TransferDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            balanceQuota={w.balance_quota}
            onTransfer={transferDistributorBalance}
          />
        </>
      ) : null}
    </div>
  )
}

function PendingApplicationCard(props: { applicationId?: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const withdraw = useMutation({
    mutationFn: () => withdrawDistributorApplication(props.applicationId ?? 0),
    onSuccess: () => {
      toast.success(t('Application withdrawn'))
      queryClient.invalidateQueries({ queryKey: ['distribution'] })
    },
    onError: (e) => handleServerError(e, t('Withdrawal failed')),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Application under review')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p className='text-muted-foreground'>
          {t('Your distributor application is being reviewed.')}
        </p>
        {props.applicationId ? (
          <Button
            variant='outline'
            size='sm'
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            {t('Withdraw application')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ReconfirmCard(props: { agreementVersion: number; onReadAgreement: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const ack = useMutation({
    mutationFn: () => ackDistributorAgreement(props.agreementVersion),
    onSuccess: () => {
      toast.success(t('Agreement acknowledged'))
      queryClient.invalidateQueries({ queryKey: ['distribution'] })
    },
    onError: (e) => handleServerError(e, t('Acknowledgement failed')),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Distributor agreement updated')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p className='text-muted-foreground'>
          {t('The Distributor Agreement has been updated. Withdrawals and balance transfers are paused until you read and re-acknowledge it.')}
        </p>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={props.onReadAgreement}>
            {t('Read agreement')}
          </Button>
          <Button size='sm' disabled={ack.isPending} onClick={() => ack.mutate()}>
            {t('Acknowledge v{{version}}', { version: props.agreementVersion })}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DistributorSection(props: { onReadAgreement: () => void }) {
  const { t } = useTranslation()
  const status = useQuery({
    queryKey: ['distribution', 'self'],
    queryFn: getSelfDistributor,
  })
  const data = status.data
  if (status.isLoading) return <LoadingState />
  if (status.isError) {
    return <ErrorState onRetry={() => status.refetch()} />
  }
  if (!data?.enabled) {
    return (
      <FeatureDisabledCard
        message={t(
          'The distributor program is currently disabled by the administrator.'
        )}
      />
    )
  }

  let inner: ReactNode = null
  if (data.status === 'active' && data.needs_reconfirm) {
    inner = (
      <ReconfirmCard
        agreementVersion={data.agreement_version}
        onReadAgreement={props.onReadAgreement}
      />
    )
  } else if (data.status === 'active') {
    inner = <DistributorDashboard distCode={data.profile?.dist_code} /> }
  else if (data.status === 'pending') {
    inner = <PendingApplicationCard applicationId={data.application?.id} />
  } else if (data.status === 'suspended') {
    inner = (
      <Card>
        <CardHeader>
          <CardTitle>{t('Distributor account suspended')}</CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground text-sm'>
          {t('Your distributor account has been suspended.')}
        </CardContent>
      </Card>
    )
  } else if (!data.apply_enabled) {
    inner = (
      <Card>
        <CardHeader>
          <CardTitle>{t('Become a distributor')}</CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground text-sm'>
          {t('Distributor applications are not open yet.')}
        </CardContent>
      </Card>
    )
  } else {
    inner = (
      <ApplyForm
        termsVersion={data.agreement_version}
        rejectedNote={
          data.status === 'rejected' ? data.application?.review_note : undefined
        }
        reapplyAt={data.reapply_at}
        onReadAgreement={props.onReadAgreement}
      />
    )
  }

  return (
    <div className='space-y-3'>
      {data.status === 'active' ? null : (
        <SectionHeader
          title={t('Distributor centre')}
          description={t(
            'Apply to become a distributor. Distributor commissions settle to a separate wallet and can be withdrawn or transferred to your balance.'
          )}
        />
      )}
      {inner}
    </div>
  )
}

function PageActions(props: { onTerms: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return (
    <SectionPageLayout.Actions>
      <Button variant='outline' size='sm' onClick={props.onTerms}>
        {t('Commission policy')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() =>
          queryClient.invalidateQueries({ queryKey: ['distribution'] })
        }
      >
        {t('Refresh')}
      </Button>
    </SectionPageLayout.Actions>
  )
}

function FeatureDisabledCard(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Feature not enabled')}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground text-sm'>
        {props.message}
      </CardContent>
    </Card>
  )
}

// useTermsReadGate F4.1：规则版本领先于已读版本时自动弹出规则；关闭弹窗即
// 记录已读（read ack 只写服务端最新版本）。
function useTermsReadGate(doc: 'referral' | 'distributor') {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const terms = useQuery({
    queryKey: ['distribution', 'terms'],
    queryFn: getCommissionTerms,
    staleTime: 60_000,
  })
  const currentVersion =
    doc === 'referral'
      ? terms.data?.referral_rules_version
      : terms.data?.distributor_agreement_version
  const myVersion =
    doc === 'referral'
      ? terms.data?.my_referral_read_version
      : terms.data?.my_agreement_version
  useEffect(() => {
    if (currentVersion && (myVersion ?? 0) < currentVersion) {
      setOpen(true)
    }
  }, [currentVersion, myVersion])
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      markTermsRead(doc)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['distribution', 'terms'] })
        )
        .catch(() => {})
    }
  }
  return { open, setOpen: handleOpenChange, openTerms: () => setOpen(true) }
}

export function ReferralPage() {
  const { t } = useTranslation()
  const termsGate = useTermsReadGate('referral')
  const summary = useQuery({
    queryKey: ['distribution', 'referral-summary'],
    queryFn: getReferralSummary,
  })
  let content: ReactNode = <ReferralPanel />
  if (summary.isLoading) content = <LoadingState />
  else if (summary.isError) {
    content = <ErrorState onRetry={() => summary.refetch()} />
  } else if (summary.data && !summary.data.enabled) {
    content = (
      <FeatureDisabledCard
        message={t(
          'Referral rewards are currently disabled by the administrator.'
        )}
      />
    )
  }
  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Referral rewards')}
        </SectionPageLayout.Title>
        <PageActions onTerms={termsGate.openTerms} />
        <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
      </SectionPageLayout>
      <TermsDialog open={termsGate.open} onOpenChange={termsGate.setOpen} doc='referral' />
    </>
  )
}

export function DistributorPage() {
  const { t } = useTranslation()
  const [termsOpen, setTermsOpen] = useState(false)
  const readAgreement = () => setTermsOpen(true)
  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Distributor centre')}
        </SectionPageLayout.Title>
        <PageActions onTerms={readAgreement} />
        <SectionPageLayout.Content>
          <DistributorSection onReadAgreement={readAgreement} />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} doc='distributor' />
    </>
  )
}
