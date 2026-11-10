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
import { WalletMinimal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency, getCurrencyLabel } from '@/lib/currency'

import type { UserWalletData } from '../types'

interface BalanceCardProps {
  user: UserWalletData | null
  loading: boolean
}

export function BalanceCard(props: BalanceCardProps) {
  const { t } = useTranslation()

  return (
    <Card data-card-hover='false' className='border-primary/40 gap-0 py-0'>
      <CardContent className='p-4 sm:p-5'>
        <div className='flex items-center gap-3'>
          <IconBadge size='title' tone='primary'>
            <WalletMinimal />
          </IconBadge>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Current Balance')}
            </p>
            {props.loading ? (
              <Skeleton className='mt-1.5 h-8 w-40' />
            ) : (
              <p className='mt-0.5 truncate text-2xl font-semibold tracking-tight tabular-nums'>
                {formatQuotaWithCurrency(props.user?.quota ?? 0, {
                  abbreviate: false,
                  digitsLarge: 2,
                  digitsSmall: 4,
                })}
              </p>
            )}
          </div>
        </div>
        <div className='text-muted-foreground mt-4 flex items-center justify-between gap-2 text-xs'>
          <span className='truncate'>{props.user?.username ?? '—'}</span>
          <span className='shrink-0'>{getCurrencyLabel()}</span>
        </div>
        <p className='text-muted-foreground mt-3 border-t pt-3 text-xs'>
          {t('Online payments are credited instantly')}
        </p>
      </CardContent>
    </Card>
  )
}
