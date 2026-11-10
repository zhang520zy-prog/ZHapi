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
import type { TFunction } from 'i18next'

import type { StatusVariant } from '@/components/status-badge'

import type { RiskAppeal } from './api'

export type AppealSummaryStatus = 'none' | 'pending' | 'accepted' | 'rejected'

export function latestAppealStatus(appeals: RiskAppeal[]): AppealSummaryStatus {
  const latest = appeals.reduce<RiskAppeal | null>(
    (current, appeal) =>
      !current ||
      appeal.created_at > current.created_at ||
      (appeal.created_at === current.created_at && appeal.id > current.id)
        ? appeal
        : current,
    null
  )
  if (!latest) return 'none'
  if (latest.status === 'pending') return 'pending'
  if (latest.status === 'resolved' && latest.outcome === 'false_positive') {
    return 'accepted'
  }
  return 'rejected'
}

export function appealStatusLabel(
  status: AppealSummaryStatus,
  t: TFunction
): string {
  switch (status) {
    case 'none':
      return t('Not appealed')
    case 'pending':
      return t('Appeal in progress')
    case 'accepted':
      return t('Appeal accepted')
    default:
      return t('Appeal rejected')
  }
}

export function riskStatusLabel(status: string, t: TFunction) {
  switch (status) {
    case 'pending':
      return t('Pending review')
    case 'confirmed':
      return t('Confirmed violation')
    case 'false_positive':
      return t('False positive')
    case 'resolved':
      return t('Resolved')
    default:
      return status
  }
}

export function riskActionLabel(action: string, t: TFunction) {
  switch (action) {
    case 'record':
      return t('Recorded')
    case 'block':
      return t('Blocked')
    case 'restrict':
      return t('Restricted')
    case 'disable':
      return t('Account disabled')
    default:
      return action
  }
}

export function riskActionVariant(action: string): StatusVariant {
  switch (action) {
    case 'block':
      return 'warning'
    case 'restrict':
    case 'disable':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function restrictionDurationText(seconds: number, t: TFunction): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) {
    return minutes === 1
      ? t('1 minute')
      : t('{{count}} minutes', { count: minutes })
  }
  const hours = Math.round(minutes / 60)
  if (hours < 48) {
    return hours === 1 ? t('1 hour') : t('{{count}} hours', { count: hours })
  }
  const days = Math.round(hours / 24)
  return days === 1 ? t('1 day') : t('{{count}} days', { count: days })
}

export function riskActionText(
  action: string,
  restrictionUntil: number | undefined,
  createdAt: number,
  t: TFunction
): string {
  const label = riskActionLabel(action, t)
  if (action === 'restrict' && restrictionUntil && restrictionUntil > 0) {
    const seconds = restrictionUntil - createdAt
    if (seconds > 0) {
      return t('Restricted for {{duration}}', {
        duration: restrictionDurationText(seconds, t),
      })
    }
  }
  return label
}

export function riskStageLabel(
  stage: string | undefined,
  t: TFunction
): string {
  switch (stage) {
    case 'input':
      return t('Input')
    case 'output':
      return t('Output')
    default:
      return '—'
  }
}

export function riskLevelLabel(
  level: number | undefined,
  t: TFunction
): string {
  if (!level || level <= 0) return '—'
  return t('Level {{level}}', { level })
}

export function riskCategoryActionLabel(action: string, t: TFunction): string {
  switch (action) {
    case 'record':
      return t('Record only')
    case 'block':
      return t('Block requests')
    case 'block_restrict':
      return t('Block and restrict')
    default:
      return action
  }
}

/**
 * 阶梯自动触发的限制/停用：事件带 restriction_until 但尚未经过人工审核。
 * 人工确认后 review_status 变为 confirmed，不再标记自动。
 */
export function isAutoRestriction(event: {
  action: string
  restriction_until?: number
  review_status: string
}): boolean {
  if (event.review_status !== 'pending') return false
  if (event.action === 'disable') return true
  return (
    event.action === 'restrict' &&
    !!event.restriction_until &&
    event.restriction_until > 0
  )
}
