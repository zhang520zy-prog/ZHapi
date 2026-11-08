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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { retryPaymentEvent, type PaymentEvent } from '../api'

export function RetryPaymentDialog(props: {
  event: PaymentEvent
  userID?: number
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [queued, setQueued] = useState(false)
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => retryPaymentEvent(props.event, reason.trim()),
    onSuccess: async () => {
      setQueued(true)
      setOpen(false)
      setReason('')
      await client.invalidateQueries({
        queryKey: ['payment-events', props.userID],
      })
    },
    onError: (error) => handleServerError(error, t('Payment retry failed')),
  })
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        {t('Retry fulfillment')}
      </Button>
      {queued && (
        <p role='status' className='text-muted-foreground text-xs'>
          {t('Retry queued')}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('Retry this payment?')}
        desc={t(
          'Only the original verified payment will be replayed. Repeated fulfillment does not add a second credit.'
        )}
        confirmText={t('Retry fulfillment')}
        disabled={!reason.trim() || [...reason.trim()].length > 1000}
        isLoading={mutation.isPending}
        handleConfirm={() => mutation.mutate()}
      >
        <div className='space-y-2'>
          <Label htmlFor={id}>{t('Retry reason')}</Label>
          <Textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            disabled={mutation.isPending}
          />
          {mutation.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {t('Payment retry failed')}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  )
}
