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
import { t } from 'i18next'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export type RiskScope = 'all' | 'self'
export type ReviewStatus = 'pending' | 'confirmed' | 'false_positive'
export type RiskAction = 'record' | 'block' | 'restrict' | 'disable'
export interface RiskEvent {
  event_id: string
  user_id?: number
  token_id?: number
  model: string
  request_id: string
  category: string
  category_name?: string
  action: string
  rule_id?: string
  rule_version?: string
  created_at: number
  review_status: ReviewStatus
  reviewed_at: number
  review_reason?: string
  version: number
  restriction_until?: number
  stage?: string
  level?: number
}
export function riskStateQueryKey(userId: number | undefined) {
  return ['risk', userId, 'self', 'state'] as const
}
export interface RiskSelfState {
  level: number
  hits: number
  restricted_until: number
  disabled: boolean
  event_id?: string
  category_name?: string
}
export interface RiskAppeal {
  id: number
  reason: string
  created_at: number
  status: string
  outcome: string
  version: number
}
export interface RiskChange {
  id: number
  action: string
  status: string
  reason: string
  actor_id: number
  created_at: number
}
export interface RiskDetail {
  event: RiskEvent
  appeals: RiskAppeal[]
  changes?: RiskChange[]
}
export interface RiskFilters {
  p: number
  page_size: number
  status?: string
  model?: string
  request_id?: string
  user_id?: number
}
export interface RiskReview {
  expected_version: number
  status: Exclude<ReviewStatus, 'pending'>
  reason: string
  appeal_id?: number
  expected_appeal_version?: number
  restriction_seconds?: number
}

export async function getRiskEvents(scope: RiskScope, params: RiskFilters) {
  const response = await api.get<
    ApiResponse<{ items: RiskEvent[]; total: number }>
  >(scope === 'all' ? '/api/risk/' : '/api/risk/self', { params })
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load risk events'))
  }
  return response.data.data
}
export async function getRiskSelfState() {
  const response = await api.get<ApiResponse<RiskSelfState>>(
    '/api/risk/self/state'
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load risk events'))
  }
  return response.data.data
}
export async function getRiskDetail(scope: RiskScope, eventID: string) {
  const base = scope === 'all' ? '/api/risk/' : '/api/risk/self/'
  const response = await api.get<ApiResponse<RiskDetail>>(
    base + encodeURIComponent(eventID)
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load risk events'))
  }
  return response.data.data
}
export async function submitRiskAppeal(eventID: string, reason: string) {
  const response = await api.post<ApiResponse<RiskAppeal>>(
    `/api/risk/self/${encodeURIComponent(eventID)}/appeals`,
    { reason }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to submit appeal'))
  }
  return response.data.data
}
export async function reviewRiskEvent(eventID: string, request: RiskReview) {
  const response = await api.post<ApiResponse<RiskEvent>>(
    `/api/risk/${encodeURIComponent(eventID)}/review`,
    request
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to save review'))
  }
  return response.data.data
}
