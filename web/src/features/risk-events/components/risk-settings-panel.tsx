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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  getSystemOptions,
  updateSystemOption,
} from '@/features/system-settings/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  RISK_LEVEL_COUNT,
  RISK_SETTINGS_DEFAULTS,
  riskSettingsSchema,
  type RiskSettingsValues,
} from '../lib/risk-settings-schema'

type DurationUnit = 'minutes' | 'hours' | 'days'
const UNIT_SECONDS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
}

interface DurationField {
  value: string
  unit: DurationUnit
}

interface SettingsFormState {
  checkEnabled: boolean
  checkPrompt: boolean
  checkCompletion: boolean
  hitThreshold: string
  firstWindow: DurationField
  escalationWindow: DurationField
  resetAfter: DurationField
  durations: DurationField[]
  notifyLevels: number[]
}

function secondsToField(seconds: number): DurationField {
  for (const unit of ['days', 'hours', 'minutes'] as const) {
    const factor = UNIT_SECONDS[unit]
    if (seconds % factor === 0) {
      return { value: String(seconds / factor), unit }
    }
  }
  return { value: String(seconds / 60), unit: 'minutes' }
}

function fieldToSeconds(field: DurationField): number {
  const amount = Number(field.value)
  if (!Number.isFinite(amount)) return Number.NaN
  return Math.round(amount * UNIT_SECONDS[field.unit])
}

function parseOptionInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'number' && Number.isFinite(parsed)
      ? parsed
      : fallback
  } catch {
    return fallback
  }
}

function parseOptionIntArray(
  value: string | undefined,
  fallback: number[]
): number[] {
  if (value === undefined) return fallback
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'number')
      ? (parsed as number[])
      : fallback
  } catch {
    return fallback
  }
}

const OPTION_LABEL_KEYS: Record<string, string> = {
  CheckSensitiveEnabled: 'Content check',
  CheckSensitiveOnPromptEnabled: 'Prompt check',
  CheckSensitiveOnCompletionEnabled: 'Completion check',
  'risk_setting.hit_threshold': 'Hit threshold',
  'risk_setting.first_window_seconds': 'Level 1 window',
  'risk_setting.escalation_window_seconds': 'Escalation window',
  'risk_setting.reset_after_seconds': 'Reset window',
  'risk_setting.level_durations_seconds': 'Restriction durations',
  'risk_setting.notify_levels': 'Notification levels',
}
type FieldKey =
  | 'hitThreshold'
  | 'firstWindowSeconds'
  | 'escalationWindowSeconds'
  | 'resetAfterSeconds'
  | 'levelDurationsSeconds'
  | 'notifyLevels'

class OptionSaveError extends Error {
  constructor(
    public optionKey: string,
    cause: unknown
  ) {
    super(String(cause))
    this.cause = cause
  }
}

export function RiskSettingsPanel() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const optionsQuery = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
    retry: false,
  })
  const options = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of optionsQuery.data?.data ?? []) {
      map.set(option.key, option.value)
    }
    return map
  }, [optionsQuery.data])

  const baseline = useMemo((): SettingsFormState | null => {
    if (!optionsQuery.data?.data) return null
    const get = (key: string) => options.get(key)
    const d = RISK_SETTINGS_DEFAULTS
    return {
      checkEnabled: get('CheckSensitiveEnabled') !== 'false',
      checkPrompt: get('CheckSensitiveOnPromptEnabled') !== 'false',
      checkCompletion: get('CheckSensitiveOnCompletionEnabled') !== 'false',
      hitThreshold: String(
        parseOptionInt(get('risk_setting.hit_threshold'), d.hitThreshold)
      ),
      firstWindow: secondsToField(
        parseOptionInt(
          get('risk_setting.first_window_seconds'),
          d.firstWindowSeconds
        )
      ),
      escalationWindow: secondsToField(
        parseOptionInt(
          get('risk_setting.escalation_window_seconds'),
          d.escalationWindowSeconds
        )
      ),
      resetAfter: secondsToField(
        parseOptionInt(
          get('risk_setting.reset_after_seconds'),
          d.resetAfterSeconds
        )
      ),
      durations: parseOptionIntArray(
        get('risk_setting.level_durations_seconds'),
        d.levelDurationsSeconds
      ).map(secondsToField),
      notifyLevels: parseOptionIntArray(
        get('risk_setting.notify_levels'),
        d.notifyLevels
      ),
    }
  }, [options, optionsQuery.data])

  const [form, setForm] = useState<SettingsFormState | null>(null)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const values = form ?? baseline
  const patch = (partial: Partial<SettingsFormState>) =>
    setForm({ ...(values as SettingsFormState), ...partial })

  const saveMutation = useMutation({
    mutationFn: async (changes: [string, string | boolean][]) => {
      for (const [key, value] of changes) {
        try {
          requireServerSuccess(await updateSystemOption({ key, value }))
        } catch (error) {
          throw new OptionSaveError(key, error)
        }
      }
    },
    onSuccess: async () => {
      toast.success(t('Saved successfully'))
      setForm(null)
      await client.invalidateQueries({ queryKey: ['system-options'] })
    },
    onError: async (error) => {
      if (error instanceof OptionSaveError) {
        const labelKey = OPTION_LABEL_KEYS[error.optionKey]
        toast.error(
          t('Failed to save {{name}}.', {
            name: labelKey ? t(labelKey) : error.optionKey,
          })
        )
        handleServerError(error.cause)
      } else {
        handleServerError(error, t('Failed to save settings'))
      }
      await client.invalidateQueries({ queryKey: ['system-options'] })
    },
  })

  if (optionsQuery.isPending) return <LoadingState />
  if (optionsQuery.isError || !values) {
    return (
      <ErrorState
        title={t('Failed to load settings')}
        onRetry={() => void optionsQuery.refetch()}
      />
    )
  }

  const canonical = (): RiskSettingsValues | null => {
    const hit = Number(values.hitThreshold)
    const candidate = {
      hitThreshold: Number.isFinite(hit) ? hit : Number.NaN,
      firstWindowSeconds: fieldToSeconds(values.firstWindow),
      escalationWindowSeconds: fieldToSeconds(values.escalationWindow),
      resetAfterSeconds: fieldToSeconds(values.resetAfter),
      levelDurationsSeconds: values.durations.map(fieldToSeconds),
      notifyLevels: values.notifyLevels,
    }
    const result = riskSettingsSchema.safeParse(candidate)
    if (result.success) {
      setErrors({})
      return result.data
    }
    const next: Partial<Record<FieldKey, string>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldKey | undefined
      if (!field || next[field]) continue
      if (field === 'hitThreshold') {
        next[field] = t('Enter a whole number between 1 and 100.')
      } else if (
        field === 'levelDurationsSeconds' &&
        issue.message === 'increasing'
      ) {
        next[field] = t('Durations must be strictly increasing.')
      } else {
        next[field] = t('Enter a duration between 60 seconds and 30 days.')
      }
    }
    setErrors(next)
    return null
  }

  const onSave = () => {
    const parsed = canonical()
    if (!parsed || !baseline) return
    const baselineCanonical: RiskSettingsValues = {
      hitThreshold: Number(baseline.hitThreshold),
      firstWindowSeconds: fieldToSeconds(baseline.firstWindow),
      escalationWindowSeconds: fieldToSeconds(baseline.escalationWindow),
      resetAfterSeconds: fieldToSeconds(baseline.resetAfter),
      levelDurationsSeconds: baseline.durations.map(fieldToSeconds),
      notifyLevels: baseline.notifyLevels,
    }
    const changes: [string, string | boolean][] = []
    if (values.checkEnabled !== baseline.checkEnabled) {
      changes.push(['CheckSensitiveEnabled', values.checkEnabled])
    }
    if (values.checkPrompt !== baseline.checkPrompt) {
      changes.push(['CheckSensitiveOnPromptEnabled', values.checkPrompt])
    }
    if (values.checkCompletion !== baseline.checkCompletion) {
      changes.push([
        'CheckSensitiveOnCompletionEnabled',
        values.checkCompletion,
      ])
    }
    if (parsed.hitThreshold !== baselineCanonical.hitThreshold) {
      changes.push(['risk_setting.hit_threshold', String(parsed.hitThreshold)])
    }
    if (parsed.firstWindowSeconds !== baselineCanonical.firstWindowSeconds) {
      changes.push([
        'risk_setting.first_window_seconds',
        String(parsed.firstWindowSeconds),
      ])
    }
    if (
      parsed.escalationWindowSeconds !==
      baselineCanonical.escalationWindowSeconds
    ) {
      changes.push([
        'risk_setting.escalation_window_seconds',
        String(parsed.escalationWindowSeconds),
      ])
    }
    if (parsed.resetAfterSeconds !== baselineCanonical.resetAfterSeconds) {
      changes.push([
        'risk_setting.reset_after_seconds',
        String(parsed.resetAfterSeconds),
      ])
    }
    if (
      JSON.stringify(parsed.levelDurationsSeconds) !==
      JSON.stringify(baselineCanonical.levelDurationsSeconds)
    ) {
      changes.push([
        'risk_setting.level_durations_seconds',
        JSON.stringify(parsed.levelDurationsSeconds),
      ])
    }
    if (
      JSON.stringify([...parsed.notifyLevels].sort()) !==
      JSON.stringify([...baselineCanonical.notifyLevels].sort())
    ) {
      changes.push([
        'risk_setting.notify_levels',
        JSON.stringify(parsed.notifyLevels),
      ])
    }
    if (!changes.length) {
      toast.info(t('Nothing to save'))
      return
    }
    saveMutation.mutate(changes)
  }

  const durationError = (key: FieldKey) =>
    errors[key] ? (
      <p role='alert' className='text-destructive text-xs'>
        {errors[key]}
      </p>
    ) : null

  return (
    <div className='max-w-2xl space-y-8'>
      <section className='space-y-3' aria-label={t('Content checks')}>
        <h3 className='font-medium'>{t('Content checks')}</h3>
        <CheckRow
          label={t('Enable content check')}
          description={t('Master switch for all sensitive-word checks.')}
          checked={values.checkEnabled}
          onChange={(checked) => patch({ checkEnabled: checked })}
        />
        <CheckRow
          label={t('Inspect prompts')}
          description={t('Requests stop immediately when a word is matched.')}
          checked={values.checkPrompt}
          disabled={!values.checkEnabled}
          onChange={(checked) => patch({ checkPrompt: checked })}
        />
        <CheckRow
          label={t('Inspect completions')}
          description={t('Responses stop immediately when a word is matched.')}
          checked={values.checkCompletion}
          disabled={!values.checkEnabled}
          onChange={(checked) => patch({ checkCompletion: checked })}
        />
      </section>

      <section className='space-y-4' aria-label={t('Restriction ladder')}>
        <div className='space-y-1'>
          <h3 className='font-medium'>{t('Restriction ladder')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Level 4 always disables the account. Keep these numbers in sync with the user agreement terms.'
            )}
          </p>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='risk-hit-threshold'>{t('Hit threshold')}</Label>
          <Input
            id='risk-hit-threshold'
            type='number'
            min={1}
            max={100}
            step={1}
            className='w-32'
            value={values.hitThreshold}
            aria-invalid={!!errors.hitThreshold}
            onChange={(event) => patch({ hitThreshold: event.target.value })}
          />
          <p className='text-muted-foreground text-xs'>
            {t('Hits within the window that raise the level, 1 to 100.')}
          </p>
          {durationError('hitThreshold')}
        </div>
        <DurationInput
          label={t('Level 1 window')}
          inputId='risk-first-window'
          description={t('Hits are counted within this window at level 1.')}
          field={values.firstWindow}
          error={durationError('firstWindowSeconds')}
          onChange={(field) => patch({ firstWindow: field })}
        />
        <DurationInput
          label={t('Escalation window')}
          inputId='risk-escalation-window'
          description={t('Hits are counted within this window above level 1.')}
          field={values.escalationWindow}
          error={durationError('escalationWindowSeconds')}
          onChange={(field) => patch({ escalationWindow: field })}
        />
        <DurationInput
          label={t('Reset window')}
          inputId='risk-reset-window'
          description={t(
            'The level returns to 1 after this long without hits.'
          )}
          field={values.resetAfter}
          error={durationError('resetAfterSeconds')}
          onChange={(field) => patch({ resetAfter: field })}
        />
        <div className='space-y-2'>
          <Label>{t('Restriction durations')}</Label>
          {values.durations.map((field, index) => (
            <div key={`level-${index + 1}`} className='flex items-center gap-3'>
              <span className='text-muted-foreground w-16 text-sm'>
                {t('Level {{level}}', { level: index + 1 })}
              </span>
              <DurationControl
                field={field}
                onChange={(next) => {
                  const durations = [...values.durations]
                  durations[index] = next
                  patch({ durations })
                }}
              />
            </div>
          ))}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Exactly three durations, strictly increasing, each between 60 seconds and 30 days.'
            )}
          </p>
          {durationError('levelDurationsSeconds')}
        </div>
      </section>

      <section className='space-y-3' aria-label={t('Notifications')}>
        <h3 className='font-medium'>{t('Notifications')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Notifies admins with risk review permission when a level is triggered (in-app and email).'
          )}
        </p>
        <div className='flex flex-wrap gap-4'>
          {Array.from({ length: RISK_LEVEL_COUNT }, (_, i) => i + 1).map(
            (level) => (
              <div key={level} className='flex items-center gap-2'>
                <Checkbox
                  id={`notify-level-${level}`}
                  checked={values.notifyLevels.includes(level)}
                  onCheckedChange={(checked) => {
                    const set = new Set(values.notifyLevels)
                    if (checked) set.add(level)
                    else set.delete(level)
                    patch({ notifyLevels: [...set].sort((a, b) => a - b) })
                  }}
                />
                <Label htmlFor={`notify-level-${level}`}>
                  {t('Level {{level}}', { level })}
                </Label>
              </div>
            )
          )}
        </div>
      </section>

      <Button onClick={onSave} disabled={saveMutation.isPending}>
        {t('Save')}
      </Button>
    </div>
  )
}

function CheckRow(props: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className='border-border/60 flex items-center justify-between gap-4 rounded-lg border p-3'>
      <div className='space-y-0.5'>
        <p className='text-sm font-medium'>{props.label}</p>
        <p className='text-muted-foreground text-xs'>{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
        aria-label={props.label}
      />
    </div>
  )
}

function DurationControl(props: {
  field: DurationField
  inputId?: string
  onChange: (field: DurationField) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex items-center gap-2'>
      <Input
        id={props.inputId}
        type='number'
        min={0}
        className='w-28'
        value={props.field.value}
        onChange={(event) =>
          props.onChange({ ...props.field, value: event.target.value })
        }
      />
      <Select
        items={[
          { value: 'minutes', label: t('Minutes') },
          { value: 'hours', label: t('Hours') },
          { value: 'days', label: t('Days') },
        ]}
        value={props.field.unit}
        onValueChange={(value) =>
          props.onChange({
            ...props.field,
            unit: (value ?? 'minutes') as DurationUnit,
          })
        }
      >
        <SelectTrigger aria-label={t('Duration unit')} className='w-28'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='minutes'>{t('Minutes')}</SelectItem>
          <SelectItem value='hours'>{t('Hours')}</SelectItem>
          <SelectItem value='days'>{t('Days')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function DurationInput(props: {
  label: string
  inputId: string
  description: string
  field: DurationField
  error?: React.ReactNode
  onChange: (field: DurationField) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={props.inputId}>{props.label}</Label>
      <DurationControl
        field={props.field}
        inputId={props.inputId}
        onChange={props.onChange}
      />
      <p className='text-muted-foreground text-xs'>{props.description}</p>
      {props.error}
    </div>
  )
}
