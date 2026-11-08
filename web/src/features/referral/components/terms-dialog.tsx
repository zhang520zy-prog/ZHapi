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
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

import { getCommissionTerms } from '../api'

interface TermsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// 《推广返现规则》首次弹出并记录已读；只展示推广补充条款。
export function TermsDialog(props: TermsDialogProps) {
  const { t } = useTranslation()
  const terms = useQuery({
    queryKey: ['referral', 'terms'],
    queryFn: getCommissionTerms,
    enabled: props.open,
  })

  let description = ' '
  if (terms.data) {
    description = `${t('Version')} v${terms.data.referral_rules_version} · ${t('Referral rate')} ${(terms.data.referral_rate_bps / 100).toFixed(2)}%`
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Commission Terms')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='max-h-[60vh] overflow-y-auto pr-1'>
          {terms.isPending ? (
            <div className='space-y-2'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-5/6' />
              <Skeleton className='h-4 w-2/3' />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm whitespace-pre-wrap'>
              {terms.data?.referral_extra ||
                t('No additional terms published.')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
