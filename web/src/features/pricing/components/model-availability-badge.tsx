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
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  getAvailabilityLevel,
  type AvailabilityLevel,
} from '../lib/availability'
import type { ModelPerfBadgeData } from './model-perf-badge'

// ----------------------------------------------------------------------------
// 24h availability: status dot + percentage (status-token colors only)
// ----------------------------------------------------------------------------

const LEVEL_DOT_CLASS: Record<AvailabilityLevel, string> = {
  normal: 'bg-success',
  low: 'bg-warning',
  critical: 'bg-destructive',
  none: 'bg-muted-foreground',
}

const LEVEL_TEXT_CLASS: Record<AvailabilityLevel, string> = {
  normal: 'text-success',
  low: 'text-warning',
  critical: 'text-destructive',
  none: 'text-muted-foreground',
}

export interface ModelAvailabilityBadgeProps {
  perf: ModelPerfBadgeData | undefined
  className?: string
}

export const ModelAvailabilityBadge = memo(function ModelAvailabilityBadge(
  props: ModelAvailabilityBadgeProps
) {
  const { t } = useTranslation()
  const rate = props.perf?.success_rate
  const level = getAvailabilityLevel(rate)

  if (level === 'none' || rate == null) {
    return (
      <span
        className={cn(
          'text-muted-foreground inline-flex items-center gap-1.5 text-xs',
          props.className
        )}
      >
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', LEVEL_DOT_CLASS.none)}
        />
        {t('No data')}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums',
        LEVEL_TEXT_CLASS[level],
        props.className
      )}
      title={t('24h availability')}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', LEVEL_DOT_CLASS[level])}
      />
      {rate.toFixed(2)}%
    </span>
  )
})
