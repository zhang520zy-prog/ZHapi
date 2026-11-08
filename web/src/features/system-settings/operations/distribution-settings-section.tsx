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

const distributionSchema = z.object({
  ReferralCommissionEnabled: z.boolean(),
  ReferralRateBps: z.coerce.number().int().min(0).max(10000),
  DistributorEnabled: z.boolean(),
  DistributorApplyEnabled: z.boolean(),
  DistributorDefaultRateBps: z.coerce.number().int().min(0).max(10000),
  DistributorHoldDays: z.coerce.number().int().min(0).max(365),
  DistributorWithdrawEnabled: z.boolean(),
  DistributorWithdrawMinCNY: z.string().trim(),
  DistributorWithdrawMethods: z.string().trim(),
  DistributorUsdtNetworks: z.string().trim(),
  ReferralTermsExtra: z.string(),
  DistributorTermsExtra: z.string(),
})

type DistributionFormValues = z.infer<typeof distributionSchema>

type DistributionSettingsSectionProps = {
  defaultValues: DistributionFormValues & {
    CommissionTermsVersion: number
    DistributorAgreementVersion: number
  }
}

function toCsv(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.join(', ')
  } catch {
    // fall through: treat as already comma separated
  }
  return raw
}

function toJsonList(raw: string): string {
  const items = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
  return JSON.stringify(items)
}

export function DistributionSettingsSection({
  defaultValues,
}: DistributionSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const formDefaults: DistributionFormValues = {
    ...defaultValues,
    DistributorWithdrawMethods: toCsv(defaultValues.DistributorWithdrawMethods),
    DistributorUsdtNetworks: toCsv(defaultValues.DistributorUsdtNetworks),
  }
  const form = useForm({
    resolver: zodResolver(distributionSchema),
    defaultValues: formDefaults,
  })
  useResetForm(form, formDefaults)

  const onSubmit = async (data: DistributionFormValues) => {
    const serialized: Record<string, string | number | boolean> = {
      ...data,
      DistributorWithdrawMethods: toJsonList(data.DistributorWithdrawMethods),
      DistributorUsdtNetworks: toJsonList(data.DistributorUsdtNetworks),
    }
    const updates = Object.entries(serialized).filter(([key]) => {
      if (key === 'DistributorWithdrawMethods') {
        return data.DistributorWithdrawMethods !== formDefaults.DistributorWithdrawMethods
      }
      if (key === 'DistributorUsdtNetworks') {
        return data.DistributorUsdtNetworks !== formDefaults.DistributorUsdtNetworks
      }
      return serialized[key] !== formDefaults[key as keyof DistributionFormValues]
    })
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  const switchField = (
    name: 'ReferralCommissionEnabled' | 'DistributorEnabled' | 'DistributorApplyEnabled' | 'DistributorWithdrawEnabled',
    label: string,
    description: string
  ) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <SettingsSwitchItem>
          <SettingsSwitchContent>
            <FormLabel>{t(label)}</FormLabel>
            <FormDescription>{t(description)}</FormDescription>
          </SettingsSwitchContent>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )

  const numberField = (
    name: 'ReferralRateBps' | 'DistributorDefaultRateBps' | 'DistributorHoldDays',
    label: string,
    description: string
  ) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(label)}</FormLabel>
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
          <FormDescription>{t(description)}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SettingsSection title={t('Referral & Distribution')}>
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
          {switchField(
            'ReferralCommissionEnabled',
            'Enable referral rewards',
            'Grant commission when an invited user completes a top-up.'
          )}
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            {numberField(
              'ReferralRateBps',
              'Referral rate (bps)',
              'Basis points of the paid amount; 150 = 1.5%.'
            )}
          </div>

          <div>
            <h4 className='font-medium'>{t('Distributor programme')}</h4>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Approved partners earn commission on their invitees’ top-ups.')}
            </p>
          </div>
          {switchField(
            'DistributorEnabled',
            'Enable distributor programme',
            'Master switch for distributor identity, wallet, and commissions.'
          )}
          {switchField(
            'DistributorApplyEnabled',
            'Open applications',
            'Allow users to submit distributor applications.'
          )}
          {switchField(
            'DistributorWithdrawEnabled',
            'Enable withdrawals',
            'Allow distributors to request payouts to external accounts.'
          )}
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            {numberField(
              'DistributorDefaultRateBps',
              'Default distributor rate (bps)',
              'Basis points; 1000 = 10%. Personal rates and campaigns override.'
            )}
            {numberField(
              'DistributorHoldDays',
              'Hold period (days)',
              'Days a commission stays frozen before it can be settled.'
            )}
            <FormField
              control={form.control}
              name='DistributorWithdrawMinCNY'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum withdrawal (CNY)')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Minimum payout amount in CNY equivalent.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='DistributorWithdrawMethods'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Withdrawal methods')}</FormLabel>
                  <FormControl>
                    <Input placeholder='alipay, wechat, bank, usdt' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Comma-separated: alipay, wechat, bank, usdt.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='DistributorUsdtNetworks'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('USDT networks')}</FormLabel>
                  <FormControl>
                    <Input placeholder='trc20, erc20' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Comma-separated USDT networks; empty hides the option.')}
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
          <FormField
            control={form.control}
            name='DistributorTermsExtra'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Extra distributor terms')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Appended to the distributor agreement. Saving a change bumps the agreement version and requires re-confirmation before withdrawals.'
                  )}
                  {` ${t('Current terms version')}: ${defaultValues.DistributorAgreementVersion}`}
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
