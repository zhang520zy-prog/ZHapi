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
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { OptionCard } from '@/components/option-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrencyFromUSD, formatQuotaWithCurrency } from '@/lib/currency'

import { DEFAULT_DISCOUNT_RATE } from '../constants'
import { formatCreemPrice, getDiscountLabel } from '../lib'
import type { CreemProduct, PresetAmount } from '../types'

interface AmountStepProps {
  /** When true the step renders Creem products instead of amount presets. */
  creemSelected: boolean
  creemProducts: CreemProduct[]
  selectedCreemProductId: string | null
  onSelectCreemProduct: (product: CreemProduct) => void
  presetAmounts: PresetAmount[]
  discount?: Record<number, number>
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  customSelected: boolean
  onSelectCustom: () => void
  amountInput: string
  onAmountInput: (value: string) => void
  minTopup: number
  maxTopup?: number
  amountTooLow: boolean
}

export function AmountStep(props: AmountStepProps) {
  const { t } = useTranslation()
  const inputId = useId()

  return (
    <div className='space-y-2.5 sm:space-y-3'>
      <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
        {props.creemSelected ? t('Select a product') : t('Select amount')}
      </Label>

      {props.creemSelected ? (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3'>
          {props.creemProducts.map((product) => (
            <OptionCard
              key={product.productId}
              selected={props.selectedCreemProductId === product.productId}
              onSelect={() => props.onSelectCreemProduct(product)}
              title={product.name}
              meta={
                <span className='text-sm font-semibold tabular-nums'>
                  {formatCreemPrice(product.price, product.currency)}
                </span>
              }
              description={`${t('Quota')}: ${formatQuotaWithCurrency(product.quota, { abbreviate: false })}`}
            />
          ))}
        </div>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4'>
            {props.presetAmounts.map((preset) => {
              const discount =
                preset.discount ??
                props.discount?.[preset.value] ??
                DEFAULT_DISCOUNT_RATE
              const discountLabel = getDiscountLabel(discount)
              return (
                <OptionCard
                  key={preset.value}
                  selected={
                    !props.customSelected &&
                    props.selectedPreset === preset.value
                  }
                  onSelect={() => props.onSelectPreset(preset)}
                  title={
                    <span className='tabular-nums'>
                      {formatCurrencyFromUSD(preset.value, {
                        abbreviate: false,
                      })}
                    </span>
                  }
                  meta={
                    discountLabel ? (
                      <span className='text-success text-xs font-medium'>
                        {discountLabel}
                      </span>
                    ) : undefined
                  }
                />
              )
            })}
            <OptionCard
              selected={props.customSelected}
              onSelect={props.onSelectCustom}
              title={t('Custom')}
              description={t('Enter a custom amount')}
            />
          </div>

          {props.customSelected && (
            <div className='space-y-1.5'>
              <Label htmlFor={inputId} className='sr-only'>
                {t('Custom Amount')}
              </Label>
              <Input
                id={inputId}
                type='number'
                inputMode='numeric'
                min={props.minTopup}
                value={props.amountInput}
                onChange={(e) => props.onAmountInput(e.target.value)}
                placeholder={t('Minimum topup amount: {{amount}}', {
                  amount: props.minTopup,
                })}
                className='tabular-nums sm:max-w-56'
              />
              {props.amountTooLow && (
                <p className='text-destructive text-xs'>
                  {t('Minimum topup amount: {{amount}}', {
                    amount: props.minTopup,
                  })}
                </p>
              )}
            </div>
          )}

          <p className='text-muted-foreground text-xs'>
            {t('Minimum topup amount: {{amount}}', { amount: props.minTopup })}
            {props.maxTopup != null && (
              <>
                {' · '}
                {t('Maximum topup amount: {{amount}}', {
                  amount: props.maxTopup,
                })}
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
