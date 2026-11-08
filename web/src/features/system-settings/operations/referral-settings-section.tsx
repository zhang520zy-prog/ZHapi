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
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

const referralSchema = z.object({
  ReferralCommissionEnabled: z.boolean(),
  ReferralRateBps: z.coerce.number().int().min(0).max(10000),
  ReferralTermsExtra: z.string(),
})

type ReferralFormValues = z.infer<typeof referralSchema>

type ReferralSettingsSectionProps = {
  defaultValues: ReferralFormValues & {
    CommissionTermsVersion: number
  }
}

export function ReferralSettingsSection({
  defaultValues,
}: ReferralSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm({
    resolver: zodResolver(referralSchema),
    defaultValues,
  })
  useResetForm(form, defaultValues)

  const onSubmit = async (data: ReferralFormValues) => {
    const updates = (Object.entries(data) as [keyof ReferralFormValues, string | number | boolean][]).filter(
      ([key, value]) => value !== defaultValues[key]
    )
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Referral rewards')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <div>
            <h4 className='font-medium'>{t('Referral rewards')}</h4>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Rewards for inviting new users through a referral link.')}
            </p>
          </div>
          <FormField
            control={form.control}
            name='ReferralCommissionEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable referral rewards')}</FormLabel>
                  <FormDescription>
                    {t('Grant commission when an invited user completes a top-up.')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <FormField
              control={form.control}
              name='ReferralRateBps'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Referral rate (bps)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={field.value as number}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Basis points of the paid amount; 150 = 1.5%.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='ReferralTermsExtra'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Extra referral terms')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Appended to the referral rules. Saving a change bumps the referral rules version only.'
                  )}
                  {` ${t('Current terms version')}: ${defaultValues.CommissionTermsVersion}`}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
