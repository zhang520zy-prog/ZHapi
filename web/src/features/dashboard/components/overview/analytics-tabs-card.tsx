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
import { VChart } from '@visactor/react-vchart'
import { AreaChart, BarChart3, PieChart as PieChartIcon } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { processChartData } from '@/features/dashboard/lib'
import { buildMetricTrend } from '@/features/dashboard/lib/dashboard-range'
import type {
  DashboardFilters,
  QuotaDataItem,
} from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber } from '@/lib/format'
import { useThemeRadiusPx } from '@/lib/theme-radius'
import type { TimeGranularity } from '@/lib/time'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

const LazyUserCharts = lazy(() =>
  import('../users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

const LazyFlowCharts = lazy(() =>
  import('../flow/flow-charts').then((m) => ({
    default: m.FlowCharts,
  }))
)

type AnalyticsTab = 'distribution' | 'trend' | 'rank' | 'users' | 'flow'
type DistributionChartType = 'bar' | 'area'

const DISTRIBUTION_SPEC_KEYS: Record<
  DistributionChartType,
  'spec_line' | 'spec_area'
> = {
  bar: 'spec_line',
  area: 'spec_area',
}

const DISTRIBUTION_TYPE_ICONS = {
  bar: BarChart3,
  area: AreaChart,
} as const

function ChartFallback() {
  return (
    <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
      <Skeleton className='h-full w-full' />
    </div>
  )
}

interface AnalyticsTabsCardProps {
  data: QuotaDataItem[]
  loading: boolean
  granularity: TimeGranularity
  isAdmin: boolean
  rangeStartSec: number
  rangeEndSec: number
  flowFilters: DashboardFilters
  userTimeRange: { start_timestamp: number; end_timestamp: number }
}

export function AnalyticsTabsCard(props: AnalyticsTabsCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { resolvedTheme, themeReady } = useChartTheme()
  const { customization } = useThemeCustomization()
  const chartRadius = useThemeRadiusPx(
    '--radius-md',
    `${customization.preset}:${customization.radius}`
  )
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('distribution')
  const [distributionType, setDistributionType] =
    useState<DistributionChartType>('bar')

  const chartData = useMemo(
    () =>
      processChartData(
        props.loading ? [] : props.data,
        props.granularity,
        t,
        chartRadius
      ),
    [props.data, props.loading, props.granularity, t, chartRadius]
  )

  const chartTabs: { value: AnalyticsTab; labelKey: string }[] = useMemo(() => {
    const tabs: { value: AnalyticsTab; labelKey: string }[] = [
      { value: 'distribution', labelKey: 'Quota Distribution' },
      { value: 'trend', labelKey: 'Call Trend' },
      { value: 'rank', labelKey: 'Call Count Ranking' },
    ]
    if (props.isAdmin) {
      tabs.push(
        { value: 'users', labelKey: 'User Analytics' },
        { value: 'flow', labelKey: 'Flow' }
      )
    }
    return tabs
  }, [props.isAdmin])

  const isQuotaTab = activeTab === 'distribution'
  const totalDisplay = isQuotaTab
    ? chartData.totalQuotaDisplay
    : chartData.totalCountDisplay
  const peakDisplay = useMemo(() => {
    const buckets = buildMetricTrend(
      props.loading ? [] : props.data,
      isQuotaTab ? 'quota' : 'count',
      props.rangeStartSec,
      props.rangeEndSec,
      props.granularity
    )
    const peak = Math.max(0, ...buckets)
    return isQuotaTab
      ? formatQuotaWithCurrency(peak)
      : formatCompactNumber(peak, locale)
  }, [
    props.data,
    props.loading,
    isQuotaTab,
    props.rangeStartSec,
    props.rangeEndSec,
    props.granularity,
    locale,
  ])

  let specKey: 'spec_line' | 'spec_area' | 'spec_model_line' | 'spec_rank_bar' =
    'spec_model_line'
  if (activeTab === 'distribution') {
    specKey = DISTRIBUTION_SPEC_KEYS[distributionType]
  } else if (activeTab === 'rank') {
    specKey = 'spec_rank_bar'
  }
  const spec =
    activeTab === 'users' || activeTab === 'flow' ? null : chartData[specKey]
  const chartKey = [
    activeTab,
    distributionType,
    props.loading ? 'loading' : 'ready',
    props.data.length,
    resolvedTheme,
    customization.preset,
  ].join('-')

  const renderChartArea = (active: boolean) => {
    if (props.loading) return <Skeleton className='h-full w-full' />
    if (props.data.length === 0) {
      return (
        <EmptyState
          title={t('No data available')}
          className='h-full [&_>div]:min-h-0'
        />
      )
    }
    if (!themeReady || !spec || !active) return null
    return (
      <VChart
        key={chartKey}
        spec={{
          ...spec,
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          background: 'transparent',
        }}
        option={VCHART_OPTION}
      />
    )
  }

  return (
    <TitledCard
      title={t('Model analytics')}
      icon={<PieChartIcon />}
      iconTone='chart-4'
      disableHoverEffect
      action={
        <div className='text-muted-foreground flex items-center gap-3 text-xs'>
          <span>
            {t('Total:')} {totalDisplay}
          </span>
          <span>
            {t('Peak:')} {peakDisplay}
          </span>
        </div>
      }
      contentClassName='p-3 sm:p-5'
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AnalyticsTab)}
      >
        <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
          {chartTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='distribution' className='pt-3'>
          <div className='mb-2 flex justify-end'>
            <div className='bg-muted/60 inline-flex h-7 overflow-x-auto rounded-lg border p-0.5'>
              {(['bar', 'area'] as const).map((chartType) => {
                const Icon = DISTRIBUTION_TYPE_ICONS[chartType]
                return (
                  <button
                    key={chartType}
                    type='button'
                    onClick={() => setDistributionType(chartType)}
                    aria-label={
                      chartType === 'bar' ? t('Bar Chart') : t('Area Chart')
                    }
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                      distributionType === chartType
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className='size-3.5' />
                    {chartType === 'bar' ? t('Bar Chart') : t('Area Chart')}
                  </button>
                )
              })}
            </div>
          </div>
          <div className='h-[300px] sm:h-96'>{renderChartArea(true)}</div>
        </TabsContent>

        {(['trend', 'rank'] as const).map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className='pt-3'>
            <div className='h-[300px] sm:h-96'>
              {renderChartArea(activeTab === tabValue)}
            </div>
          </TabsContent>
        ))}

        {props.isAdmin && (
          <>
            <TabsContent value='users' className='pt-3'>
              <Suspense fallback={<ChartFallback />}>
                <LazyUserCharts
                  timeRange={props.userTimeRange}
                  timeGranularity={props.granularity}
                />
              </Suspense>
            </TabsContent>
            <TabsContent value='flow' className='pt-3'>
              <Suspense fallback={<ChartFallback />}>
                <LazyFlowCharts filters={props.flowFilters} />
              </Suspense>
            </TabsContent>
          </>
        )}
      </Tabs>
    </TitledCard>
  )
}
