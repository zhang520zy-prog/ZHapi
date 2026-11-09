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
import { RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DateTimePicker } from '@/components/datetime-picker'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { FadeIn } from '@/components/page-transition'
import { TimeRangeSelector } from '@/components/time-range-selector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toIntlLocale } from '@/i18n/languages'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getUserQuotaDates } from './api'
import { AnalyticsTabsCard } from './components/overview/analytics-tabs-card'
import { AnnouncementsPanel } from './components/overview/announcements-panel'
import { ApiInfoPanel } from './components/overview/api-info-panel'
import { DashboardMetricCards } from './components/overview/dashboard-metric-cards'
import { FAQPanel } from './components/overview/faq-panel'
import { PerformanceHealthPanel } from './components/overview/performance-health-panel'
import { SetupGuide } from './components/overview/setup-guide'
import { UptimePanel } from './components/overview/uptime-panel'
import { useSetupGuideState } from './hooks/use-setup-guide'
import { useDashboardContentVisibility } from './hooks/use-status-data'
import {
  type DashboardRangeKey,
  getGreetingKey,
  getRunwayRange,
  resolveDashboardRange,
  sumUsageField,
} from './lib/dashboard-range'

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const guide = useSetupGuideState()
  const {
    apiInfo: showApiInfoPanel,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()

  // Wall clock for the greeting/date line — ticked once per minute. The range
  // itself is anchored separately so it doesn't slide every minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const [rangeKey, setRangeKey] = useState<DashboardRangeKey>('24h')
  const [rangeAnchor, setRangeAnchor] = useState(() => new Date())
  const [customRange, setCustomRange] = useState<{
    start?: Date
    end?: Date
  }>()
  const [customDraft, setCustomDraft] = useState<{
    start?: Date
    end?: Date
  }>({})
  const [customRangeOpen, setCustomRangeOpen] = useState(false)

  const range = useMemo(
    () => resolveDashboardRange(rangeKey, rangeAnchor, customRange),
    [rangeKey, rangeAnchor, customRange]
  )
  const runwayRange = useMemo(() => getRunwayRange(rangeAnchor), [rangeAnchor])

  const handleRangeChange = (key: DashboardRangeKey) => {
    setRangeKey(key)
    setRangeAnchor(new Date())
    if (key === 'custom') setCustomRangeOpen(true)
  }

  const handleCustomRangeApply = () => {
    if (!customDraft.start && !customDraft.end) return
    setCustomRange(customDraft)
    setRangeAnchor(new Date())
    setCustomRangeOpen(false)
  }

  const handleRefresh = () => {
    setRangeAnchor(new Date())
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // The dashboard always shows the current user's own usage (/self). Admin
  // site-wide analytics live in the user-analytics tab, not here.
  const usageQuery = useQuery({
    queryKey: [
      'dashboard',
      'usage',
      range.start_timestamp,
      range.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates(
          {
            start_timestamp: range.start_timestamp,
            end_timestamp: range.end_timestamp,
            default_time: range.granularity,
          },
          false
        )
      ),
    select: (res) => res.data ?? [],
    staleTime: 60_000,
  })

  const runwayQuery = useQuery({
    queryKey: [
      'dashboard',
      'quota-runway',
      runwayRange.start_timestamp,
      runwayRange.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates(
          {
            start_timestamp: runwayRange.start_timestamp,
            end_timestamp: runwayRange.end_timestamp,
            default_time: 'day',
          },
          false
        )
      ),
    select: (res) => res.data ?? [],
    staleTime: 60_000,
  })

  const usageData = usageQuery.data ?? []
  const runwayUsage = runwayQuery.isFetched
    ? sumUsageField(runwayQuery.data ?? [], 'quota')
    : undefined
  const usageLoading = usageQuery.isLoading

  const flowFilters = useMemo(
    () => ({
      start_timestamp: new Date(range.start_timestamp * 1000),
      end_timestamp: new Date(range.end_timestamp * 1000),
      time_granularity: range.granularity,
      username: '',
    }),
    [range.start_timestamp, range.end_timestamp, range.granularity]
  )
  const userTimeRange = useMemo(
    () => ({
      start_timestamp: range.start_timestamp,
      end_timestamp: range.end_timestamp,
    }),
    [range.start_timestamp, range.end_timestamp]
  )

  const showInfoLeft = showAnnouncementsPanel || showFAQPanel
  const showInfoRight = showApiInfoPanel || showUptimePanel || isAdmin
  const showInfoPanels = showInfoLeft || showInfoRight

  const greeting = `${t(getGreetingKey(now.getHours()))}${
    user?.username ? `, ${user.username}` : ''
  }`
  const dateLine = now.toLocaleString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{greeting}</SectionPageLayout.Title>
      <SectionPageLayout.Description>{dateLine}</SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <TimeRangeSelector
          value={rangeKey}
          onChange={handleRangeChange}
          onCustomSelect={() => setCustomRangeOpen(true)}
        />
        <Button
          variant='ghost'
          size='icon'
          onClick={handleRefresh}
          aria-label={t('Refresh')}
          className='text-muted-foreground hover:text-foreground size-8'
        >
          <RotateCw
            className={usageQuery.isFetching ? 'animate-spin' : undefined}
          />
        </Button>
        {guide.setupStatusReady && guide.setupComplete && (
          <Button
            ref={guide.setupGuideToggleRef}
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground h-auto min-h-7 max-w-[60vw] whitespace-normal'
            aria-expanded={guide.setupGuideExpanded}
            aria-controls={guide.setupGuideId}
            onClick={guide.handleSetupGuideToggle}
          >
            {t('Setup guide')}
          </Button>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <SetupGuide state={guide} />

          <FadeIn>
            {usageQuery.isError ? (
              <ErrorState
                title={t('Failed to load')}
                description={t('Please try again later.')}
                onRetry={() => {
                  void usageQuery.refetch()
                  void runwayQuery.refetch()
                }}
              />
            ) : (
              <DashboardMetricCards
                data={usageData}
                loading={usageLoading}
                rangeStartSec={range.start_timestamp}
                rangeEndSec={range.end_timestamp}
                granularity={range.granularity}
                remainQuota={Number(user?.quota ?? 0)}
                usedQuota={Number(user?.used_quota ?? 0)}
                requestCount={Number(user?.request_count ?? 0)}
                runwayUsage={runwayUsage}
                runwayLoading={runwayQuery.isLoading}
              />
            )}
          </FadeIn>

          <FadeIn delay={0.05}>
            <AnalyticsTabsCard
              data={usageData}
              loading={usageLoading}
              granularity={range.granularity}
              isAdmin={isAdmin}
              rangeStartSec={range.start_timestamp}
              rangeEndSec={range.end_timestamp}
              flowFilters={flowFilters}
              userTimeRange={userTimeRange}
            />
          </FadeIn>

          {showInfoPanels && (
            <FadeIn delay={0.1}>
              <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]'>
                {showInfoLeft ? (
                  <div className='flex min-w-0 flex-col gap-4'>
                    {showAnnouncementsPanel && <AnnouncementsPanel />}
                    {showFAQPanel && <FAQPanel />}
                  </div>
                ) : (
                  <div />
                )}
                <div className='flex min-w-0 flex-col gap-4'>
                  {showApiInfoPanel && <ApiInfoPanel />}
                  {showUptimePanel && <UptimePanel />}
                  {isAdmin && <PerformanceHealthPanel />}
                </div>
              </div>
            </FadeIn>
          )}
        </div>
      </SectionPageLayout.Content>

      <Dialog open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('Custom range')}</DialogTitle>
            <DialogDescription>
              {t('Pick a start and end time for the dashboard range.')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-3'>
            <label className='flex flex-col gap-1.5'>
              <span className='text-muted-foreground text-xs font-medium'>
                {t('Start time')}
              </span>
              <DateTimePicker
                value={customDraft.start}
                onChange={(date) =>
                  setCustomDraft((prev) => ({ ...prev, start: date }))
                }
              />
            </label>
            <label className='flex flex-col gap-1.5'>
              <span className='text-muted-foreground text-xs font-medium'>
                {t('End time')}
              </span>
              <DateTimePicker
                value={customDraft.end}
                onChange={(date) =>
                  setCustomDraft((prev) => ({ ...prev, end: date }))
                }
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCustomRangeOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleCustomRangeApply}>{t('Apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageLayout>
  )
}
