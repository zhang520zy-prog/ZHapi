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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'
import { getSelf } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPublicPlans } from '../subscriptions/api'
import { BillingTab } from './components/billing-tab'
import { RechargeTab } from './components/recharge-tab'
import { SubscriptionTab } from './components/subscription-tab'
import { useTopupInfo } from './hooks'
import type { UserWalletData } from './types'

const WALLET_TABS = ['topup', 'subscription', 'billing'] as const
type WalletTab = (typeof WALLET_TABS)[number]

export function Wallet() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/_authenticated/wallet/' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status } = useStatus()

  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()

  const userQuery = useQuery({
    queryKey: ['user', 'self'],
    queryFn: async () =>
      requireServerSuccess(await getSelf()).data as UserWalletData,
  })

  // Public plans gate the subscription tab: hidden only once the server has
  // confirmed there are no enabled plans; shown while the request is pending
  // so the tab does not flash in and out.
  const plansQuery = useQuery({
    queryKey: ['subscription', 'public-plans'],
    queryFn: async () =>
      requireServerSuccess(await getPublicPlans()).data ?? [],
    staleTime: 60_000,
    retry: false,
    meta: { errorToast: false },
  })
  const plansKnown = plansQuery.isSuccess
  const hasPlans = (plansQuery.data?.length ?? 0) > 0
  const showSubscriptionTab = !plansKnown || hasPlans

  const tabParam = search.tab ?? 'topup'
  const effectiveTab: WalletTab =
    tabParam === 'subscription' && plansKnown && !hasPlans ? 'topup' : tabParam

  // Legacy ?show_history=true deep links land on the billing tab and are
  // replaced so refreshes and back/forward behave like a normal tab switch.
  useEffect(() => {
    if (search.show_history) {
      void navigate({
        to: '/wallet',
        search: { tab: 'billing' },
        replace: true,
      })
    }
  }, [search.show_history, navigate])

  // ?tab=subscription without any enabled plans falls back to topup.
  useEffect(() => {
    if (tabParam === 'subscription' && plansKnown && !hasPlans) {
      void navigate({ to: '/wallet', search: {}, replace: true })
    }
  }, [tabParam, plansKnown, hasPlans, navigate])

  const switchTab = (value: string) => {
    const next: WalletTab = (WALLET_TABS as readonly string[]).includes(value)
      ? (value as WalletTab)
      : 'topup'
    void navigate({
      to: '/wallet',
      search: next === 'topup' ? {} : { tab: next },
    })
  }

  const refreshUser = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['user', 'self'] }),
    [queryClient]
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Tabs value={effectiveTab} onValueChange={switchTab}>
          <TabsList aria-label={t('Wallet sections')}>
            <TabsTrigger value='topup'>{t('Top Up')}</TabsTrigger>
            {showSubscriptionTab && (
              <TabsTrigger value='subscription'>
                {t('Subscription Plans')}
              </TabsTrigger>
            )}
            <TabsTrigger value='billing'>{t('Billing History')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {effectiveTab === 'topup' && (
          <RechargeTab
            user={userQuery.data ?? null}
            userLoading={userQuery.isPending}
            topupInfo={topupInfo}
            presetAmounts={presetAmounts}
            topupLoading={topupLoading}
            hasUserAgreement={status?.user_agreement_enabled === true}
            onBillingHistory={() => switchTab('billing')}
            onPaid={refreshUser}
          />
        )}
        {effectiveTab === 'subscription' && showSubscriptionTab && (
          <SubscriptionTab
            topupInfo={topupInfo}
            userQuota={userQuery.data?.quota}
            onPurchaseSuccess={refreshUser}
          />
        )}
        {effectiveTab === 'billing' && <BillingTab />}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
