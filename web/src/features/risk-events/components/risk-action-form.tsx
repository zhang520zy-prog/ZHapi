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
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { useAuthStore } from '@/stores/auth-store'

import {
  reviewRiskEvent,
  submitRiskAppeal,
  type RiskEvent,
  type RiskAppeal,
} from '../api'

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(1000) })
type ReasonInput = z.infer<typeof reasonSchema>

export function RiskActionForm(props: {
  event: RiskEvent
  mode: 'appeal' | 'review'
  appeal?: RiskAppeal
}) {
  const { t } = useTranslation()
  const id = useId()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const [duration, setDuration] = useState('0')
  const [pendingRestriction, setPendingRestriction] =
    useState<ReasonInput | null>(null)
  const form = useForm<ReasonInput>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  })
  const mutation = useMutation({
    mutationFn: async (input: {
      reason: string
      status?: 'confirmed' | 'false_positive'
    }) => {
      if (props.mode === 'appeal') {
        return submitRiskAppeal(props.event.event_id, input.reason)
      }
      return reviewRiskEvent(props.event.event_id, {
        expected_version: props.event.version,
        status: input.status ?? 'false_positive',
        reason: input.reason,
        ...(input.status === 'confirmed' && Number(duration) > 0
          ? { restriction_seconds: Number(duration) }
          : {}),
        ...(props.appeal
          ? {
              appeal_id: props.appeal.id,
              expected_appeal_version: props.appeal.version,
            }
          : {}),
      })
    },
    onSuccess: async () => {
      form.reset()
      setDuration('0')
      setPendingRestriction(null)
      await client.invalidateQueries({ queryKey: ['risk', userId] })
    },
    onError: (error) =>
      handleServerError(
        error,
        t('Risk operation failed. Refresh the record before retrying.')
      ),
  })
  const submit = (status?: 'confirmed' | 'false_positive') =>
    form.handleSubmit((input) => {
      if (status === 'confirmed' && Number(duration) > 0) {
        setPendingRestriction(input)
        return
      }
      mutation.mutate({ ...input, status })
    })()
  const label =
    props.mode === 'appeal' ? t('Appeal reason') : t('Review reason')
  return (
    <form
      className='space-y-3'
      onSubmit={(e) => {
        e.preventDefault()
        if (props.mode === 'appeal') void submit()
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        {...form.register('reason')}
        maxLength={1000}
        disabled={mutation.isPending}
        aria-invalid={!!form.formState.errors.reason}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className='text-muted-foreground text-xs'>
        {t(
          'Describe the context without passwords, API keys or full conversations. Maximum 1000 characters.'
        )}
      </p>
      {props.mode === 'review' && (
        <div className='space-y-2'>
          <Label htmlFor={`${id}-duration`}>{t('Restriction duration')}</Label>
          <Select
            items={[
              { value: '0', label: t('No restriction') },
              { value: '3600', label: t('1 hour') },
              { value: '86400', label: t('1 day') },
              { value: '604800', label: t('7 days') },
              { value: '2592000', label: t('30 days') },
            ]}
            value={duration}
            disabled={mutation.isPending}
            onValueChange={(value) => setDuration(String(value ?? '0'))}
          >
            <SelectTrigger
              id={`${id}-duration`}
              aria-label={t('Restriction duration')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='0'>{t('No restriction')}</SelectItem>
              <SelectItem value='3600'>{t('1 hour')}</SelectItem>
              <SelectItem value='86400'>{t('1 day')}</SelectItem>
              <SelectItem value='604800'>{t('7 days')}</SelectItem>
              <SelectItem value='2592000'>{t('30 days')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Only a confirmed violation restricts API calls. Access resumes automatically at expiry; appeals remain available.'
            )}
          </p>
        </div>
      )}
      <ConfirmDialog
        open={pendingRestriction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRestriction(null)
        }}
        title={t('Restrict API access?')}
        desc={t(
          'This confirmed decision temporarily blocks new API calls. The user can still sign in and appeal.'
        )}
        confirmText={t('Apply restriction')}
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (pendingRestriction) {
            mutation.mutate({ ...pendingRestriction, status: 'confirmed' })
          }
        }}
      />
      {form.formState.errors.reason && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Enter a reason between 1 and 1000 characters.')}
        </p>
      )}
      {mutation.isError && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Risk operation failed. Refresh the record before retrying.')}
          </AlertDescription>
        </Alert>
      )}
      {mutation.isSuccess && (
        <p role='status' className='text-sm'>
          {props.mode === 'appeal' ? t('Appeal submitted') : t('Review saved')}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        {props.mode === 'appeal' ? (
          <Button type='submit' disabled={mutation.isPending}>
            {t('Submit appeal')}
          </Button>
        ) : (
          <>
            <Button
              type='button'
              variant='outline'
              disabled={mutation.isPending}
              onClick={() => void submit('false_positive')}
            >
              {t('Mark false positive')}
            </Button>
            <Button
              type='button'
              disabled={mutation.isPending}
              onClick={() => void submit('confirmed')}
            >
              {t('Confirm violation')}
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
