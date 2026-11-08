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

const invoiceSchema = z.object({
  InvoiceEnabled: z.boolean(),
  InvoiceMinCNY: z.string().trim().min(1),
  InvoiceMaxCNY: z.string().trim().min(1),
  InvoiceFeeRateFastBps: z.coerce.number().int().min(0).max(10000),
  InvoiceFeeRateNormalBps: z.coerce.number().int().min(0).max(10000),
  InvoiceFeeRateVatBps: z.coerce.number().int().min(0).max(10000),
  InvoiceTypes: z.string(),
  InvoiceCategories: z.string(),
  InvoiceItems: z.string(),
})

type InvoiceFormValues = z.infer<typeof invoiceSchema>

type InvoiceSettingsSectionProps = {
  defaultValues: InvoiceFormValues
}

export function InvoiceSettingsSection({
  defaultValues,
}: InvoiceSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm({
    resolver: zodResolver(invoiceSchema),
    defaultValues,
  })
  useResetForm(form, defaultValues)

  const onSubmit = async (data: InvoiceFormValues) => {
    const updates = Object.entries(data).filter(
      ([key, value]) => value !== defaultValues[key as keyof InvoiceFormValues]
    )
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Invoicing')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='InvoiceEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable invoice requests')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Let users request invoices; the service fee is deducted from their balance.'
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
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='InvoiceMinCNY'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum invoice amount (CNY)')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='InvoiceMaxCNY'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Maximum invoice amount (CNY)')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <FormField
              control={form.control}
              name='InvoiceFeeRateFastBps'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Same-day fee (bps)')}</FormLabel>
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
                    {t('Standard invoice, same-day issuance; 1100 = 11%.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='InvoiceFeeRateNormalBps'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Standard fee (bps)')}</FormLabel>
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
                    {t('Standard invoice, 1–3 business days; 1000 = 10%.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='InvoiceFeeRateVatBps'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('VAT special fee (bps)')}</FormLabel>
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
                    {t('VAT special invoice; 1600 = 16%.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='InvoiceTypes'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Invoice types')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={
                      'normal_fast|Standard (same-day)|1100\nnormal|Standard (1–3 business days)|1000\nvat|VAT special|1600'
                    }
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'One type per line: key|label|fee_bps (basis points; 1100 = 11%). Leave empty to use the three fee fields above.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='InvoiceCategories'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Invoice categories')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormDescription>
                  {t(
                    'One category per line; shown in the category dropdown of the invoice form.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='InvoiceItems'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Invoice items')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormDescription>
                  {t(
                    'One item per line; shown in the invoice item dropdown of the invoice form.'
                  )}
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
