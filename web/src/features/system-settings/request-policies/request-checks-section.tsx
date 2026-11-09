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
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  SettingsForm,
  SettingsControlGroup,
  SettingsControlChildren,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSavePolicy } from './use-save-policy'

const sensitiveSchema = z.object({
  CheckSensitiveEnabled: z.boolean(),
  CheckSensitiveOnPromptEnabled: z.boolean(),
  SensitiveWords: z.string().optional(),
})

type SensitiveFormValues = z.infer<typeof sensitiveSchema>

type RequestChecksSectionProps = {
  defaultValues: SensitiveFormValues
}

export function RequestChecksSection({
  defaultValues,
}: RequestChecksSectionProps) {
  const { t } = useTranslation()
  const updateOption = useSavePolicy()
  const [testInput, setTestInput] = useState('')
  const form = useForm<SensitiveFormValues>({
    resolver: zodResolver(sensitiveSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const sensitiveWords = form.watch('SensitiveWords') ?? ''
  const filteringEnabled =
    form.watch('CheckSensitiveEnabled') &&
    form.watch('CheckSensitiveOnPromptEnabled')
  const testRules = useMemo(
    () =>
      sensitiveWords
        .split(/\r?\n/)
        .map((word) => word.trim())
        .filter(Boolean),
    [sensitiveWords]
  )
  const matchedRuleCount = useMemo(() => {
    const normalizedInput = testInput.toLowerCase()
    if (!normalizedInput) return 0
    return testRules.filter((rule) =>
      normalizedInput.includes(rule.toLowerCase())
    ).length
  }, [testInput, testRules])
  const testResult = (() => {
    if (!testInput.trim()) return null
    if (!filteringEnabled) {
      return (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Prompt text filtering is disabled in the current form values. This text would not be blocked by this filter.'
          )}
        </p>
      )
    }
    if (matchedRuleCount > 0) {
      return (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('{{count}} current rule(s) would block this request', {
              count: matchedRuleCount,
            })}
          </AlertDescription>
        </Alert>
      )
    }
    return (
      <p className='text-success text-xs'>
        {t('No current rule matches this text.')}
      </p>
    )
  })()

  const onSubmit = async (values: SensitiveFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof SensitiveFormValues]
    )

    try {
      if (updates.length > 0) {
        await updateOption.mutateAsync(
          Object.fromEntries(
            updates.map(([key, value]) => [key, String(value ?? '')])
          )
        )
      }
    } catch (error) {
      handleServerError(error)
    }
  }

  return (
    <SettingsSection title={t('Request checks')}>
      <p className='text-muted-foreground text-sm'>
        {t('Source: global settings. Changes take effect after saving.')}
      </p>
      <h3 className='text-sm font-medium'>{t('Request text filtering')}</h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Checks text extracted from supported requests against keywords, ignoring case. A match rejects the request before upstream processing and does not affect channel health. Images, audio and generated responses are not checked.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={form.formState.isSubmitting}
            saveLabel='Save sensitive words'
          />
          <Alert>
            <AlertDescription>
              {form.watch('CheckSensitiveEnabled') &&
              form.watch('CheckSensitiveOnPromptEnabled') &&
              form.watch('SensitiveWords')?.trim()
                ? t(
                    'Prompt text filtering is active with the current form values.'
                  )
                : t(
                    'Prompt text filtering needs both switches enabled and a non-empty keyword list.'
                  )}
            </AlertDescription>
          </Alert>
          <SettingsControlGroup>
            <FormField
              control={form.control}
              name='CheckSensitiveEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Enable filtering')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Blocks messages when sensitive keywords are detected.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <SettingsControlChildren>
              <FormField
                control={form.control}
                name='CheckSensitiveOnPromptEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Inspect user prompts')}</FormLabel>
                      <FormDescription>
                        {t(
                          'When enabled, prompts are scanned before reaching upstream models.'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        disabled={!form.watch('CheckSensitiveEnabled')}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
            </SettingsControlChildren>
          </SettingsControlGroup>

          <FormField
            control={form.control}
            name='SensitiveWords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Blocked keywords')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={12}
                    placeholder={t('Enter one keyword per line')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Each line represents one keyword. Leave blank to disable the list but keep the switch states.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3'>
            <div>
              <h3 className='text-sm font-medium'>{t('Rule test')}</h3>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
                {t(
                  'Paste harmless text to test the current form values locally. This test never calls upstream or consumes quota.'
                )}
              </p>
            </div>
            <Textarea
              rows={4}
              value={testInput}
              onChange={(event) => setTestInput(event.target.value)}
              placeholder={t('Enter harmless text to test the current rules')}
              aria-label={t('Rule test input')}
            />
            {testResult}
          </div>

          <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
            <span>{t('Review recorded policy events in request logs.')}</span>
            <Link
              className='text-primary underline underline-offset-4'
              to='/usage-logs/$section'
              params={{ section: 'common' }}
            >
              {t('Open request logs')}
            </Link>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
