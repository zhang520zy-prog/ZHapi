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

export interface CommissionRecord {
  id: number
  program: string
  source_type: string
  source_id: number
  base_quota: number
  /** Backend returns the paid amount as a decimal string (varchar). */
  paid_money: string
  currency: string
  rate_bps: number
  rate_source: string
  campaign_id?: number
  commission_quota: number
  status: string
  display_status?: string
  hold_days: number
  available_at: number
  settlement_id?: number
  reversed_quota: number
  terms_version: number
  invitee?: string
  invitee_user_id?: number
  beneficiary_user_id?: number
  created_at: number
}

export interface CommissionSettlement {
  id: number
  program: string
  beneficiary_user_id: number
  trigger: string
  balance_type: string
  credited_quota: number
  balance_before: number
  balance_after: number
  debt_added_quota: number
  record_id?: number
  topup_id?: number
  operator_id: number
  note: string
  created_at: number
}

export interface CommissionDebt {
  user_id: number
  balance_type: string
  debt_quota: number
  total_debt_quota: number
  total_offset_quota: number
  updated_at: number
}

export interface CommissionCampaign {
  id: number
  program: string
  name: string
  rate_bps: number
  starts_at: number
  ends_at: number
  description: string
  status: string
  version: number
  created_at: number
}

export interface ReferralSummary {
  enabled: boolean
  invited_count: number
  total_commission: number
  frozen_quota: number
  frozen_count: number
  reversed_quota: number
  topup_base: number
  rate_bps: number
  rate_source: string
  campaign?: CommissionCampaign | null
  debt?: CommissionDebt | null
}

export interface InviteeRow {
  username: string
  created_at: number
  topup_quota: number
}

export interface CommissionTerms {
  referral_rules_version: number
  my_referral_read_version: number
  referral_rate_bps: number
  referral_extra: string
  referral_enabled: boolean
}

function ensure<T>(response: { data: ApiResponse<T> }, fallback: string): T {
  if (!response.data.success || response.data.data === undefined) {
    throw createServerError(response.data, fallback)
  }
  return response.data.data
}

// ---------- 用户侧：推广 ----------

export const getReferralSummary = () =>
  api
    .get<ApiResponse<ReferralSummary>>('/api/user/commission/summary')
    .then((r) => ensure(r, t('Failed to load referral summary')))

export const getReferralRecords = (params: {
  p: number
  page_size: number
  status?: string
}) =>
  api
    .get<ApiResponse<{ items: CommissionRecord[]; total: number }>>(
      '/api/user/commission/records',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load records')))

export const getReferralInvitees = (params: { p: number; page_size: number }) =>
  api
    .get<ApiResponse<{ items: InviteeRow[]; total: number }>>(
      '/api/user/commission/invitees',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load invitees')))

export const getReferralSettlements = (params: {
  p: number
  page_size: number
}) =>
  api
    .get<ApiResponse<{ items: CommissionSettlement[]; total: number }>>(
      '/api/user/commission/settlements',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load settlements')))

export const transferReferral = (amountQuota: number) =>
  api
    .post<ApiResponse<unknown>>('/api/user/commission/transfer', {
      amount_quota: amountQuota,
    })
    .then((r) => ensure(r, t('Transfer failed')))

export const getCommissionTerms = () =>
  api
    .get<ApiResponse<CommissionTerms>>('/api/commission/terms')
    .then((r) => ensure(r, t('Failed to load terms')))

export const markTermsRead = () =>
  api
    .post<ApiResponse<unknown>>('/api/user/commission/terms/read', {
      doc: 'referral',
    })
    .then((r) => ensure(r, t('Failed to record terms read')))

// ---------- 管理端 ----------

export const adminListRecords = (params: {
  p: number
  page_size: number
  program: 'referral'
  status?: string
  user_id?: number
}) =>
  api
    .get<ApiResponse<{ items: CommissionRecord[]; total: number }>>(
      '/api/commission/admin/records',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load records')))

export const adminConfirmCommissions = (input: {
  ids: number[]
  reason?: string
}) =>
  api
    .post<ApiResponse<unknown>>('/api/commission/admin/confirm', input)
    .then((r) => ensure(r, t('Confirmation failed')))

export const adminReverseRecord = (id: number, input: { reason: string }) =>
  api
    .post<ApiResponse<unknown>>(
      `/api/commission/admin/records/${id}/reverse`,
      input
    )
    .then((r) => ensure(r, t('Reversal failed')))

export const adminListSettlements = (params: {
  p: number
  page_size: number
  program: 'referral'
  user_id?: number
}) =>
  api
    .get<ApiResponse<{ items: CommissionSettlement[]; total: number }>>(
      '/api/commission/admin/settlements',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load settlements')))

export const adminListDebts = (params: {
  p: number
  page_size: number
  program: 'referral'
}) =>
  api
    .get<ApiResponse<{ items: CommissionDebt[]; total: number }>>(
      '/api/commission/admin/debts',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load debts')))

export const adminWaiveDebt = (
  userId: number,
  input: { balance_type: string; amount_quota: number; reason: string }
) =>
  api
    .post<ApiResponse<unknown>>(
      `/api/commission/admin/debts/${userId}/waive`,
      input
    )
    .then((r) => ensure(r, t('Waive failed')))

export const adminBackfill = (input: { topup_ids: number[] }) =>
  api
    .post<ApiResponse<unknown>>('/api/commission/admin/backfill', input)
    .then((r) => ensure(r, t('Backfill failed')))

export const adminListCampaigns = (params: {
  p: number
  page_size: number
  program: 'referral'
}) =>
  api
    .get<ApiResponse<{ items: CommissionCampaign[]; total: number }>>(
      '/api/commission/admin/campaigns',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load campaigns')))

export const adminCreateCampaign = (input: {
  name: string
  program: 'referral'
  rate_bps: number
  starts_at: number
  ends_at: number
  description?: string
  confirm_high_rate?: boolean
}) =>
  api
    .post<ApiResponse<unknown>>('/api/commission/admin/campaigns', input)
    .then((r) => ensure(r, t('Creation failed')))

export const adminUpdateCampaign = (
  id: number,
  input: {
    name: string
    rate_bps: number
    starts_at: number
    ends_at: number
    description?: string
    confirm_high_rate?: boolean
    expected_version: number
  }
) =>
  api
    .put<ApiResponse<unknown>>(`/api/commission/admin/campaigns/${id}`, input)
    .then((r) => ensure(r, t('Update failed')))

export const adminCancelCampaign = (id: number, expectedVersion: number) =>
  api
    .post<ApiResponse<unknown>>(
      `/api/commission/admin/campaigns/${id}/cancel`,
      {
        expected_version: expectedVersion,
      }
    )
    .then((r) => ensure(r, t('Cancel failed')))
