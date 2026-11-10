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
import { Crown, CalendarClock, CreditCard, Package, Wallet } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { GroupBadge } from '@/components/group-badge'
import { OptionCard } from '@/components/option-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl } from '@/lib/content-format'
import { formatServerMoney } from '@/lib/currency'
import { formatFeeRateBps, formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  paySubscriptionBalance,
  paySubscriptionEpay,
  paySubscriptionStripe,
  paySubscriptionWaffoPancake,
  requestSubscriptionQuote,
} from '../../api'
import { formatDuration, formatResetPeriod } from '../../lib'
import type { PlanRecord } from '../../types'

interface PaymentMethodOption {
  type: string
  name?: string
  icon?: string
  fee_rate_bps?: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanRecord | null
  enableOnlineTopUp?: boolean
  enableWaffoPancake?: boolean
  epayMethods?: PaymentMethodOption[]
  enableStripe?: boolean
  waffoPancakeFeeRateBps?: number
  purchaseLimit?: number
  purchaseCount?: number
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

type MethodKind = 'balance' | 'epay' | 'pancake' | 'stripe'

interface MethodOption {
  key: string
  kind: MethodKind
  /** epay only: the type sent to the pay endpoint. */
  epayType?: string
  name: string
  description: string
}

// In-tab redirect (not window.open) — user-gesture context is lost across the
// await, so a popup would be blocked. Same as the wallet hook.
function submitPaymentForm(url: string, params: Record<string, unknown>) {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'
  const isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  if (!isSafari) {
    form.target = '_blank'
  }
  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value)
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

export function SubscriptionPurchaseDialog(props: Props) {
  const { t } = useTranslation()
  const [paying, setPaying] = useState(false)
  const [methodKey, setMethodKey] = useState<string | null>(null)

  const plan = props.plan?.plan

  const limitReached =
    (props.purchaseLimit || 0) > 0 &&
    (props.purchaseCount || 0) >= (props.purchaseLimit || 0)

  const methods = useMemo<MethodOption[]>(() => {
    if (!plan) return []
    const list: MethodOption[] = []
    if (plan.allow_balance_pay !== false) {
      list.push({
        key: 'balance',
        kind: 'balance',
        name: t('Pay with Balance'),
        description: t('No service fee'),
      })
    }
    if (props.enableOnlineTopUp) {
      for (const method of props.epayMethods ?? []) {
        if (!method?.type) continue
        const feeBps = method.fee_rate_bps ?? 0
        list.push({
          key: `epay:${method.type}`,
          kind: 'epay',
          epayType: method.type,
          name: method.name || method.type,
          description:
            feeBps > 0
              ? `${t('Fee rate')} ${formatFeeRateBps(feeBps)}`
              : t('No service fee'),
        })
      }
    }
    if (props.enableWaffoPancake && plan.waffo_pancake_product_id) {
      const feeBps = props.waffoPancakeFeeRateBps ?? 0
      list.push({
        key: 'waffo_pancake',
        kind: 'pancake',
        name: 'Waffo Pancake',
        description:
          feeBps > 0
            ? `${t('Fee rate')} ${formatFeeRateBps(feeBps)}`
            : t('No service fee'),
      })
    }
    // Stripe Checkout prices from the plan's Stripe price id, so the backend
    // quote endpoint has no branch for it — the hosted page shows the amount.
    if (props.enableStripe && plan.stripe_price_id) {
      list.push({
        key: 'stripe',
        kind: 'stripe',
        name: 'Stripe',
        description: t('Hosted checkout'),
      })
    }
    return list
  }, [
    plan,
    props.enableOnlineTopUp,
    props.epayMethods,
    props.enableWaffoPancake,
    props.waffoPancakeFeeRateBps,
    props.enableStripe,
    t,
  ])

  useEffect(() => {
    if (!props.open) {
      setMethodKey(null)
      return
    }
    if (methods.length > 0) {
      setMethodKey((current) =>
        current != null && methods.some((m) => m.key === current)
          ? current
          : methods[0].key
      )
    }
  }, [props.open, methods])

  const quoteQuery = useQuery({
    queryKey: ['subscription', 'quote', plan?.id, methodKey],
    queryFn: async () => {
      const res = requireServerSuccess(
        await requestSubscriptionQuote({
          plan_id: plan?.id ?? 0,
          payment_method: methodKey ?? '',
        })
      )
      return res
    },
    enabled:
      props.open &&
      plan != null &&
      methodKey != null &&
      methodKey !== 'stripe' &&
      !limitReached,
    retry: false,
    meta: { errorToast: false },
  })
  const quote = quoteQuery.data?.quote ?? null

  const selectedMethod = methods.find((m) => m.key === methodKey) ?? null

  const handlePay = async () => {
    if (!plan || !selectedMethod || paying) return
    setPaying(true)
    try {
      switch (selectedMethod.kind) {
        case 'balance': {
          const res = await paySubscriptionBalance({ plan_id: plan.id })
          if (res.success) {
            toast.success(t('Subscription purchased successfully'))
            void props.onPurchaseSuccess?.()
            props.onOpenChange(false)
          } else {
            handleServerError(res, t('Payment request failed'))
          }
          break
        }
        case 'epay': {
          const res = await paySubscriptionEpay({
            plan_id: plan.id,
            payment_method: selectedMethod.epayType ?? '',
          })
          if (res.message === 'success' && res.url && isHttpUrl(res.url)) {
            submitPaymentForm(
              res.url,
              (res.data ?? {}) as Record<string, unknown>
            )
            toast.success(t('Payment initiated'))
            props.onOpenChange(false)
          } else {
            handleServerError(res, t('Payment request failed'))
          }
          break
        }
        case 'stripe': {
          const res = await paySubscriptionStripe({ plan_id: plan.id })
          if (
            res.message === 'success' &&
            res.data?.pay_link &&
            isHttpUrl(res.data.pay_link)
          ) {
            window.open(res.data.pay_link, '_blank')
            toast.success(t('Payment page opened'))
            props.onOpenChange(false)
          } else {
            handleServerError(res, t('Payment request failed'))
          }
          break
        }
        case 'pancake': {
          const res = await paySubscriptionWaffoPancake({ plan_id: plan.id })
          if (
            res.message === 'success' &&
            res.data?.checkout_url &&
            isHttpUrl(res.data.checkout_url)
          ) {
            toast.success(t('Redirecting to payment page...'))
            window.location.href = res.data.checkout_url
          } else {
            handleServerError(res, t('Payment request failed'))
          }
          break
        }
      }
    } catch (error) {
      handleServerError(error, t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  if (!plan) return null

  const totalAmount = Number(plan.total_amount || 0)
  const price = formatServerMoney(
    Number(plan.price_amount || 0).toFixed(2),
    'CNY'
  )
  const isBalance = selectedMethod?.kind === 'balance'

  let detailsContent: ReactNode = null
  if (limitReached) {
    detailsContent = null
  } else if (selectedMethod == null) {
    detailsContent = (
      <p className='text-muted-foreground text-xs'>
        {t('Please select a payment method')}
      </p>
    )
  } else if (selectedMethod.kind === 'stripe') {
    detailsContent = (
      <p className='text-muted-foreground text-xs'>
        {t('Final amount shown at checkout')}
      </p>
    )
  } else if (quoteQuery.isFetching) {
    detailsContent = (
      <div className='space-y-1.5'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-full' />
      </div>
    )
  } else if (quoteQuery.isError) {
    detailsContent = (
      <p className='text-destructive text-xs'>{quoteQuery.error.message}</p>
    )
  } else {
    detailsContent = (
      <dl className='space-y-1.5 text-sm'>
        <div className='flex items-center justify-between'>
          <dt className='text-muted-foreground'>{t('Credited')}</dt>
          <dd className='font-mono tabular-nums'>
            {formatServerMoney(quote?.credited_money, quote?.currency)}
          </dd>
        </div>
        <div className='flex items-center justify-between'>
          <dt className='text-muted-foreground'>{t('Service fee')}</dt>
          <dd className='font-mono tabular-nums'>
            {isBalance
              ? t('No service fee')
              : formatServerMoney(quote?.fee, quote?.currency)}
          </dd>
        </div>
        <div className='flex items-center justify-between font-medium'>
          <dt>{t('Total')}</dt>
          <dd className='font-mono tabular-nums'>
            {formatServerMoney(quote?.total, quote?.currency)}
          </dd>
        </div>
        {isBalance && (
          <>
            <div className='flex items-center justify-between'>
              <dt className='text-muted-foreground'>{t('Quota to deduct')}</dt>
              <dd className='font-mono tabular-nums'>
                {quoteQuery.data?.quota != null
                  ? formatQuota(quoteQuery.data.quota)
                  : '—'}
              </dd>
            </div>
            <div className='flex items-center justify-between'>
              <dt className='text-muted-foreground'>{t('Current Balance')}</dt>
              <dd className='font-mono tabular-nums'>
                {formatQuota(Math.max(0, Number(props.userQuota || 0)))}
              </dd>
            </div>
          </>
        )}
      </dl>
    )
  }

  const requiredQuota = quoteQuery.data?.quota
  const insufficientBalance =
    isBalance &&
    requiredQuota != null &&
    props.userQuota != null &&
    Number(props.userQuota) < requiredQuota

  const quoteReady =
    selectedMethod?.kind === 'stripe'
      ? true
      : !quoteQuery.isFetching && !quoteQuery.isError && quote != null

  const canPay =
    !limitReached &&
    selectedMethod != null &&
    quoteReady &&
    !insufficientBalance &&
    !paying

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <Crown className='h-5 w-5' />
          {t('Purchase Subscription')}
        </>
      }
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <div className='space-y-3 sm:space-y-4'>
        <div className='bg-muted/50 space-y-2.5 rounded-lg border p-3 sm:space-y-3 sm:p-4'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Plan Name')}
            </span>
            <span className='max-w-[200px] truncate text-sm font-medium'>
              {plan.title}
            </span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Validity Period')}
            </span>
            <span className='flex items-center gap-1 text-sm'>
              <CalendarClock className='h-3.5 w-3.5' />
              {formatDuration(plan, t)}
            </span>
          </div>
          {formatResetPeriod(plan, t) !== t('No Reset') && (
            <div className='flex justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('Reset Period')}
              </span>
              <span className='text-sm'>{formatResetPeriod(plan, t)}</span>
            </div>
          )}
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Plan Quota')}
            </span>
            <span className='flex items-center gap-1 text-sm'>
              <Package className='h-3.5 w-3.5' />
              {totalAmount > 0 ? formatQuota(totalAmount) : t('Unlimited')}
            </span>
          </div>
          {plan.upgrade_group && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('Upgrade Group')}
              </span>
              <GroupBadge group={plan.upgrade_group} />
            </div>
          )}
          <Separator />
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>{t('Price')}</span>
            <span className='text-primary font-mono text-lg font-bold tabular-nums'>
              {price}
            </span>
          </div>
        </div>

        {limitReached && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('Purchase limit reached')} ({props.purchaseCount}/
              {props.purchaseLimit})
            </AlertDescription>
          </Alert>
        )}

        {methods.length > 0 && !limitReached && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>
              {t('Select payment method')}
            </p>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              {methods.map((method) => (
                <OptionCard
                  key={method.key}
                  selected={methodKey === method.key}
                  onSelect={() => setMethodKey(method.key)}
                  title={
                    <span className='inline-flex min-w-0 items-center gap-2'>
                      {method.kind === 'balance' ? (
                        <Wallet className='h-4 w-4 shrink-0' />
                      ) : (
                        <CreditCard className='h-4 w-4 shrink-0' />
                      )}
                      <span className='truncate'>{method.name}</span>
                    </span>
                  }
                  description={method.description}
                />
              ))}
            </div>
          </div>
        )}

        {methods.length === 0 && !limitReached && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('No payment method is available for this plan')}
            </AlertDescription>
          </Alert>
        )}

        {!limitReached && methods.length > 0 && (
          <div className='bg-muted/50 space-y-1.5 rounded-lg border p-3'>
            {detailsContent}
            <p className='text-muted-foreground text-xs'>
              {t('Final amounts are subject to the server quote')}
            </p>
          </div>
        )}

        {insufficientBalance && (
          <Alert variant='destructive'>
            <AlertDescription>{t('Insufficient balance')}</AlertDescription>
          </Alert>
        )}

        {!limitReached && methods.length > 0 && (
          <Button className='w-full' disabled={!canPay} onClick={handlePay}>
            {paying ? t('Loading...') : t('Confirm Payment')}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
