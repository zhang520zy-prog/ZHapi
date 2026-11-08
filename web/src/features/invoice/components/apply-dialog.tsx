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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { submitPaymentForm } from '@/features/wallet/lib/payment'
import { useSystemConfig } from '@/hooks/use-system-config'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  createInvoice,
  type InvoiceOptions,
  type InvoiceSettlement,
} from '../api'

const QUOTA_PER_USD = 500000

const INVOICE_TYPE_LABELS: Record<string, string> = {
  normal_fast: 'Standard invoice (same-day issuance)',
  normal: 'Standard invoice (1–3 business days)',
  vat: 'VAT special invoice',
}

const INVOICE_CATEGORIES = [
  'Production & living services',
  'Information technology services',
  'Software services',
]

const INVOICE_ITEMS = [
  'Technical service fee',
  'Information service fee',
  'Software service fee',
]

const invoiceSchema = z.object({
  buyer_name: z.string().trim().min(1).max(128),
  tax_no: z.string().trim().max(64).optional(),
  amount_cny: z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+(\.\d{1,2})?$/, 'invalid amount'),
  invoice_type: z.string().min(1),
  category: z.string().max(64).optional(),
  item: z.string().trim().min(1).max(64),
  email: z.string().trim().email().max(128),
  details: z.string().trim().max(2000).optional(),
})

type InvoiceFormValues = z.infer<typeof invoiceSchema>

interface ApplyInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: InvoiceOptions
}

export function ApplyInvoiceDialog(props: ApplyInvoiceDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.auth.user)
  const { currency } = useSystemConfig()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [settlement, setSettlement] = useState<InvoiceSettlement>('balance')

  const profile = props.options.profile
  const categories =
    props.options.categories?.length
      ? props.options.categories
      : INVOICE_CATEGORIES
  const items =
    props.options.items?.length ? props.options.items : INVOICE_ITEMS

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      buyer_name: profile?.buyer_name ?? '',
      tax_no: profile?.tax_no ?? '',
      amount_cny: '',
      invoice_type: props.options.types[1]?.key ?? props.options.types[0]?.key ?? 'normal',
      category:
        (profile?.category && categories.includes(profile.category)
          ? profile.category
          : categories[0]) ?? '',
      item:
        (profile?.item && items.includes(profile.item)
          ? profile.item
          : items[0]) ?? '',
      email: profile?.email || (user?.email ?? ''),
      details: profile?.details ?? '',
    },
  })

  const amountCny = Number(form.watch('amount_cny')) || 0
  const invoiceType = form.watch('invoice_type')
  const rateBps =
    props.options.types.find((x) => x.key === invoiceType)?.rate_bps ?? 0
  const feeCny = useMemo(
    () => Math.round(amountCny * rateBps) / 10000,
    [amountCny, rateBps]
  )
  const minCny = Number(props.options.min_cny) || 0
  const maxCny = Number(props.options.max_cny) || 0
  const usdExchangeRate = currency?.usdExchangeRate || 1
  const balanceUsd = (user?.quota ?? 0) / QUOTA_PER_USD

  const amountInRange = amountCny >= minCny && amountCny <= maxCny
  const insufficientBalance =
    feeCny > 0 && feeCny / usdExchangeRate > balanceUsd

  const submit = useMutation({
    mutationFn: (values: InvoiceFormValues) =>
      createInvoice({ ...values, settlement }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      props.onOpenChange(false)
      form.reset()
      if (result.payment_url && result.payment_params) {
        toast.success(
          t('Invoice request created — finish payment to send it for review')
        )
        submitPaymentForm(result.payment_url, result.payment_params)
        return
      }
      toast.success(t('Invoice request submitted'))
    },
    onError: (e) => handleServerError(e, t('Invoice request failed')),
  })

  const errors = form.formState.errors
  let submitLabel = t('Review & submit')
  if (submit.isPending) {
    submitLabel = t('Submitting…')
  } else if (settlement === 'direct') {
    submitLabel = t('Create & pay')
  }
  const canSubmit = Boolean(
    form.watch('buyer_name')?.trim() &&
      amountCny > 0 &&
      amountInRange &&
      form.watch('item')?.trim() &&
      form.watch('email')?.trim()
  )

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] sm:max-w-2xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('Apply for invoice')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={form.handleSubmit(
            (v) => submit.mutate(v),
            () => toast.error(t('Please complete the required fields'))
          )}
        >
          <div className='space-y-1.5'>
            <Label htmlFor='invoice-buyer'>
              {t('Buyer name')} <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='invoice-buyer'
              placeholder={t('Company, individual or overseas company name')}
              {...form.register('buyer_name')}
            />
            {errors.buyer_name ? (
              <p className='text-destructive text-xs'>{t('Required')}</p>
            ) : null}
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='invoice-tax-no'>{t('Taxpayer ID')}</Label>
            <Input
              id='invoice-tax-no'
              placeholder={t(
                'Leave blank for individuals or overseas companies without a tax ID'
              )}
              {...form.register('tax_no')}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='invoice-amount'>
              {t('Invoice amount (CNY)')}{' '}
              <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='invoice-amount'
              type='number'
              min='0'
              step='0.01'
              placeholder='1000.00'
              {...form.register('amount_cny')}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Amount range')} ¥{props.options.min_cny} – ¥
              {props.options.max_cny}
            </p>
            {amountCny > 0 && !amountInRange ? (
              <p className='text-destructive text-xs'>
                {t('Amount is out of range')}
              </p>
            ) : null}
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>
                {t('Invoice type')} <span className='text-destructive'>*</span>
              </Label>
              <Select
                value={invoiceType}
                onValueChange={(v) =>
                  form.setValue('invoice_type', v ?? invoiceType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {(() => {
                      const opt = props.options.types.find(
                        (x) => x.key === invoiceType
                      )
                      if (!opt) return invoiceType
                      return `${t(opt.label || INVOICE_TYPE_LABELS[opt.key] || opt.key)} · ${t('fee')} ${(opt.rate_bps / 100).toFixed(0)}%`
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {props.options.types.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {t(opt.label || INVOICE_TYPE_LABELS[opt.key] || opt.key)}{' '}
                      · {t('fee')} {(opt.rate_bps / 100).toFixed(0)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Invoice category')}</Label>
              <Select
                value={form.watch('category')}
                onValueChange={(v) => form.setValue('category', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue>{t(form.watch('category') ?? '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>
              {t('Invoice item')} <span className='text-destructive'>*</span>
            </Label>
            <Select
              value={form.watch('item')}
              onValueChange={(v) =>
                form.setValue('item', v ?? '', { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue>{t(form.watch('item'))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it} value={it}>
                    {t(it)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='invoice-email'>
              {t('Receiving email')} <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='invoice-email'
              type='email'
              {...form.register('email')}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'The issued invoice will be sent to this email and can also be downloaded here.'
              )}
            </p>
            {errors.email ? (
              <p className='text-destructive text-xs'>
                {t('Enter a valid email address')}
              </p>
            ) : null}
          </div>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger
              type='button'
              className='text-muted-foreground hover:text-foreground flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm'
            >
              {t('Invoice details (optional)')}
              <ChevronDown
                aria-hidden='true'
                className={`size-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-2'>
              <Textarea
                rows={3}
                placeholder={t('Order numbers, remarks, etc.')}
                {...form.register('details')}
              />
            </CollapsibleContent>
          </Collapsible>
          <div className='bg-muted/40 space-y-1 rounded-md px-3 py-2.5 text-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>
                {t('Service fee')}{' '}
                <span className='text-xs'>
                  {t('rate')} {(rateBps / 100).toFixed(0)}%
                </span>
              </span>
              <span className='font-semibold tabular-nums'>
                ¥{feeCny.toFixed(2)}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>
                {t('Available balance')}
              </span>
              <span className='tabular-nums'>
                {formatQuotaWithCurrency(user?.quota ?? 0)}
              </span>
            </div>
          </div>
          {props.options.direct_pay ? (
            <div className='space-y-1.5'>
              <Label>{t('Fee settlement')}</Label>
              <div className='grid gap-2 sm:grid-cols-2'>
                <button
                  type='button'
                  onClick={() => setSettlement('balance')}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    settlement === 'balance'
                      ? 'border-primary bg-primary/10'
                      : 'border-input hover:bg-muted/60'
                  }`}
                >
                  <div className='font-medium'>{t('Pay from balance')}</div>
                  <div className='text-muted-foreground text-xs'>
                    {formatQuotaWithCurrency(user?.quota ?? 0)}
                  </div>
                </button>
                <button
                  type='button'
                  onClick={() => setSettlement('direct')}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    settlement === 'direct'
                      ? 'border-primary bg-primary/10'
                      : 'border-input hover:bg-muted/60'
                  }`}
                >
                  <div className='font-medium'>{t('Pay now')}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Checkout online for the fee')}
                  </div>
                </button>
              </div>
            </div>
          ) : null}
          {settlement === 'balance' && insufficientBalance ? (
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-destructive text-xs'>
                {t('Balance is below the invoice fee')}
                {props.options.direct_pay ? ` — ${t('choose Pay now instead')}` : ''}
              </p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => window.open('/wallet', '_blank')}
              >
                {t('Top up & pay')}
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                !canSubmit ||
                !amountInRange ||
                (settlement === 'balance' && insufficientBalance) ||
                submit.isPending
              }
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
