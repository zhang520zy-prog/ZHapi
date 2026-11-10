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
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LoadingState } from '@/components/loading-state'
import { RichContent } from '@/components/rich-content'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { logout } from '@/features/auth/api'
import { useStatus } from '@/hooks/use-status'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { acceptUserAgreement, getUserAgreement } from './api'
import type { LegalDocumentResponse } from './types'

export function AgreementConfirmDialog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const setUser = useAuthStore((state) => state.auth.setUser)
  const { status } = useStatus()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const currentVersion =
    typeof status?.user_agreement_version === 'number'
      ? status.user_agreement_version
      : 0
  const acceptedVersion = user?.agreement_version ?? 0
  const mustConfirm =
    !!user && currentVersion > 0 && acceptedVersion < currentVersion

  const agreement = useQuery({
    queryKey: ['legal', 'user-agreement'],
    queryFn: getUserAgreement,
    staleTime: 10 * 60 * 1000,
    enabled: mustConfirm,
  })

  const accept = useMutation({
    mutationFn: () => acceptUserAgreement(currentVersion),
    onSuccess: (data) => {
      if (!data.success) {
        handleServerError(data, t('Failed to confirm the user agreement'))
        return
      }
      if (user) {
        setUser({ ...user, agreement_version: currentVersion })
      }
    },
  })

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await logout()
      clearAuthenticatedClientState(queryClient)
      void navigate({ to: '/sign-in', replace: true })
    } catch (error: unknown) {
      handleServerError(error, t('Failed to sign out session'))
      setIsSigningOut(false)
    }
  }

  if (!mustConfirm) return null
  return (
    <AgreementConfirmContent
      agreement={agreement}
      accepting={accept.isPending}
      acceptFailed={accept.isError}
      acceptDisabled={accept.isPending || isSigningOut}
      signingOut={isSigningOut}
      onAccept={() => accept.mutate()}
      onSignOut={() => void handleSignOut()}
    />
  )
}

function AgreementConfirmContent(props: {
  agreement: UseQueryResult<LegalDocumentResponse>
  accepting: boolean
  acceptFailed: boolean
  acceptDisabled: boolean
  signingOut: boolean
  onAccept: () => void
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const { agreement } = props
  const rawContent = agreement.data?.data?.trim() ?? ''

  let documentContent: React.ReactNode = null
  if (agreement.isSuccess && rawContent) {
    if (isHttpUrl(rawContent)) {
      documentContent = (
        <Button
          render={
            <a href={rawContent} target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('View document')}
        </Button>
      )
    } else if (isLikelyHtml(rawContent)) {
      documentContent = (
        <RichContent mode='html' htmlVariant='isolated' content={rawContent} />
      )
    } else {
      documentContent = (
        <RichContent
          mode='markdown'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      )
    }
  }

  return (
    <Dialog
      open
      onOpenChange={() => {}}
      disablePointerDismissal
      showCloseButton={false}
      title={t('User agreement updated')}
      description={t(
        'Please review and accept the updated user agreement to continue using the console.'
      )}
      contentHeight='50dvh'
      footer={
        <>
          <Button
            variant='outline'
            onClick={props.onSignOut}
            disabled={props.acceptDisabled}
          >
            {t('Log out')}
          </Button>
          <Button
            onClick={props.onAccept}
            disabled={
              props.acceptDisabled || agreement.isPending || agreement.isError
            }
          >
            {t('Agree and continue')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {props.acceptFailed && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t(
                'Failed to confirm the user agreement. Check your connection and try again.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {agreement.isPending && <LoadingState />}
        {agreement.isError && (
          <Alert variant='destructive'>
            <AlertDescription className='flex items-center justify-between gap-2'>
              <span>{t('Failed to load the user agreement')}</span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void agreement.refetch()}
              >
                {t('Retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {documentContent}
      </div>
    </Dialog>
  )
}
