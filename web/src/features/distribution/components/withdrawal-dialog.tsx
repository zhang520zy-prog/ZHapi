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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

import { requestDistributorWithdrawal, type DistributorWallet } from '../api'

const QUOTA_PER_USD = 500000
const METHOD_LABELS: Record<string, string> = {
  alipay: 'Alipay',
  wechat: 'WeChat Pay',
  bank: 'Bank card',
  usdt: 'USDT',
}

interface WithdrawalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wallet: DistributorWallet
  hasPending: boolean
}

export function WithdrawalDialog(props: WithdrawalDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const verification = useSecureVerification()
  const [amountUsd, setAmountUsd] = useState('')
  const [method, setMethod] = useState(props.wallet.methods[0] ?? 'alipay')
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [bank, setBank] = useState('')
  const [network, setNetwork] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const wallet = props.wallet
  const amountQuota = Math.round((Number(amountUsd) || 0) * QUOTA_PER_USD)
  const usdAmount = amountQuota / QUOTA_PER_USD

  const payoutEstimate = useMemo(() => {
    if (!usdAmount) return null
    if (method === 'usdt') return `${usdAmount.toFixed(2)} USDT`
    return `¥${(usdAmount * wallet.usd_exchange_rate).toFixed(2)}`
  }, [usdAmount, method, wallet.usd_exchange_rate])

  const submit = useMutation({
    mutationFn: async () => {
      let accountPayload: Record<string, string>
      if (method === 'usdt') {
        accountPayload = { network, address: account }
      } else if (method === 'bank') {
        accountPayload = { name, bank, account }
      } else {
        accountPayload = { name, account }
      }
      const proof = await verification.requestVerification({
        scope: 'distributor.withdraw',
        context: {
          amount_quota: amountQuota,
          method,
          payout_network: method === 'usdt' ? network : undefined,
        },
        title: t('Confirm withdrawal'),
        description: t(
          'Verify your identity to submit this withdrawal request.'
        ),
      })
      if (!proof) return false
      await requestDistributorWithdrawal(
        { amount_quota: amountQuota, method, account: accountPayload },
        proof.proof_token
      )
      return true
    },
    onSuccess: (done) => {
      if (!done) return
      toast.success(t('Withdrawal request submitted'))
      props.onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['distribution'] })
    },
    onError: (e) => handleServerError(AuthOperationError.from(e), t('Withdrawal request failed')),
    onSettled: () => setSubmitting(false),
  })

  const problems: string[] = []
  if (!wallet.withdraw_enabled) problems.push(t('Withdrawals are not open'))
  if (props.hasPending) problems.push(t('A pending withdrawal already exists'))
  if (amountQuota <= 0) {
    problems.push(t('Enter a valid amount'))
  } else if (amountQuota < wallet.min_withdraw_quota) {
    problems.push(`${t('Minimum withdrawal')} ${wallet.min_withdraw_cny}`)
  } else if (amountQuota > wallet.balance_quota) {
    problems.push(t('Amount exceeds withdrawable balance'))
  }
  if (method === 'usdt' && wallet.usdt_networks.length === 0) {
    problems.push(t('USDT payout is not open'))
  }
  const needsName = method !== 'usdt'
  const accountFilled = method === 'usdt' ? Boolean(network && account) : Boolean(account) && (!needsName || Boolean(name)) && (method !== 'bank' || Boolean(bank))
  const canSubmit = problems.length === 0 && accountFilled && !submitting

  return (
    <>
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Apply for withdrawal')}</DialogTitle>
          <DialogDescription>
            {t('Withdrawable balance')}: ${(wallet.balance_quota / QUOTA_PER_USD).toFixed(2)}
            {payoutEstimate ? ` · ${t('Estimated payout')} ${payoutEstimate}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label>{t('Payout method')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? method)}>
              <SelectTrigger>
                <SelectValue>{t(METHOD_LABELS[method] ?? method)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {wallet.methods.map((m) => (
                  <SelectItem
                    key={m}
                    value={m}
                    disabled={m === 'usdt' && wallet.usdt_networks.length === 0}
                  >
                    {t(METHOD_LABELS[m] ?? m)}
                    {m === 'usdt' && wallet.usdt_networks.length === 0
                      ? ` (${t('Not available yet')})`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Amount (USD)')}</Label>
            <Input
              type='number'
              min='0'
              step='0.01'
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
            />
          </div>
          {method === 'usdt' ? (
            <>
              <div className='space-y-1.5'>
                <Label>{t('Network')}</Label>
                {wallet.usdt_networks.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('Not available yet')}
                  </p>
                ) : (
                  <Select value={network} onValueChange={(v) => setNetwork(v ?? network)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select network')} />
                    </SelectTrigger>
                    <SelectContent>
                      {wallet.usdt_networks.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className='space-y-1.5'>
                <Label>{t('USDT address')}</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className='space-y-1.5'>
                <Label>{t('Recipient name')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {method === 'bank' && (
                <div className='space-y-1.5'>
                  <Label>{t('Bank name')}</Label>
                  <Input value={bank} onChange={(e) => setBank(e.target.value)} />
                </div>
              )}
              <div className='space-y-1.5'>
                <Label>
                  {method === 'alipay' && t('Alipay account')}
                  {method === 'wechat' && t('WeChat ID / payee code')}
                  {method === 'bank' && t('Bank account number')}
                </Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} />
              </div>
            </>
          )}
          {problems.length > 0 && (
            <p className='text-destructive text-xs'>{problems[0]}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              setSubmitting(true)
              submit.mutate()
            }}
          >
            {t('Submit withdrawal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
