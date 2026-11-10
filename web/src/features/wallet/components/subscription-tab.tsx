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
import { Crown, Package, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { GroupBadge } from '@/components/group-badge'
import { dotColorMap, textColorMap } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  getPublicPlans,
  getSelfSubscriptionFull,
  updateBillingPreference,
} from '@/features/subscriptions/api'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import { formatDuration, formatTimestamp } from '@/features/subscriptions/lib'
import type {
  PlanRecord,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'
import { formatServerMoney } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import type { TopupInfo } from '../types'

interface SubscriptionTabProps {
  topupInfo: TopupInfo | null
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

function getBillingPreferenceLabel(
  preference: string,
  t: (key: string) => string
): string {
  switch (preference) {
    case 'subscription_first':
      return t('Subscription First')
    case 'wallet_first':
      return t('Wallet First')
    case 'subscription_only':
      return t('Subscription Only')
    case 'wallet_only':
      return t('Wallet Only')
    default:
      return preference
  }
}

export function SubscriptionTab(props: SubscriptionTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanRecord | null>(null)
  const [billingPreference, setBillingPreference] =
    useState('subscription_first')
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)

  // Same queryKey as the wallet tab gate — shared cache, no duplicate fetch.
  const plansQuery = useQuery({
    queryKey: ['subscription', 'public-plans'],
    queryFn: async () =>
      requireServerSuccess(await getPublicPlans()).data ?? [],
    staleTime: 60_000,
    retry: false,
    meta: { errorToast: false },
  })
  const plans = useMemo(
    () => (plansQuery.data ?? []) as PlanRecord[],
    [plansQuery.data]
  )

  const selfQuery = useQuery({
    queryKey: ['subscription', 'self'],
    queryFn: async () =>
      requireServerSuccess(await getSelfSubscriptionFull()).data,
    retry: false,
  })
  const selfData = selfQuery.data
  useEffect(() => {
    if (selfData && !preferenceLoaded) {
      setPreferenceLoaded(true)
      setBillingPreference(selfData.billing_preference || 'subscription_first')
    }
  }, [selfData, preferenceLoaded])

  const activeSubscriptions = useMemo(
    () => selfData?.subscriptions ?? [],
    [selfData]
  )
  const allSubscriptions = useMemo(
    () => selfData?.all_subscriptions ?? [],
    [selfData]
  )

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const sub of allSubscriptions) {
      const planId = sub?.subscription?.plan_id
      if (!planId) continue
      map.set(planId, (map.get(planId) || 0) + 1)
    }
    return map
  }, [allSubscriptions])

  const planTitleMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of plans) {
      if (p?.plan?.id) map.set(p.plan.id, p.plan.title || '')
    }
    return map
  }, [plans])

  const loading = plansQuery.isPending || selfQuery.isPending
  const hasActive = activeSubscriptions.length > 0
  const hasAny = allSubscriptions.length > 0
  const expiredCount = allSubscriptions.length - activeSubscriptions.length
  const disablePref = !hasActive
  const isSubPref =
    billingPreference === 'subscription_first' ||
    billingPreference === 'subscription_only'

  const refreshSelf = () =>
    queryClient.invalidateQueries({ queryKey: ['subscription', 'self'] })

  const handlePreferenceChange = async (pref: string) => {
    const previous = billingPreference
    setBillingPreference(pref)
    try {
      const res = await updateBillingPreference(pref)
      if (res.success) {
        toast.success(t('Updated successfully'))
        setBillingPreference(res.data?.billing_preference || pref)
      } else {
        handleServerError(res, t('Update failed'))
        setBillingPreference(previous)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
      setBillingPreference(previous)
    }
  }

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:p-5'>
          <Skeleton className='h-20 w-full' />
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
            {['first', 'second', 'third'].map((key) => (
              <Skeleton key={key} className='h-48 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {hasAny && (
        <section className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-2.5 sm:gap-3'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <h3 className='text-sm font-medium'>{t('My Subscriptions')}</h3>
              <span className='flex items-center gap-1.5 text-xs font-medium'>
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    hasActive ? dotColorMap.success : dotColorMap.neutral
                  )}
                  aria-hidden='true'
                />
                {hasActive ? (
                  <span className={cn(textColorMap.success)}>
                    {activeSubscriptions.length} {t('active')}
                  </span>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('No Active')}
                  </span>
                )}
                {expiredCount > 0 && (
                  <>
                    <span className='text-muted-foreground' aria-hidden='true'>
                      ·
                    </span>
                    <span className='text-muted-foreground'>
                      {expiredCount} {t('expired')}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Select
                items={[
                  {
                    value: 'subscription_first',
                    label: getBillingPreferenceLabel('subscription_first', t),
                  },
                  {
                    value: 'wallet_first',
                    label: getBillingPreferenceLabel('wallet_first', t),
                  },
                  {
                    value: 'subscription_only',
                    label: getBillingPreferenceLabel('subscription_only', t),
                  },
                  {
                    value: 'wallet_only',
                    label: getBillingPreferenceLabel('wallet_only', t),
                  },
                ]}
                value={billingPreference}
                onValueChange={(v) => v !== null && handlePreferenceChange(v)}
                aria-label={t('Billing preference')}
              >
                <SelectTrigger className='h-8 w-[180px] text-xs'>
                  <SelectValue>
                    {getBillingPreferenceLabel(billingPreference, t)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem
                      value='subscription_first'
                      disabled={disablePref}
                    >
                      {getBillingPreferenceLabel('subscription_first', t)}
                    </SelectItem>
                    <SelectItem value='wallet_first'>
                      {getBillingPreferenceLabel('wallet_first', t)}
                    </SelectItem>
                    <SelectItem
                      value='subscription_only'
                      disabled={disablePref}
                    >
                      {getBillingPreferenceLabel('subscription_only', t)}
                    </SelectItem>
                    <SelectItem value='wallet_only'>
                      {getBillingPreferenceLabel('wallet_only', t)}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={() => void refreshSelf()}
                disabled={selfQuery.isFetching}
                aria-label={t('Refresh')}
              >
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    selfQuery.isFetching && 'animate-spin'
                  )}
                />
              </Button>
            </div>
          </div>

          {disablePref && isSubPref && (
            <p className='text-muted-foreground text-xs'>
              {billingPreference === 'subscription_only'
                ? t(
                    'Preference saved as {{pref}}, but no active subscription. Requests will be rejected.',
                    { pref: t('Subscription Only') }
                  )
                : t(
                    'Preference saved as {{pref}}, but no active subscription. Wallet will be used automatically.',
                    { pref: t('Subscription First') }
                  )}
            </p>
          )}

          {hasActive ? (
            <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
              {activeSubscriptions.map((sub) => (
                <ActiveSubscriptionCard
                  key={sub?.subscription?.id}
                  sub={sub}
                  planTitle={planTitleMap.get(sub?.subscription?.plan_id) || ''}
                />
              ))}
            </div>
          ) : (
            <p className='text-muted-foreground text-xs'>{t('No Active')}</p>
          )}
        </section>
      )}

      <TitledCard
        title={t('Subscription Plans')}
        description={t('Subscribe to a plan for model access')}
        icon={<Crown className='h-4 w-4' />}
        iconTone='warning'
        disableHoverEffect
        contentClassName='space-y-4 sm:space-y-5'
      >
        {plans.length > 0 ? (
          <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
            {plans.map((p) => {
              const plan = p?.plan
              if (!plan) return null
              const totalAmount = Number(plan.total_amount || 0)
              const price = formatServerMoney(
                Number(plan.price_amount || 0).toFixed(2),
                'CNY'
              )
              const limit = Number(plan.max_purchase_per_user || 0)
              const count = planPurchaseCountMap.get(plan.id) || 0
              const reached = limit > 0 && count >= limit

              return (
                <Card
                  key={plan.id}
                  data-card-hover='false'
                  className='gap-0 py-0'
                >
                  <CardContent className='flex h-full flex-col p-3.5 sm:p-4'>
                    <div className='mb-2 min-w-0'>
                      <h4 className='truncate font-semibold'>
                        {plan.title || t('Subscription Plans')}
                      </h4>
                      {plan.subtitle && (
                        <p className='text-muted-foreground truncate text-xs'>
                          {plan.subtitle}
                        </p>
                      )}
                    </div>

                    <div className='py-2'>
                      <span className='text-primary font-mono text-2xl font-bold tabular-nums'>
                        {price}
                      </span>
                      <span className='text-muted-foreground font-mono text-sm tabular-nums'>
                        {' '}
                        / {formatDuration(plan, t)}
                      </span>
                    </div>

                    <div className='text-muted-foreground flex-1 space-y-1.5 pb-3 text-xs'>
                      <p>
                        {t('Total Quota')}:{' '}
                        {totalAmount > 0
                          ? formatQuota(totalAmount)
                          : t('Unlimited')}
                      </p>
                      {plan.upgrade_group && (
                        <p className='flex items-center gap-1.5'>
                          {t('Upgrade Group')}:{' '}
                          <GroupBadge group={plan.upgrade_group} />
                        </p>
                      )}
                      {limit > 0 && (
                        <p>
                          {t('Purchased {{count}} / Limit {{limit}}', {
                            count,
                            limit,
                          })}
                        </p>
                      )}
                    </div>

                    <Button
                      variant='outline'
                      className='w-full'
                      disabled={reached}
                      onClick={() => {
                        setSelectedPlan(p)
                        setPurchaseOpen(true)
                      }}
                    >
                      {reached ? t('Limit Reached') : t('Subscribe Now')}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            {t('No plans available')}
          </p>
        )}
      </TitledCard>

      <SubscriptionPurchaseDialog
        open={purchaseOpen}
        onOpenChange={(open) => {
          setPurchaseOpen(open)
          if (!open) void refreshSelf()
        }}
        plan={selectedPlan}
        enableOnlineTopUp={!!props.topupInfo?.enable_online_topup}
        enableWaffoPancake={!!props.topupInfo?.enable_waffo_pancake_topup}
        epayMethods={props.topupInfo?.pay_methods}
        waffoPancakeFeeRateBps={props.topupInfo?.waffo_pancake_fee_rate_bps}
        userQuota={props.userQuota}
        onPurchaseSuccess={props.onPurchaseSuccess}
        purchaseLimit={
          selectedPlan?.plan?.max_purchase_per_user
            ? Number(selectedPlan.plan.max_purchase_per_user)
            : undefined
        }
        purchaseCount={
          selectedPlan?.plan?.id
            ? planPurchaseCountMap.get(selectedPlan.plan.id)
            : undefined
        }
      />
    </>
  )
}

function ActiveSubscriptionCard(props: {
  sub: UserSubscriptionRecord
  planTitle: string
}) {
  const { t } = useTranslation()
  const subscription = props.sub?.subscription
  const totalAmount = Number(subscription?.amount_total || 0)
  const usedAmount = Number(subscription?.amount_used || 0)
  const usagePercent =
    totalAmount > 0 ? Math.round((usedAmount / totalAmount) * 100) : 0
  const nextResetTime = subscription?.next_reset_time ?? 0

  return (
    <TitledCard
      title={
        props.planTitle
          ? `${props.planTitle} · ${t('Subscription')} #${subscription?.id}`
          : `${t('Subscription')} #${subscription?.id}`
      }
      icon={<Package className='h-4 w-4' />}
      iconTone='primary'
      disableHoverEffect
      contentClassName='space-y-2 text-xs'
    >
      <div className='text-muted-foreground'>
        {t('Until')} {formatTimestamp(subscription?.end_time || 0)}
      </div>
      {totalAmount > 0 ? (
        <div className='space-y-1.5'>
          <div className='text-muted-foreground flex items-center justify-between'>
            <span>
              {formatQuota(usedAmount)} / {formatQuota(totalAmount)}
            </span>
            <span>
              {t('Used')} {usagePercent}%
            </span>
          </div>
          <Progress value={usagePercent} className='h-1.5' />
        </div>
      ) : (
        <div className='text-muted-foreground'>{t('Unlimited')}</div>
      )}
      {nextResetTime > 0 && (
        <div className='text-muted-foreground'>
          {t('Next reset')}: {formatTimestamp(nextResetTime)}
        </div>
      )}
    </TitledCard>
  )
}
