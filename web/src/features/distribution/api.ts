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
  paid_money: number
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

export interface DistributorSummary {
  profile?: DistributorProfile | null
  invited_count: number
  rate_bps: number
  rate_source: string
  campaign?: CommissionCampaign | null
  hold_days: number
  debt?: CommissionDebt | null
  due_count: number
  due_quota: number
  frozen_quota: number
  frozen_count: number
  settled_quota: number
  reversed_quota: number
  topup_base: number
}

export interface InviteeRow {
  username: string
  created_at: number
  topup_quota: number
}

export interface DistributorStatus {
  enabled: boolean
  apply_enabled: boolean
  status: string
  profile?: DistributorProfile | null
  application?: DistributorApplication | null
  referral_rules_version: number
  agreement_version: number
  agreed_version: number
  needs_reconfirm: boolean
  reapply_at?: number
}

export interface DistributorProfile {
  user_id: number
  dist_code?: string | null
  status: string
  rate_bps?: number
  hold_days?: number
  balance_quota: number
  withdrawing_quota: number
  total_withdrawn_quota: number
  total_transferred_quota: number
  approved_at: number
  username?: string
  email?: string
  version: number
  created_at: number
}

export interface DistributorApplication {
  id: number
  user_id: number
  username?: string
  status: string
  contact: string
  channel_desc: string
  reviewer_id?: number
  review_note?: string
  reviewed_at?: number
  agreed_terms_version: number
  version: number
  created_at: number
}

export interface DistributorWallet {
  balance_quota: number
  withdrawing_quota: number
  total_withdrawn_quota: number
  total_transferred_quota: number
  debt_quota: number
  withdraw_enabled: boolean
  min_withdraw_quota: number
  min_withdraw_cny: string
  usd_exchange_rate: number
  methods: string[]
  usdt_networks: string[]
}

export interface DistributorWithdrawal {
  id: number
  user_id?: number
  username?: string
  amount_quota: number
  payout_amount: string
  payout_currency: string
  fx_rate: string
  method: string
  usdt_network?: string
  status: string
  review_note?: string
  masked_account?: string
  account?: Record<string, string>
  paid_ref?: string
  version: number
  created_at: number
}

export interface TrendPoint {
  day: number
  commission_quota: number
  count: number
}

export interface CommissionTerms {
  referral_rules_version: number
  distributor_agreement_version: number
  my_referral_read_version: number
  my_agreement_version: number
  referral_rate_bps: number
  distributor_default_rate: number
  distributor_hold_days: number
  my_distributor_rate_bps?: number | null
  distributor_withdraw_min: number
  distributor_withdraw_enabled: boolean
  referral_extra: string
  distributor_extra: string
  referral_enabled: boolean
  distributor_enabled: boolean
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

export const getReferralTrend = (days: number) =>
  api
    .get<ApiResponse<TrendPoint[]>>('/api/user/commission/trend', {
      params: { days },
    })
    .then((r) => ensure(r, t('Failed to load trend')))

export const getReferralRecords = (params: { p: number; page_size: number; status?: string }) =>
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

export const getReferralSettlements = (params: { p: number; page_size: number }) =>
  api
    .get<ApiResponse<{ items: CommissionSettlement[]; total: number }>>(
      '/api/user/commission/settlements',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load settlements')))

export const getCommissionDebt = () =>
  api
    .get<ApiResponse<CommissionDebt | null>>('/api/user/commission/debt')
    .then((r) => ensure(r, t('Failed to load debt')))

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

export const getActiveCampaigns = () =>
  api
    .get<ApiResponse<CommissionCampaign[]>>('/api/commission/campaigns/active')
    .then((r) => ensure(r, t('Failed to load campaigns')))

// ---------- 用户侧：分销 ----------

export const getSelfDistributor = () =>
  api
    .get<ApiResponse<DistributorStatus>>('/api/user/distributor')
    .then((r) => ensure(r, t('Failed to load distributor status')))

export const submitDistributorApplication = (input: {
  contact: string
  channel_desc: string
  agreed_terms_version: number
}) =>
  api
    .post<ApiResponse<{ id: number }>>('/api/user/distributor/applications', input)
    .then((r) => ensure(r, t('Application submission failed')))

export const withdrawDistributorApplication = (id: number) =>
  api
    .post<ApiResponse<unknown>>(`/api/user/distributor/applications/${id}/withdraw`)
    .then((r) => ensure(r, t('Withdrawal failed')))

export const ackDistributorAgreement = (version: number) =>
  api
    .post<ApiResponse<unknown>>('/api/user/distributor/agreement/ack', { version })
    .then((r) => ensure(r, t('Acknowledgement failed')))

export const markTermsRead = (doc: 'referral' | 'distributor') =>
  api
    .post<ApiResponse<unknown>>('/api/user/commission/terms/read', { doc })
    .then((r) => ensure(r, t('Failed to record terms read')))

export const getDistributorSummary = () =>
  api
    .get<ApiResponse<DistributorSummary>>(
      '/api/user/distributor/summary'
    )
    .then((r) => ensure(r, t('Failed to load summary')))

export const getDistributorTrend = (days: number) =>
  api
    .get<ApiResponse<TrendPoint[]>>('/api/user/distributor/trend', {
      params: { days },
    })
    .then((r) => ensure(r, t('Failed to load trend')))

export const getDistributorInvitees = (params: { p: number; page_size: number }) =>
  api
    .get<ApiResponse<{ items: InviteeRow[]; total: number }>>(
      '/api/user/distributor/invitees',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load invitees')))

export const getDistributorCommissions = (params: { p: number; page_size: number; status?: string }) =>
  api
    .get<ApiResponse<{ items: CommissionRecord[]; total: number }>>(
      '/api/user/distributor/commissions',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load commissions')))

export const getDistributorSettlements = (params: { p: number; page_size: number }) =>
  api
    .get<ApiResponse<{ items: CommissionSettlement[]; total: number }>>(
      '/api/user/distributor/settlements',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load settlements')))

export const getDistributorWallet = () =>
  api
    .get<ApiResponse<DistributorWallet>>('/api/user/distributor/wallet')
    .then((r) => ensure(r, t('Failed to load wallet')))

export const requestDistributorWithdrawal = (
  input: {
    amount_quota: number
    method: string
    account: Record<string, string>
  },
  proofToken: string
) =>
  api
    .post<ApiResponse<{ id: number }>>('/api/user/distributor/withdrawals', input, {
      headers: { 'X-Security-Proof': proofToken },
    })
    .then((r) => ensure(r, t('Withdrawal request failed')))

export const getDistributorWithdrawals = (params: { p: number; page_size: number }) =>
  api
    .get<ApiResponse<{ items: DistributorWithdrawal[]; total: number }>>(
      '/api/user/distributor/withdrawals',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load withdrawals')))

export const transferDistributorBalance = (amountQuota: number) =>
  api
    .post<ApiResponse<unknown>>('/api/user/distributor/transfer', {
      amount_quota: amountQuota,
    })
    .then((r) => ensure(r, t('Transfer failed')))

// ---------- 管理端 ----------

export const adminListApplications = (params: {
  p: number
  page_size: number
  status?: string
}) =>
  api
    .get<ApiResponse<{ items: DistributorApplication[]; total: number }>>(
      '/api/distributor/admin/applications',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load applications')))

export const adminReviewApplication = (
  id: number,
  input: { action: string; note?: string; expected_version: number }
) =>
  api
    .post<ApiResponse<unknown>>(`/api/distributor/admin/applications/${id}/review`, input)
    .then((r) => ensure(r, t('Review failed')))

export const adminListProfiles = (params: { p: number; page_size: number; status?: string }) =>
  api
    .get<ApiResponse<{ items: DistributorProfile[]; total: number }>>(
      '/api/distributor/admin/profiles',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load profiles')))

export const adminUpdateProfile = (
  userId: number,
  input: {
    status?: string
    rate_bps?: number | null
    hold_days?: number | null
    note?: string
    expected_version: number
  }
) =>
  api
    .put<ApiResponse<unknown>>(`/api/distributor/admin/profiles/${userId}`, input)
    .then((r) => ensure(r, t('Update failed')))

export const adminListRecords = (params: {
  p: number
  page_size: number
  program: 'referral' | 'distributor' | 'all'
  status?: string
  user_id?: number
}) =>
  api
    .get<ApiResponse<{ items: CommissionRecord[]; total: number }>>(
      '/api/commission/admin/records',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load records')))

export const adminDueSummary = () =>
  api
    .get<ApiResponse<{ due_count: number; due_quota: number }>>(
      '/api/commission/admin/due-summary'
    )
    .then((r) => ensure(r, t('Failed to load due summary')))

export const adminConfirmCommissions = (input: { ids: number[]; reason?: string }) =>
  api
    .post<ApiResponse<unknown>>('/api/commission/admin/confirm', input)
    .then((r) => ensure(r, t('Confirmation failed')))

export const adminAdjustAvailableAt = (id: number, input: { available_at: number; reason: string }) =>
  api
    .put<ApiResponse<unknown>>(`/api/commission/admin/records/${id}/available_at`, input)
    .then((r) => ensure(r, t('Adjustment failed')))

export const adminReverseRecord = (id: number, input: { reason: string }) =>
  api
    .post<ApiResponse<unknown>>(`/api/commission/admin/records/${id}/reverse`, input)
    .then((r) => ensure(r, t('Reversal failed')))

export const adminListSettlements = (params: { p: number; page_size: number; program: 'referral' | 'distributor' | 'all'; user_id?: number }) =>
  api
    .get<ApiResponse<{ items: CommissionSettlement[]; total: number }>>(
      '/api/commission/admin/settlements',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load settlements')))

export const adminListDebts = (params: { p: number; page_size: number; program: 'referral' | 'distributor' | 'all' }) =>
  api
    .get<ApiResponse<{ items: CommissionDebt[]; total: number }>>(
      '/api/commission/admin/debts',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load debts')))

export const adminWaiveDebt = (userId: number, input: { balance_type: string; amount_quota: number; reason: string }) =>
  api
    .post<ApiResponse<unknown>>(`/api/commission/admin/debts/${userId}/waive`, input)
    .then((r) => ensure(r, t('Waive failed')))

export const adminBackfill = (input: { topup_ids: number[] }) =>
  api
    .post<ApiResponse<unknown>>('/api/commission/admin/backfill', input)
    .then((r) => ensure(r, t('Backfill failed')))

export const adminListCampaigns = (params: { p: number; page_size: number; program: 'referral' | 'distributor' | 'all' }) =>
  api
    .get<ApiResponse<{ items: CommissionCampaign[]; total: number }>>(
      '/api/commission/admin/campaigns',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load campaigns')))

export const adminCreateCampaign = (input: {
  name: string
  program: string
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
    .post<ApiResponse<unknown>>(`/api/commission/admin/campaigns/${id}/cancel`, {
      expected_version: expectedVersion,
    })
    .then((r) => ensure(r, t('Cancel failed')))

export const adminListWithdrawals = (params: { p: number; page_size: number; status?: string }) =>
  api
    .get<ApiResponse<{ items: DistributorWithdrawal[]; total: number }>>(
      '/api/distributor/admin/withdrawals',
      { params }
    )
    .then((r) => ensure(r, t('Failed to load withdrawals')))

export const adminGetWithdrawal = (id: number) =>
  api
    .get<ApiResponse<DistributorWithdrawal>>(`/api/distributor/admin/withdrawals/${id}`)
    .then((r) => ensure(r, t('Failed to load withdrawal')))

export const adminReviewWithdrawal = (id: number, input: { action: string; note?: string; expected_version: number }) =>
  api
    .post<ApiResponse<unknown>>(`/api/distributor/admin/withdrawals/${id}/review`, input)
    .then((r) => ensure(r, t('Review failed')))

export const adminMarkWithdrawalPaid = (id: number, input: { paid_ref: string; note?: string; expected_version: number }) =>
  api
    .post<ApiResponse<unknown>>(`/api/distributor/admin/withdrawals/${id}/paid`, input)
    .then((r) => ensure(r, t('Mark paid failed')))

export const adminSettleOutProfile = (
  userId: number,
  input: {
    frozen: 'confirm' | 'reverse'
    balance: 'transfer' | 'payout'
    payout_method?: string
    payout_ref?: string
    payout_currency?: string
    payout_amount?: string
    payout_network?: string
    account?: Record<string, string>
    reason: string
  }
) =>
  api
    .post<ApiResponse<unknown>>(`/api/distributor/admin/profiles/${userId}/settle_out`, input)
    .then((r) => ensure(r, t('Settle-out failed')))
