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
import { useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const customerServiceSchema = z.object({
  CustomerService: z.string().optional(),
})

type CustomerServiceFormValues = z.infer<typeof customerServiceSchema>

type CustomerServiceSectionProps = {
  defaultValue: string
}

/**
 * "Contact support" content configured by the admin (group links, email,
 * Telegram, etc). Shown from the sidebar footer; supports Markdown.
 */
export function CustomerServiceSection({
  defaultValue,
}: CustomerServiceSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<CustomerServiceFormValues>({
    resolver: zodResolver(customerServiceSchema),
    defaultValues: {
      CustomerService: defaultValue ?? '',
    },
  })

  useEffect(() => {
    form.reset({ CustomerService: defaultValue ?? '' })
  }, [defaultValue, form])

  const onSubmit = async (values: CustomerServiceFormValues) => {
    const normalized = values.CustomerService ?? ''
    if (normalized === (defaultValue ?? '')) {
      return
    }
    await updateOption.mutateAsync({
      key: 'CustomerService',
      value: normalized,
    })
  }

  return (
    <SettingsSection title={t('Customer service')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save customer service'
          />
          <FormField
            control={form.control}
            name='CustomerService'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Contact information')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('QQ group: 123456789\nEmail: support@example.com\nTelegram: https://t.me/example')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Shown when users open Customer service in the sidebar footer. Markdown links are supported; leave empty to hide the entry.'
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
