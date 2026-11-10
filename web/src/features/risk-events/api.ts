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

export const RISK_CATEGORY_ENABLED = 1
export const RISK_CATEGORY_DISABLED = 2

export interface RiskWordCategory {
  id: number
  key: string
  name: string
  action: string
  word_count: number
  status: number
  version: number
  updated_at: number
  updated_by: number
}
export interface RiskUserState {
  level: number
  hits: number
  restricted_until: number
  disabled: boolean
  category_hits: Record<string, number>
}
export interface RiskImportPreview {
  total: number
  added: number
  duplicate: number
  invalid: number
  preview_id: string
}
export interface RiskImportResult {
  added: number
  duplicate: number
  invalid: number
}
export interface RiskCategoryUpdate {
  name: string
  action: string
  status: number
  expected_version: number
}
export type RiskImportMode = 'append' | 'replace'

export async function listRiskWordCategories() {
  const response = await api.get<ApiResponse<RiskWordCategory[]>>(
    '/api/risk/categories'
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load categories'))
  }
  return response.data.data
}
export async function createRiskWordCategory(request: {
  key: string
  name: string
  action: string
}) {
  const response = await api.post<ApiResponse<RiskWordCategory>>(
    '/api/risk/categories',
    request
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to create category'))
  }
  return response.data.data
}
export async function updateRiskWordCategory(
  id: number,
  request: RiskCategoryUpdate
) {
  const response = await api.put<ApiResponse<RiskWordCategory>>(
    `/api/risk/categories/${id}`,
    request
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to update category'))
  }
  return response.data.data
}
export async function deleteRiskWordCategory(
  id: number,
  expectedVersion: number
) {
  const response = await api.delete<ApiResponse<unknown>>(
    `/api/risk/categories/${id}`,
    { data: { expected_version: expectedVersion } }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to delete category'))
  }
}
export async function previewRiskWordImport(id: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  const response = await api.post<ApiResponse<RiskImportPreview>>(
    `/api/risk/categories/${id}/import/preview`,
    body
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to preview import'))
  }
  return response.data.data
}
export async function commitRiskWordImport(
  id: number,
  request: {
    preview_id: string
    mode: RiskImportMode
    expected_version: number
  }
) {
  const response = await api.post<ApiResponse<RiskImportResult>>(
    `/api/risk/categories/${id}/import/commit`,
    request
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to import words'))
  }
  return response.data.data
}
export async function exportRiskWords(id: number) {
  const response = await api.get<Blob>(`/api/risk/categories/${id}/export`, {
    responseType: 'blob',
  })
  return response.data
}
export async function getRiskUserState(userID: number) {
  const response = await api.get<ApiResponse<RiskUserState>>(
    `/api/risk/users/${userID}/state`
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load user state'))
  }
  return response.data.data
}
export async function revokeRiskRestriction(userID: number, reason: string) {
  const response = await api.post<ApiResponse<unknown>>(
    `/api/risk/users/${userID}/restriction/revoke`,
    { reason }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to revoke restriction'))
  }
}
export async function reenableRiskUser(userID: number, reason: string) {
  const response = await api.post<ApiResponse<unknown>>(
    `/api/risk/users/${userID}/reenable`,
    { reason }
  )
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to re-enable user'))
  }
}
