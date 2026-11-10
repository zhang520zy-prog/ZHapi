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
import { Link } from '@tanstack/react-router'
import { Gift, ExternalLink, Loader2, Receipt, WalletCards } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { useDebounce } from '@/hooks/use-debounce'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'

import {
  useCreemPayment,
  usePayment,
  usePaymentQuote,
  useRedemption,
  useWaffoPancakePayment,
  useWaffoPayment,
} from '../hooks'
import {
  getMinTopupAmount,
  hasAnyTopupMethod,
  isCreemTarget,
  type PayTarget,
} from '../lib'
import type {
  CreemProduct,
  PresetAmount,
  TopupInfo,
  UserWalletData,
} from '../types'
import { AmountStep } from './amount-step'
import { BalanceCard } from './balance-card'
import { MethodStep } from './method-step'
import { QuoteDetails } from './quote-details'

const QUOTE_DEBOUNCE_MS = 300

interface RechargeTabProps {
  user: UserWalletData | null
  userLoading: boolean
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  topupLoading: boolean
  priceRatio: number
  hasUserAgreement: boolean
  onBillingHistory: () => void
  onPaid: () => void
}

export function RechargeTab(props: RechargeTabProps) {
  const { t } = useTranslation()
  const { processing, processPayment } = usePayment()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processing: waffoProcessing, processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()
  const { redeeming, redeemCode } = useRedemption()
  const redemptionEnabled = useIsSidebarModuleVisible('/redemption-codes')

  const [target, setTarget] = useState<PayTarget | null>(null)
  const [creemProduct, setCreemProduct] = useState<CreemProduct | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customSelected, setCustomSelected] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [redemptionCode, setRedemptionCode] = useState('')

  const minTopup = getMinTopupAmount(props.topupInfo)
  const isCreem = isCreemTarget(target)
  const amount = customSelected
    ? Number.parseInt(amountInput, 10) || 0
    : (selectedPreset ?? minTopup)
  const debouncedAmount = useDebounce(amount, QUOTE_DEBOUNCE_MS)

  // Prefill the custom input once topup info arrives so it starts at the
  // minimum, matching the default effective amount.
  const amountInitializedRef = useRef(false)
  useEffect(() => {
    if (!amountInitializedRef.current && props.topupInfo) {
      amountInitializedRef.current = true
      setAmountInput(String(getMinTopupAmount(props.topupInfo)))
    }
  }, [props.topupInfo])

  const amountTooLow = !isCreem && amount < minTopup
  const quoteQuery = usePaymentQuote(
    debouncedAmount,
    isCreem ? null : target,
    target != null && !isCreem && !amountTooLow
  )

  const processingAny =
    processing || creemProcessing || waffoProcessing || pancakeProcessing

  let disabledReason: string | null = null
  if (target == null) {
    disabledReason = t('Select a payment method')
  } else if (isCreem && creemProduct == null) {
    disabledReason = t('Select a product')
  } else if (amountTooLow) {
    disabledReason = t('Minimum topup amount: {{amount}}', { amount: minTopup })
  } else if (quoteQuery.isFetching) {
    disabledReason = t('Loading...')
  } else if (quoteQuery.isError) {
    disabledReason = quoteQuery.error.message
  }
  const canConfirm = disabledReason == null && !processingAny

  const handleConfirm = async () => {
    if (!canConfirm || target == null) return

    let success = false
    switch (target.kind) {
      case 'creem':
        if (creemProduct) {
          success = await processCreemPayment(creemProduct.productId)
        }
        break
      case 'standard':
        success = await processPayment(debouncedAmount, target.method.type)
        break
      case 'waffo':
        success = await processWaffoPayment(debouncedAmount, target.index)
        break
      case 'waffoPancake':
        success = await processWaffoPancakePayment(debouncedAmount)
        break
    }

    if (success) props.onPaid()
  }

  const handleRedeem = async () => {
    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      props.onPaid()
    }
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)] lg:items-start'>
      <BalanceCard user={props.user} loading={props.userLoading} />

      <TitledCard
        title={t('Add Funds')}
        description={t('Choose an amount and payment method')}
        icon={<WalletCards className='h-4 w-4' />}
        iconTone='success'
        disableHoverEffect
        action={
          <Button
            variant='ghost'
            size='sm'
            onClick={props.onBillingHistory}
            className='gap-1.5'
          >
            <Receipt className='h-4 w-4' />
            {t('Billing History')}
          </Button>
        }
        contentClassName='space-y-4 sm:space-y-6'
      >
        {props.topupLoading ? (
          <div className='space-y-4'>
            <Skeleton className='h-4 w-24' />
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
              {['a', 'b', 'c', 'd'].map((key) => (
                <Skeleton key={key} className='h-14' />
              ))}
            </div>
            <Skeleton className='h-4 w-32' />
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {['e', 'f', 'g'].map((key) => (
                <Skeleton key={key} className='h-14' />
              ))}
            </div>
          </div>
        ) : (
          props.topupInfo && (
            <>
              {hasAnyTopupMethod(props.topupInfo) && (
                <AmountStep
                  creemSelected={isCreem}
                  creemProducts={
                    isCreem ? (props.topupInfo.creem_products ?? []) : []
                  }
                  selectedCreemProductId={creemProduct?.productId ?? null}
                  onSelectCreemProduct={setCreemProduct}
                  presetAmounts={props.presetAmounts}
                  discount={props.topupInfo.discount}
                  priceRatio={props.priceRatio}
                  selectedPreset={selectedPreset}
                  onSelectPreset={(preset) => {
                    setSelectedPreset(preset.value)
                    setCustomSelected(false)
                  }}
                  customSelected={customSelected}
                  onSelectCustom={() => {
                    setCustomSelected(true)
                    setSelectedPreset(null)
                    if (amountInput === '') setAmountInput(String(minTopup))
                  }}
                  amountInput={amountInput}
                  onAmountInput={setAmountInput}
                  minTopup={minTopup}
                  maxTopup={props.topupInfo.max_topup}
                  amountTooLow={amountTooLow}
                />
              )}

              <MethodStep
                topupInfo={props.topupInfo}
                target={target}
                amount={amount}
                onSelect={setTarget}
                redemptionEnabled={redemptionEnabled}
              />

              {hasAnyTopupMethod(props.topupInfo) && (
                <QuoteDetails
                  quote={isCreem ? null : (quoteQuery.data?.quote ?? null)}
                  creemProduct={isCreem ? creemProduct : null}
                  fetching={quoteQuery.isFetching}
                  error={quoteQuery.isError ? quoteQuery.error : null}
                />
              )}

              <div className='space-y-2'>
                <Button
                  className='w-full sm:w-auto'
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                >
                  {processingAny && (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  )}
                  {t('Confirm topup')}
                </Button>
                {disabledReason != null && (
                  <p className='text-muted-foreground text-xs'>
                    {disabledReason}
                  </p>
                )}
                {props.hasUserAgreement && (
                  <p className='text-muted-foreground text-xs'>
                    {t('I have read and agree to the')}{' '}
                    <Link
                      to='/user-agreement'
                      target='_blank'
                      className='text-primary underline-offset-4 hover:underline'
                    >
                      {t('User Agreement')}
                    </Link>
                  </p>
                )}
              </div>
            </>
          )
        )}

        {redemptionEnabled && (
          <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
            <div className='flex items-center gap-2'>
              <IconBadge tone='warning' size='xs'>
                <Gift />
              </IconBadge>
              <Label
                htmlFor='redemption-code'
                className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
              >
                {t('Have a Code?')}
              </Label>
            </div>
            <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
              <Input
                id='redemption-code'
                value={redemptionCode}
                onChange={(e) => setRedemptionCode(e.target.value)}
                placeholder={t('Enter your redemption code')}
                className='h-9 min-w-0'
              />
              <Button
                onClick={handleRedeem}
                disabled={redeeming}
                variant='outline'
                className='h-9 px-4'
              >
                {redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {t('Redeem')}
              </Button>
            </div>
            {props.topupInfo?.topup_link && (
              <p className='text-muted-foreground text-xs'>
                {t('Need a redemption code?')}{' '}
                <a
                  href={props.topupInfo.topup_link}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
                >
                  {t('Get one here')}
                  <ExternalLink className='h-3 w-3' />
                </a>
              </p>
            )}
          </div>
        )}
      </TitledCard>
    </div>
  )
}
