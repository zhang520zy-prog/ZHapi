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
import type { LucideIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'

import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Per-card chart color; drives the round icon tint and the trend color. */
export type MetricCardTone = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4'

const TONE_ICON_CLASSES: Record<MetricCardTone, string> = {
  'chart-1': 'bg-chart-1/14 text-chart-1',
  'chart-2': 'bg-chart-2/14 text-chart-2',
  'chart-3': 'bg-chart-3/14 text-chart-3',
  'chart-4': 'bg-chart-4/14 text-chart-4',
}

const TONE_TREND_CLASSES: Record<MetricCardTone, string> = {
  'chart-1': 'text-chart-1',
  'chart-2': 'text-chart-2',
  'chart-3': 'text-chart-3',
  'chart-4': 'text-chart-4',
}

export interface MetricCardStatus {
  label: ReactNode
  variant?: StatusVariant
}

export interface MetricCardProps {
  icon?: LucideIcon
  /** Chart color identity of this metric (icon tint + trend). */
  tone?: MetricCardTone
  title: ReactNode
  /** Pre-formatted value; callers should apply @/lib/currency / @/lib/format. */
  value: ReactNode
  description?: ReactNode
  /** Optional area-trend sparkline rendered under the value. */
  trend?: number[]
  /** Optional status chip shown on the title row. */
  status?: MetricCardStatus
  action?: ReactNode
  /** Optional footer row rendered at the bottom of the card. */
  footer?: ReactNode
  loading?: boolean
  className?: string
}

const TREND_WIDTH = 120
const TREND_HEIGHT = 48
const TREND_PADDING = 3

function MetricTrend(props: { values: number[]; tone: MetricCardTone }) {
  const gradientId = `metric-trend-${useId().replaceAll(':', '')}`
  const sanitized = props.values.map((value) => Math.max(0, Number(value) || 0))
  const max = Math.max(...sanitized)
  const min = Math.min(...sanitized)
  const range = max - min

  const points = sanitized.map((value, index) => {
    const x =
      sanitized.length === 1
        ? TREND_WIDTH / 2
        : (index / (sanitized.length - 1)) * TREND_WIDTH
    let normalized = 0.5
    if (range > 0) {
      normalized = (value - min) / range
    } else if (max <= 0) {
      normalized = 0
    }
    const y =
      TREND_HEIGHT -
      TREND_PADDING -
      normalized * (TREND_HEIGHT - TREND_PADDING * 2)
    return { x, y }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const firstPoint = points.at(0)
  const lastPoint = points.at(-1)
  if (!firstPoint || !lastPoint) return null
  const areaPath = `${linePath} L ${lastPoint.x} ${TREND_HEIGHT} L ${firstPoint.x} ${TREND_HEIGHT} Z`

  return (
    <svg
      viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      preserveAspectRatio='none'
      className={cn('h-12 w-full', TONE_TREND_CLASSES[props.tone])}
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={gradientId} x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0%' stopColor='currentColor' stopOpacity='0.24' />
          <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill='none'
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='1.5'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  )
}

/**
 * Common metric card: round chart-tinted icon + title row, large tabular
 * value, subtitle, optional 48px area trend and optional status chip. Values
 * are pre-formatted by the caller via @/lib/currency or @/lib/format.
 */
export function MetricCard(props: MetricCardProps) {
  const Icon = props.icon
  const tone = props.tone ?? 'chart-1'
  return (
    <Card data-slot='metric-card' className={cn('gap-0 py-0', props.className)}>
      <CardContent className='flex flex-col gap-2 p-4 sm:p-5'>
        <div className='flex items-center gap-2'>
          {Icon != null && (
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                TONE_ICON_CLASSES[tone]
              )}
              aria-hidden='true'
            >
              <Icon className='size-5' />
            </span>
          )}
          <div className='text-muted-foreground min-w-0 flex-1 truncate text-xs font-medium sm:text-sm'>
            {props.title}
          </div>
          {props.status != null && (
            <StatusBadge
              size='sm'
              showDot
              copyable={false}
              variant={props.status.variant ?? 'neutral'}
              label={
                typeof props.status.label === 'string'
                  ? props.status.label
                  : undefined
              }
              className='shrink-0'
            >
              {props.status.label}
            </StatusBadge>
          )}
          {props.action}
        </div>
        {props.loading ? (
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-7 w-24' />
            <Skeleton className='h-4 w-32' />
          </div>
        ) : (
          <div className='flex flex-col gap-1'>
            <div className='text-foreground font-mono text-[22px]/7 font-semibold tracking-tight break-all tabular-nums sm:text-[28px]/[34px]'>
              {props.value}
            </div>
            {props.description != null && (
              <p className='text-muted-foreground line-clamp-1 text-xs leading-relaxed sm:text-sm'>
                {props.description}
              </p>
            )}
          </div>
        )}
        {props.trend != null && props.trend.length > 0 && (
          <MetricTrend values={props.trend} tone={tone} />
        )}
        {props.footer != null && (
          <div className='border-border/60 border-t pt-2'>{props.footer}</div>
        )}
      </CardContent>
    </Card>
  )
}
