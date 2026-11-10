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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency, formatServerMoney } from '@/lib/currency'

import { formatCreemPrice } from '../lib'
import type { CreemProduct, PaymentQuote } from '../types'

interface QuoteDetailsProps {
  /** Server-side quote for non-Creem targets; rows show '-' when absent. */
  quote: PaymentQuote | null
  /** Selected Creem product; takes precedence over `quote`. */
  creemProduct: CreemProduct | null
  fetching: boolean
  error: Error | null
}

export function QuoteDetails(props: QuoteDetailsProps) {
  const { t } = useTranslation()

  let credited = '—'
  let fee = '—'
  let total = '—'

  if (props.creemProduct) {
    credited = formatQuotaWithCurrency(props.creemProduct.quota, {
      abbreviate: false,
    })
    fee = t('Service fee is already included in the price')
    total = formatCreemPrice(
      props.creemProduct.price,
      props.creemProduct.currency
    )
  } else if (props.quote) {
    credited = formatServerMoney(
      props.quote.credited_money,
      props.quote.currency
    )
    fee = props.quote.fee_included
      ? t('Service fee is already included in the price')
      : formatServerMoney(props.quote.fee, props.quote.currency)
    total = formatServerMoney(props.quote.total, props.quote.currency)
  }

  let content: ReactNode
  if (props.fetching) {
    content = (
      <>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-full' />
      </>
    )
  } else if (props.error) {
    content = <p className='text-destructive text-xs'>{props.error.message}</p>
  } else {
    content = (
      <>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Credited')}</dt>
          <dd className='text-right tabular-nums'>{credited}</dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Service fee')}</dt>
          <dd className='text-right tabular-nums'>{fee}</dd>
        </div>
        <div className='flex items-center justify-between gap-2 font-medium'>
          <dt>{t('Total')}</dt>
          <dd className='text-right tabular-nums'>{total}</dd>
        </div>
      </>
    )
  }

  return (
    <div className='space-y-1.5'>
      <dl className='space-y-1.5 rounded-[var(--rd-radius-card)] border p-3 text-sm'>
        {content}
      </dl>
      <p className='text-muted-foreground text-xs'>
        {t('Final amounts are subject to the server quote')}
      </p>
    </div>
  )
}
