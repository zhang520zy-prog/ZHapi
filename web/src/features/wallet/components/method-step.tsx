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
import { WalletCards } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { OptionCard } from '@/components/option-card'
import { Label } from '@/components/ui/label'

import { PAYMENT_TYPES } from '../constants'
import {
  formatFeeRateBps,
  getMinTopupAmount,
  getPaymentIcon,
  payTargetId,
  type PayTarget,
} from '../lib'
import type { TopupInfo } from '../types'

interface MethodStepProps {
  topupInfo: TopupInfo
  target: PayTarget | null
  /** Current effective amount; methods below their minimum are disabled. */
  amount: number
  onSelect: (target: PayTarget) => void
  /** When redemption codes are enabled the empty state nudges toward them. */
  redemptionEnabled: boolean
}

export function MethodStep(props: MethodStepProps) {
  const { t } = useTranslation()
  const { topupInfo, amount } = props
  const globalMin = getMinTopupAmount(topupInfo)

  const standardTargets = (topupInfo.pay_methods ?? []).map((method) => ({
    kind: 'standard' as const,
    method,
  }))
  const waffoTargets = topupInfo.enable_waffo_topup
    ? (topupInfo.waffo_pay_methods ?? []).map((method, index) => ({
        kind: 'waffo' as const,
        method,
        index,
      }))
    : []
  const showPancake = topupInfo.enable_waffo_pancake_topup === true
  const showCreem =
    topupInfo.enable_creem_topup === true &&
    (topupInfo.creem_products?.length ?? 0) > 0
  const hasCards =
    standardTargets.length > 0 ||
    waffoTargets.length > 0 ||
    showPancake ||
    showCreem

  const feeText = (bps?: number) =>
    bps != null && bps > 0
      ? `${t('Fee rate')} ${formatFeeRateBps(bps)}`
      : t('No service fee')
  const belowMinReason = (min: number) =>
    min > amount
      ? t('Minimum topup amount: {{amount}}', { amount: min })
      : undefined

  const renderCard = (
    target: PayTarget,
    name: string,
    description: string,
    icon: ReactNode,
    disabledReason?: string
  ) => {
    const selected =
      props.target != null && payTargetId(props.target) === payTargetId(target)
    return (
      <OptionCard
        key={payTargetId(target)}
        selected={selected}
        onSelect={() => props.onSelect(target)}
        disabled={disabledReason != null}
        aria-label={disabledReason ? `${name}. ${disabledReason}` : name}
        title={
          <span className='inline-flex min-w-0 items-center gap-2'>
            {icon}
            <span className='truncate'>{name}</span>
          </span>
        }
        description={disabledReason ?? description}
      />
    )
  }

  return (
    <div className='space-y-2.5 sm:space-y-3'>
      <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
        {t('Payment Method')}
      </Label>

      {!hasCards ? (
        <EmptyState
          icon={WalletCards}
          title={t('Online topup is not enabled')}
          description={
            props.redemptionEnabled
              ? t('You can still top up with a redemption code')
              : t('Please contact the administrator')
          }
          className='min-h-40'
        />
      ) : (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3'>
          {standardTargets.map((target) =>
            renderCard(
              target,
              target.method.name,
              feeText(target.method.fee_rate_bps),
              getPaymentIcon(
                target.method.type,
                'h-4 w-4',
                target.method.icon,
                target.method.name
              ),
              belowMinReason(Math.max(target.method.min_topup || 0, globalMin))
            )
          )}

          {waffoTargets.map((target) =>
            renderCard(
              target,
              target.method.name,
              feeText(target.method.fee_rate_bps),
              target.method.icon ? (
                <img
                  src={target.method.icon}
                  alt={target.method.name}
                  className='h-4 w-4 object-contain'
                />
              ) : (
                getPaymentIcon(PAYMENT_TYPES.WAFFO, 'h-4 w-4')
              ),
              belowMinReason(topupInfo.waffo_min_topup || globalMin)
            )
          )}

          {showPancake &&
            renderCard(
              { kind: 'waffoPancake' },
              'Waffo Pancake',
              feeText(topupInfo.waffo_pancake_fee_rate_bps),
              getPaymentIcon(PAYMENT_TYPES.WAFFO_PANCAKE, 'h-4 w-4'),
              belowMinReason(topupInfo.waffo_pancake_min_topup || globalMin)
            )}

          {showCreem &&
            renderCard(
              { kind: 'creem' },
              'Creem',
              t('Service fee is already included in the price'),
              getPaymentIcon(PAYMENT_TYPES.CREEM, 'h-4 w-4')
            )}
        </div>
      )}

      {props.target == null && hasCards && (
        <p className='text-muted-foreground text-xs'>
          {t('Select a payment method')}
        </p>
      )}
    </div>
  )
}
