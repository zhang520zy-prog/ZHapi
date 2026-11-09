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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  ListChecks,
  TerminalSquare,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { fetchTokenKey } from '@/features/keys/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { handleServerError } from '@/lib/handle-server-error'

import type {
  RequestExample,
  SetupGuideState,
  StartStep,
} from '../../hooks/use-setup-guide'

function buildCurlCommand(args: {
  endpoint: string
  apiKey: string
  model: string
}): string {
  return [
    `curl ${args.endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${args.apiKey}" \\`,
    `  -d '{"model":"${args.model}","messages":[{"role":"user","content":"Say hello in one sentence."}]}'`,
  ].join('\n')
}

function StartStepItem(props: { step: StartStep; index: number }) {
  return (
    <li className='border-b last:border-b-0'>
      <Link
        to={props.step.to}
        className='hover:bg-accent/50 focus-visible:ring-ring flex items-start gap-4 py-4 outline-none focus-visible:ring-2'
      >
        <span
          className='text-primary flex w-6 shrink-0 items-center justify-center pt-0.5 font-mono text-sm'
          aria-hidden='true'
        >
          {props.step.completed ? (
            <Check className='size-4' />
          ) : (
            `0${props.index + 1}`
          )}
        </span>
        <span className='flex min-w-0 flex-1 flex-col gap-1'>
          <span className='text-sm font-medium'>{props.step.title}</span>
          <span className='text-muted-foreground text-xs leading-relaxed'>
            {props.step.description}
          </span>
        </span>
        <ArrowRight
          className='text-muted-foreground mt-1 size-4 shrink-0'
          aria-hidden='true'
        />
      </Link>
    </li>
  )
}

function RequestPreview(props: { example: RequestExample }) {
  const { t } = useTranslation()
  const [isCopying, setIsCopying] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const previewCurl = buildCurlCommand({
    endpoint: props.example.endpoint,
    apiKey: props.example.displayKey,
    model: props.example.model ?? '',
  })
  const previewLines = previewCurl.split('\n')
  const handleCopyRequest = async () => {
    if (!props.example.keyId || isCopying) return

    setIsCopying(true)
    try {
      const result = await fetchTokenKey(props.example.keyId)
      const key = result.success && result.data?.key ? result.data.key : ''
      if (!key) {
        handleServerError(result, t('Failed to copy to clipboard'))
        return
      }

      const realCurl = buildCurlCommand({
        endpoint: props.example.endpoint,
        apiKey: `sk-${key}`,
        model: props.example.model ?? '',
      })
      const copied = await copyToClipboard(realCurl)
      if (copied) {
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className='bg-background min-w-0 overflow-hidden rounded-lg border p-4 sm:p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <IconBadge tone='info'>
            <TerminalSquare />
          </IconBadge>
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>
              {t('First API request')}
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {props.example.ready
                ? props.example.keyName
                : t('Create an API key to unlock the real request')}
            </div>
          </div>
        </div>
        {props.example.ready ? (
          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1.5 px-2 text-xs'
            disabled={isCopying}
            onClick={handleCopyRequest}
            aria-label={t('Copy ready-to-run curl')}
          >
            <Copy data-icon='inline-start' />
            {isCopying ? t('Loading') : t('Copy')}
          </Button>
        ) : (
          <Button size='sm' variant='outline' render={<Link to='/keys' />}>
            {t('Create API Key')}
          </Button>
        )}
      </div>

      <div className='my-4 font-mono text-xs'>
        <div className='mb-2 flex items-center gap-1.5'>
          <span className='bg-destructive size-2 rounded-full' />
          <span className='bg-warning size-2 rounded-full' />
          <span className='bg-success size-2 rounded-full' />
        </div>
        <div
          role='region'
          aria-label={t('First API request')}
          tabIndex={0}
          className='focus-visible:ring-ring flex flex-col gap-2 overflow-x-auto py-2 outline-none focus-visible:ring-2'
        >
          {previewLines.map((line) => (
            <code
              key={line}
              className='text-muted-foreground whitespace-pre'
              title={line}
            >
              {line}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SetupGuide(props: { state: SetupGuideState }) {
  const { t } = useTranslation()
  const state = props.state

  return (
    <>
      <div id={state.setupGuideId} hidden={!state.setupGuideExpanded}>
        {state.setupGuideExpanded && (
          <CardStaggerContainer className='flex flex-col gap-5'>
            <CardStaggerItem className='bg-card h-full overflow-hidden rounded-lg border'>
              <div className='h-full p-5 sm:p-7'>
                <div
                  className={
                    state.requestExample.model
                      ? 'grid gap-7 lg:grid-cols-2 xl:gap-10'
                      : 'grid gap-7'
                  }
                >
                  <div className='flex min-w-0 flex-col gap-5'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='flex max-w-2xl flex-col gap-1'>
                        <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase'>
                          <ListChecks className='size-3.5' aria-hidden='true' />
                          {t('Get started')}
                        </div>
                        <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                          {t('Build on your API gateway in minutes')}
                        </h3>
                        <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
                          {t(
                            'A focused home for keys, balance, routing, and service health.'
                          )}
                        </p>
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          aria-expanded={state.setupGuideExpanded}
                          aria-controls={state.setupGuideId}
                          onClick={state.handleSetupGuideToggle}
                        >
                          <ChevronUp data-icon='inline-start' />
                          {t('Hide setup guide')}
                        </Button>
                        <Button size='sm' render={<Link to='/keys' />}>
                          <KeyRound data-icon='inline-start' />
                          {t('Create API Key')}
                        </Button>
                      </div>
                    </div>

                    <ol className='border-t'>
                      {state.startSteps.map((step, index) => (
                        <StartStepItem
                          key={step.title}
                          step={step}
                          index={index}
                        />
                      ))}
                    </ol>
                  </div>

                  {state.requestExample.model && (
                    <RequestPreview example={state.requestExample} />
                  )}
                </div>
              </div>
            </CardStaggerItem>
          </CardStaggerContainer>
        )}
      </div>
      {!state.setupGuideExpanded && !state.setupComplete && (
        <CardStaggerContainer>
          <CardStaggerItem className='bg-card overflow-hidden rounded-lg border'>
            <div className='relative overflow-hidden px-4 py-3 sm:px-5'>
              <div className='relative flex flex-wrap items-center justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-3'>
                  <span className='bg-background/70 flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-xs'>
                    <Check className='text-success size-4' aria-hidden='true' />
                  </span>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <h3 className='truncate text-sm font-semibold'>
                        {t('Setup guide')}
                      </h3>
                      <span className='text-muted-foreground bg-background/60 rounded-md border px-2 py-0.5 text-xs'>
                        {t('Setup progress: {{completed}}/{{total}}', {
                          completed: state.completedStepCount,
                          total: state.startSteps.length,
                        })}
                      </span>
                    </div>
                    <p className='text-muted-foreground line-clamp-1 text-xs'>
                      {t('Setup guide is collapsed. Expand it anytime.')}
                    </p>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='bg-background/70 h-8 min-w-28'
                    aria-expanded={state.setupGuideExpanded}
                    aria-controls={state.setupGuideId}
                    onClick={state.handleSetupGuideToggle}
                  >
                    <ChevronDown data-icon='inline-start' />
                    {t('Show setup guide')}
                  </Button>
                </div>
              </div>
            </div>
          </CardStaggerItem>
        </CardStaggerContainer>
      )}
    </>
  )
}
