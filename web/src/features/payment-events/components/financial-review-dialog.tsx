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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  reviewPaymentEvent,
  type PaymentEvent,
  type PaymentReceipt,
} from '../api'
import { reviewSchema, type ReviewInput } from '../lib/financial-review-schema'

export function FinancialReviewDialog(props: {
  event: PaymentEvent
  receipt: PaymentReceipt
  userID: number
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const subscription = props.receipt.user_subscription_id > 0
  const defaultAction = subscription ? 'keep_entitlement' : 'waive_recovery'
  const form = useForm<ReviewInput>({
    resolver: zodResolver(reviewSchema),
    mode: 'onChange',
    defaultValues: { reason: '', action: defaultAction },
  })
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: ReviewInput) => reviewPaymentEvent(props.event, input),
    onSuccess: async () => {
      setOpen(false)
      await client.invalidateQueries({
        queryKey: ['payment-events', props.userID],
      })
    },
    onError: (error) => handleServerError(error, t('Financial review failed')),
  })
  const action = form.watch('action')
  return (
    <>
      <Button
        variant='outline'
        onClick={() => {
          form.reset({ reason: '', action: defaultAction })
          setOpen(true)
        }}
      >
        {t('Review financial outcome')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('Resolve this payment exception?')}
        desc={t(
          'This records a decision against the verified provider event and its linked entitlement.'
        )}
        confirmText={t('Save financial review')}
        disabled={!form.formState.isValid}
        isLoading={mutation.isPending}
        handleConfirm={() =>
          void form.handleSubmit((input) => mutation.mutate(input))()
        }
      >
        <div className='space-y-3'>
          <Label htmlFor={`${id}-action`}>{t('Financial decision')}</Label>
          <Select
            items={
              subscription
                ? [
                    {
                      value: 'keep_entitlement',
                      label: t('Keep the remaining entitlement'),
                    },
                    {
                      value: 'cancel_entitlement',
                      label: t('End the linked entitlement'),
                    },
                  ]
                : [
                    {
                      value: 'waive_recovery',
                      label: t('Waive recovery of remaining credit'),
                    },
                    {
                      value: 'recover_credit',
                      label: t('Recover verified remaining credit'),
                    },
                  ]
            }
            value={action}
            disabled={mutation.isPending}
            onValueChange={(value) => {
              if (value) {
                form.setValue('action', value as ReviewInput['action'], {
                  shouldValidate: true,
                })
              }
            }}
          >
            <SelectTrigger
              id={`${id}-action`}
              aria-label={t('Financial decision')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subscription ? (
                <>
                  <SelectItem value='keep_entitlement'>
                    {t('Keep the remaining entitlement')}
                  </SelectItem>
                  <SelectItem value='cancel_entitlement'>
                    {t('End the linked entitlement')}
                  </SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value='waive_recovery'>
                    {t('Waive recovery of remaining credit')}
                  </SelectItem>
                  <SelectItem value='recover_credit'>
                    {t('Recover verified remaining credit')}
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Label htmlFor={`${id}-reason`}>{t('Review reason')}</Label>
          <Textarea
            id={`${id}-reason`}
            {...form.register('reason')}
            maxLength={1000}
            disabled={mutation.isPending}
            aria-invalid={!!form.formState.errors.reason}
          />
          {mutation.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {t('Financial review failed')}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  )
}
