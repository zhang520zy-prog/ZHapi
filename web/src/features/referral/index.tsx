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
import {
  AlertCircle,
  Clock,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { MetricCard } from '@/components/metric-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAffiliateCode } from '@/features/wallet/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  getCommissionTerms,
  getReferralSummary,
  markTermsRead,
  transferReferral,
} from './api'
import {
  InviteesTable,
  RecordsTable,
  SettlementsTable,
} from './components/tables'
import { TermsDialog } from './components/terms-dialog'
import { TransferDialog } from './components/transfer-dialog'

const QUOTA_PER_USD = 500000

function usd(quota: number) {
  return `$${(quota / QUOTA_PER_USD).toFixed(2)}`
}

function InviteLinkCard(props: {
  title?: string
  onTransfer?: () => void
  canTransfer?: boolean
  hint?: string
}) {
  const { t } = useTranslation()
  const [affCode, setAffCode] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const code = affCode
  const link = code ? `${window.location.origin}/sign-up?aff=${code}` : ''

  useEffect(() => {
    getAffiliateCode()
      .then((r) => setAffCode(String(requireServerSuccess(r).data ?? '')))
      .catch(() => {})
  }, [])

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
          <span className='text-muted-foreground shrink-0'>
            {t('Referral code')}:
          </span>
          <span className='font-mono font-semibold'>{code || '—'}</span>
          {code ? (
            <CopyButton
              value={code}
              variant='ghost'
              className='size-6'
              iconClassName='size-3.5'
              aria-label={t('Copy referral code')}
            />
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
    queryKey: ['referral', 'summary'],
    queryFn: getReferralSummary,
  })
  const data = summary.data
  const affQuota = user?.aff_quota ?? 0
  const debtQuota = data?.debt?.debt_quota ?? 0

  if (data && !data.enabled) return null

  return (
    <div className='space-y-3'>
      <section aria-labelledby='referral-rewards' className='space-y-3'>
        <div className='space-y-1'>
          <h3 id='referral-rewards' className='text-base font-semibold'>
            {t('Referral rewards')}
          </h3>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Share your link to invite new users. Referral commissions can only be transferred to your account balance for spending — withdrawal is not supported.'
            )}
          </p>
        </div>
        <div className='grid gap-3 lg:grid-cols-[minmax(300px,1.1fr)_2fr]'>
          <InviteLinkCard
            canTransfer={affQuota > 0}
            onTransfer={() => setTransferOpen(true)}
            hint={t(
              'Referral commission can only be transferred to account balance and cannot be withdrawn.'
            )}
          />
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            <MetricCard
              icon={Wallet}
              tone='chart-1'
              title={t('Available commission')}
              description={t('Transferable to balance')}
              value={usd(affQuota)}
            />
            <MetricCard
              icon={Clock}
              tone='chart-2'
              title={t('Pending unlock')}
              description={t('Awaiting settlement')}
              value={usd(data?.frozen_quota ?? 0)}
            />
            <MetricCard
              icon={TrendingUp}
              tone='chart-3'
              title={t('Total earned')}
              description={t('Lifetime')}
              value={usd(data?.total_commission ?? 0)}
            />
            <MetricCard
              icon={Undo2}
              tone='chart-4'
              title={t('Refunded')}
              description={t('Clawed back')}
              value={usd(data?.reversed_quota ?? 0)}
            />
            <MetricCard
              icon={AlertCircle}
              tone='chart-1'
              title={t('Outstanding deduction')}
              description={debtQuota > 0 ? t('Offset first') : undefined}
              value={usd(debtQuota)}
            />
            <MetricCard
              icon={Users}
              tone='chart-2'
              title={t('Registered')}
              description={t('Invitees')}
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
      </section>
      <Card>
        <CardContent className='p-3 sm:p-4'>
          <Tabs defaultValue='records'>
            <TabsList>
              <TabsTrigger value='records'>{t('Income details')}</TabsTrigger>
              <TabsTrigger value='invitees'>{t('My referrals')}</TabsTrigger>
              <TabsTrigger value='settlements'>{t('Settlements')}</TabsTrigger>
            </TabsList>
            <TabsContent value='records'>
              <RecordsTable />
            </TabsContent>
            <TabsContent value='invitees'>
              <InviteesTable />
            </TabsContent>
            <TabsContent value='settlements'>
              <SettlementsTable />
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
          queryClient.invalidateQueries({ queryKey: ['referral'] })
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
function useTermsReadGate() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const terms = useQuery({
    queryKey: ['referral', 'terms'],
    queryFn: getCommissionTerms,
    staleTime: 60_000,
  })
  const currentVersion = terms.data?.referral_rules_version
  const myVersion = terms.data?.my_referral_read_version
  useEffect(() => {
    if (currentVersion && (myVersion ?? 0) < currentVersion) {
      setOpen(true)
    }
  }, [currentVersion, myVersion])
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      markTermsRead()
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['referral', 'terms'] })
        )
        .catch(() => {})
    }
  }
  return { open, setOpen: handleOpenChange, openTerms: () => setOpen(true) }
}

export function ReferralPage() {
  const { t } = useTranslation()
  const termsGate = useTermsReadGate()
  const summary = useQuery({
    queryKey: ['referral', 'summary'],
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
        <SectionPageLayout.Description>
          {t(
            'Invite new users with your link and track commissions, settlements and invitees.'
          )}
        </SectionPageLayout.Description>
        <PageActions onTerms={termsGate.openTerms} />
        <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
      </SectionPageLayout>
      <TermsDialog open={termsGate.open} onOpenChange={termsGate.setOpen} />
    </>
  )
}
