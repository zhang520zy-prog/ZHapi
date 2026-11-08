import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Clock3, FileText } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { getPrivacyPolicy, getUserAgreement } from '@/features/legal/api'
import {
  RegistrationNoticeContent,
  type NoticeDocument,
} from '@/features/legal/registration-notice-content'
import { statusQueryOptions } from '@/lib/status-query'

import { useRegistrationReadingTime } from '../hooks/use-registration-reading-time'

type RegistrationNoticeProps = { onContinue: () => void }

export function RegistrationNotice(props: RegistrationNoticeProps) {
  const { t, i18n } = useTranslation()
  // Revalidate configuration before allowing a fresh registration attempt.
  const status = useQuery({
    ...statusQueryOptions,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
  })
  const hasAgreement = Boolean(status.data?.user_agreement_enabled)
  const hasPrivacy = Boolean(status.data?.privacy_policy_enabled)
  const documents = useQuery({
    queryKey: ['registration-legal-documents', hasAgreement, hasPrivacy],
    enabled: Boolean(status.data) && !status.isFetching,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
    queryFn: async (): Promise<NoticeDocument[]> => {
      const requests = []
      if (hasAgreement) {
        requests.push({ title: 'User Agreement', fetch: getUserAgreement })
      }
      if (hasPrivacy) {
        requests.push({ title: 'Privacy Policy', fetch: getPrivacyPolicy })
      }
      return Promise.all(
        requests.map(async (request) => {
          const response = await request.fetch()
          if (!response.success || !response.data?.trim()) {
            throw new Error('Registration document unavailable')
          }
          return { title: request.title, content: response.data.trim() }
        })
      )
    },
  })

  if (
    status.isError ||
    (!status.isPending && !status.data) ||
    documents.isError
  ) {
    return (
      <ErrorState
        title={t('Unable to load the registration notice')}
        description={t('Please retry before continuing registration.')}
        onRetry={() => {
          void status.refetch()
          void documents.refetch()
        }}
      />
    )
  }

  if (
    status.isPending ||
    status.isFetching ||
    documents.isPending ||
    documents.isFetching
  ) {
    return <LoadingState message={t('Loading the registration notice...')} />
  }

  return (
    <RegistrationNoticeReader
      key={JSON.stringify([
        i18n.resolvedLanguage || i18n.language,
        documents.data,
      ])}
      documents={documents.data}
      onContinue={props.onContinue}
    />
  )
}

function RegistrationNoticeReader(
  props: RegistrationNoticeProps & { documents: NoticeDocument[] }
) {
  const { t } = useTranslation()
  const id = useId()
  const [acknowledged, setAcknowledged] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const secondsLeft = useRegistrationReadingTime()
  const ready = secondsLeft === 0 && reachedEnd

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
        setReachedEnd(true)
      }
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className='min-w-0 space-y-4'>
      <div className='space-y-2'>
        <h3
          id={`${id}-title`}
          className='flex items-center gap-2 text-base font-semibold'
        >
          <FileText className='text-primary size-4' aria-hidden='true' />
          {t('Registration notice')}
        </h3>
        <p className='text-muted-foreground text-sm leading-6'>
          {t(
            'Read this notice in full before registering, especially the prohibited uses, operator duties, and liability limitations. After 6 seconds on this page, you may confirm only if you have read and agree to it. Do not register or use the service if you disagree.'
          )}
        </p>
      </div>

      <div
        ref={scrollRef}
        role='region'
        aria-label={t('Registration notice')}
        tabIndex={0}
        onScroll={() => {
          const el = scrollRef.current
          if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
            setReachedEnd(true)
          }
        }}
        className='border-border bg-muted/20 focus-visible:ring-ring max-h-[45vh] overflow-y-auto overscroll-contain rounded-md border p-4 text-sm leading-7 break-words outline-none focus-visible:ring-2 sm:max-h-[55vh] sm:p-6'
      >
        <RegistrationNoticeContent documents={props.documents} />
      </div>

      <div
        className='text-muted-foreground flex items-center gap-2 text-xs'
        role='status'
      >
        {ready ? (
          <Check className='text-primary size-4' aria-hidden='true' />
        ) : (
          <Clock3 className='size-4' aria-hidden='true' />
        )}
        {ready && t('You may now confirm and continue.')}
        {!ready && secondsLeft > 0 &&
          t('Please read — {{seconds}}s remaining', { seconds: secondsLeft })}
        {!ready && secondsLeft === 0 &&
          t('Scroll to the end of the notice to continue')}
      </div>
      <div className='flex items-start gap-3 py-1'>
        <Checkbox
          id={`${id}-consent`}
          checked={acknowledged}
          disabled={!ready}
          onCheckedChange={(checked) => {
            if (ready) setAcknowledged(checked === true)
          }}
          className='mt-1 data-disabled:opacity-50'
        />
        <Label
          htmlFor={`${id}-consent`}
          className='text-sm leading-6 font-normal'
        >
          {props.documents.length > 0
            ? t(
                'I have read and agree to this platform notice, including the prohibited uses, compliance duties, responsibility for violations, service commitments, and liability limitations. I also agree to the User Agreement and/or Privacy Policy displayed above.'
              )
            : t(
                'I have read and agree to this platform notice, including the prohibited uses, compliance duties, responsibility for violations, service commitments, and liability limitations.'
              )}
        </Label>
      </div>
      <Button
        type='button'
        className='h-11 w-full gap-2'
        disabled={!ready || !acknowledged}
        onClick={() => {
          if (ready && acknowledged && document.visibilityState === 'visible') {
            props.onContinue()
          }
        }}
      >
        {t('Agree and continue')}
        <ArrowRight className='size-4' aria-hidden='true' />
      </Button>
    </section>
  )
}
