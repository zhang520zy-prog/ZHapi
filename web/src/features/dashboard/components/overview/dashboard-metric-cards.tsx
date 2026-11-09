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
import { Link } from '@tanstack/react-router'
import { Activity, Coins, Gauge, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { MetricCard } from '@/components/metric-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import type { TimeGranularity } from '@/lib/time'
import { cn } from '@/lib/utils'

import {
  buildMetricTrend,
  formatRunwayDays,
  getQuotaHealth,
  getQuotaHealthBadgeVariant,
  getQuotaHealthLabelKey,
  sumUsageField,
} from '../../lib'
import type { QuotaDataItem } from '../../types'

interface DashboardMetricCardsProps {
  data: QuotaDataItem[]
  loading: boolean
  rangeStartSec: number
  rangeEndSec: number
  granularity: TimeGranularity
  /** Remaining quota (`user.quota`). */
  remainQuota: number
  /** Lifetime consumption (`user.used_quota`). */
  usedQuota: number
  /** Lifetime request count (`user.request_count`). */
  requestCount: number
  /** Total quota consumed over the last 7 days; undefined while loading. */
  runwayUsage?: number
  runwayLoading: boolean
}

export function DashboardMetricCards(props: DashboardMetricCardsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const rangeQuota = useMemo(
    () => sumUsageField(props.data, 'quota'),
    [props.data]
  )
  const rangeCount = useMemo(
    () => sumUsageField(props.data, 'count'),
    [props.data]
  )
  const rangeTokens = useMemo(
    () => sumUsageField(props.data, 'token_used'),
    [props.data]
  )

  const rangeMinutes = Math.max(
    1,
    (props.rangeEndSec - props.rangeStartSec) / 60
  )
  const avgRpm = rangeCount / rangeMinutes
  const avgTpm = rangeTokens / rangeMinutes

  const quotaTrend = useMemo(
    () =>
      buildMetricTrend(
        props.data,
        'quota',
        props.rangeStartSec,
        props.rangeEndSec,
        props.granularity
      ),
    [props.data, props.rangeStartSec, props.rangeEndSec, props.granularity]
  )
  const countTrend = useMemo(
    () =>
      buildMetricTrend(
        props.data,
        'count',
        props.rangeStartSec,
        props.rangeEndSec,
        props.granularity
      ),
    [props.data, props.rangeStartSec, props.rangeEndSec, props.granularity]
  )

  const health = getQuotaHealth(props.remainQuota, props.runwayUsage ?? 0)

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      <MetricCard
        icon={Gauge}
        tone='chart-1'
        title={t('Performance metrics')}
        value={formatNumber(avgRpm, locale)}
        description={t('Avg TPM: {{value}}', {
          value: formatCompactNumber(avgTpm, locale),
        })}
        trend={countTrend}
        loading={props.loading}
      />
      <MetricCard
        icon={Coins}
        tone='chart-2'
        title={t('Historical consumption')}
        value={formatQuotaWithCurrency(props.usedQuota)}
        description={`${t('Consumed in the selected range')}: ${formatQuotaWithCurrency(rangeQuota)}`}
        trend={quotaTrend}
        loading={props.loading}
      />
      <MetricCard
        icon={Activity}
        tone='chart-3'
        title={t('Request Count')}
        value={formatNumber(rangeCount, locale)}
        description={t('Total requests: {{count}}', {
          count: formatNumber(props.requestCount, locale),
        })}
        trend={countTrend}
        loading={props.loading}
      />
      <MetricCard
        icon={Wallet}
        tone='chart-4'
        title={t('Remaining balance')}
        value={formatQuotaWithCurrency(props.remainQuota)}
        description={
          props.runwayLoading
            ? t('Loading')
            : `${formatRunwayDays(health.daysLeft, t)} · ${formatCompactNumber(rangeTokens, locale)} ${t('tokens')}`
        }
        status={
          props.runwayLoading
            ? undefined
            : {
                label: t(getQuotaHealthLabelKey(health.level)),
                variant: getQuotaHealthBadgeVariant(health.level),
              }
        }
        footer={
          <Link
            to='/wallet'
            className={cn(
              'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors'
            )}
          >
            {t('My Wallet')}
          </Link>
        }
        loading={props.loading}
      />
    </div>
  )
}
