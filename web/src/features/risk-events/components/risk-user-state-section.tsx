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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useId, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  getRiskUserState,
  listRiskWordCategories,
  reenableRiskUser,
  revokeRiskRestriction,
} from '../api'
import { riskLevelLabel } from '../status'

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(1000) })
type ReasonInput = z.infer<typeof reasonSchema>

export function RiskUserStateSection(props: {
  userId: number
  canReview: boolean
}) {
  const { t } = useTranslation()
  const stateQuery = useQuery({
    queryKey: ['risk', 'admin', 'user-state', props.userId],
    queryFn: () => getRiskUserState(props.userId),
    retry: false,
  })
  const categoriesQuery = useQuery({
    queryKey: ['risk', 'categories'],
    queryFn: listRiskWordCategories,
    retry: false,
    enabled: !!stateQuery.data?.category_hits,
  })
  const categoryNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.key, category.name)
    }
    return map
  }, [categoriesQuery.data])
  const state = stateQuery.data
  const hits = Object.entries(state?.category_hits ?? {})
  const now = Date.now() / 1000
  const restricted = !!state && state.restricted_until > now
  return (
    <section className='space-y-3' aria-label={t('User risk state')}>
      <h3 className='font-medium'>{t('User risk state')}</h3>
      {stateQuery.isPending && (
        <p className='text-muted-foreground'>{t('Loading...')}</p>
      )}
      {stateQuery.isError && (
        <Alert variant='destructive'>
          <AlertDescription>{t('Failed to load user state')}</AlertDescription>
        </Alert>
      )}
      {state && (
        <>
          <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2'>
            <dt>{t('Level')}</dt>
            <dd>{riskLevelLabel(state.level, t)}</dd>
            <dt>{t('Hits in window')}</dt>
            <dd>{state.hits}</dd>
            <dt>{t('Restriction expires')}</dt>
            <dd>
              {state.restricted_until > 0
                ? dayjs
                    .unix(state.restricted_until)
                    .format('YYYY-MM-DD HH:mm:ss')
                : '—'}
            </dd>
            <dt>{t('Account status')}</dt>
            <dd>{state.disabled ? t('Disabled') : t('Active')}</dd>
          </dl>
          <h4 className='text-muted-foreground text-xs font-medium uppercase'>
            {t('Category hits in the last 30 days')}
          </h4>
          {!hits.length && (
            <p className='text-muted-foreground'>{t('No hits')}</p>
          )}
          {!!hits.length && (
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-muted-foreground text-left'>
                  <th className='py-1 font-normal'>{t('Category')}</th>
                  <th className='py-1 font-normal'>{t('Hits')}</th>
                </tr>
              </thead>
              <tbody>
                {hits.map(([key, count]) => (
                  <tr key={key} className='border-border/60 border-t'>
                    <td className='py-1.5'>{categoryNames.get(key) ?? key}</td>
                    <td className='py-1.5'>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {props.canReview && (restricted || state.disabled) && (
            <div className='space-y-4 border-t pt-4'>
              {restricted && (
                <RiskUserActionForm userId={props.userId} action='revoke' />
              )}
              {state.disabled && (
                <RiskUserActionForm userId={props.userId} action='reenable' />
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function RiskUserActionForm(props: {
  userId: number
  action: 'revoke' | 'reenable'
}) {
  const { t } = useTranslation()
  const id = useId()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const [confirming, setConfirming] = useState<ReasonInput | null>(null)
  const form = useForm<ReasonInput>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  })
  const isRevoke = props.action === 'revoke'
  const mutation = useMutation({
    mutationFn: (input: ReasonInput) =>
      isRevoke
        ? revokeRiskRestriction(props.userId, input.reason)
        : reenableRiskUser(props.userId, input.reason),
    onSuccess: async () => {
      form.reset()
      setConfirming(null)
      toast.success(t('Saved successfully'))
      await client.invalidateQueries({ queryKey: ['risk', userId] })
      await client.invalidateQueries({
        queryKey: ['risk', 'admin', 'user-state', props.userId],
      })
    },
    onError: async (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error(t('The record was changed by someone else. Reloaded.'))
        await client.invalidateQueries({ queryKey: ['risk', userId] })
        await client.invalidateQueries({
          queryKey: ['risk', 'admin', 'user-state', props.userId],
        })
        return
      }
      handleServerError(
        error,
        t('Risk operation failed. Refresh the record before retrying.')
      )
    },
  })
  const title = isRevoke ? t('Revoke restriction?') : t('Re-enable account?')
  const description = isRevoke
    ? t(
        'This lifts the API restriction for user {{userId}} immediately. The user can call the API again.',
        {
          userId: props.userId,
        }
      )
    : t(
        'This re-enables the disabled account for user {{userId}}. The user can sign in and call the API again.',
        {
          userId: props.userId,
        }
      )
  return (
    <form
      className='space-y-3'
      onSubmit={form.handleSubmit((input) => setConfirming(input))}
    >
      <h4 className='font-medium'>
        {isRevoke ? t('Revoke restriction') : t('Re-enable account')}
      </h4>
      <Label htmlFor={id}>{t('Reason')}</Label>
      <Textarea
        id={id}
        {...form.register('reason')}
        maxLength={1000}
        disabled={mutation.isPending}
        aria-invalid={!!form.formState.errors.reason}
      />
      {form.formState.errors.reason && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Enter a reason between 1 and 1000 characters.')}
        </p>
      )}
      <Button type='submit' variant='outline' disabled={mutation.isPending}>
        {isRevoke ? t('Revoke restriction') : t('Re-enable account')}
      </Button>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={title}
        desc={description}
        confirmText={
          isRevoke ? t('Revoke restriction') : t('Re-enable account')
        }
        destructive={isRevoke}
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (confirming) mutation.mutate(confirming)
        }}
      />
    </form>
  )
}
