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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

const QUOTA_PER_USD = 500000

interface TransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  balanceQuota: number
  onTransfer: (amountQuota: number) => Promise<unknown>
}

export function TransferDialog(props: TransferDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amountUsd, setAmountUsd] = useState('')
  const amountQuota = Math.round((Number(amountUsd) || 0) * QUOTA_PER_USD)

  const submit = useMutation({
    mutationFn: () => props.onTransfer(amountQuota),
    onSuccess: () => {
      toast.success(t('Transferred to account balance'))
      setAmountUsd('')
      props.onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['referral'] })
    },
    onError: (e) => handleServerError(e, t('Transfer failed')),
  })

  const invalid =
    amountQuota <= 0 || amountQuota > props.balanceQuota || submit.isPending

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>{t('Transfer to balance')}</DialogTitle>
          <DialogDescription>
            {t('Transferred commission becomes account balance and cannot be withdrawn or reversed.')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-1.5'>
          <Label>{t('Amount (USD)')}</Label>
          <Input
            type='number'
            min='0'
            step='0.01'
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t('Available')}: ${(props.balanceQuota / QUOTA_PER_USD).toFixed(2)}
          </p>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button disabled={invalid} onClick={() => submit.mutate()}>
            {t('Confirm transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
