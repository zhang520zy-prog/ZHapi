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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type InvoiceStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'processing'
  | 'issued'
  | 'rejected'

export type InvoiceSettlement = 'balance' | 'direct'

export interface InvoiceTypeOption {
  key: string
  label?: string
  rate_bps: number
}

export interface InvoiceProfile {
  buyer_name: string
  tax_no: string
  category: string
  item: string
  email: string
  details: string
}

export interface InvoiceOptions {
  enabled: boolean
  min_cny: string
  max_cny: string
  /** CNY received via online payment — server-formatted "0.00" string. */
  received_cny: string
  /** Already invoiced, including in-flight requests. */
  invoiced_cny: string
  /** Remaining invoiceable amount; rejected requests release it. */
  invoiceable_cny: string
  types: InvoiceTypeOption[]
  categories?: string[]
  items?: string[]
  profile?: InvoiceProfile
  direct_pay?: boolean
}

export interface InvoiceRequest {
  id: number
  user_id: number
  buyer_name: string
  tax_no: string
  amount_cny: string
  fee_rate_bps: number
  fee_cny: string
  invoice_type: string
  category: string
  item: string
  email: string
  details: string
  status: InvoiceStatus
  review_note: string
  file_url: string
  version: number
  created_at: number
  updated_at: number
}

export interface CreateInvoiceInput {
  buyer_name: string
  tax_no?: string
  amount_cny: string
  invoice_type: string
  category?: string
  item: string
  email: string
  details?: string
  settlement?: InvoiceSettlement
}

export interface CreateInvoiceResult {
  invoice: InvoiceRequest
  payment_url?: string
  payment_params?: Record<string, unknown>
}

export async function getInvoiceOptions(): Promise<InvoiceOptions> {
  const res = await api.get('/api/user/invoices/options')
  return requireServerSuccess(res.data).data as InvoiceOptions
}

export async function listMyInvoices(params: {
  p?: number
  page_size?: number
  status?: string
}): Promise<{ items: InvoiceRequest[]; total: number }> {
  const res = await api.get('/api/user/invoices', { params })
  const data = requireServerSuccess(res.data).data as {
    items?: InvoiceRequest[]
    total?: number
  }
  return { items: data?.items ?? [], total: data?.total ?? 0 }
}

export async function createInvoice(
  input: CreateInvoiceInput
): Promise<CreateInvoiceResult> {
  const res = await api.post('/api/user/invoices', input)
  const data = requireServerSuccess(res.data).data as
    | InvoiceRequest
    | CreateInvoiceResult
  if (data && 'invoice' in data) {
    return data as CreateInvoiceResult
  }
  return { invoice: data as InvoiceRequest }
}

export async function adminListInvoices(params: {
  p?: number
  page_size?: number
  status?: string
}): Promise<{ items: InvoiceRequest[]; total: number }> {
  const res = await api.get('/api/invoice/admin/invoices', { params })
  const data = requireServerSuccess(res.data).data as {
    items?: InvoiceRequest[]
    total?: number
  }
  return { items: data?.items ?? [], total: data?.total ?? 0 }
}

export async function adminReviewInvoice(
  id: number,
  input: {
    action: 'processing' | 'issued' | 'rejected'
    note?: string
    file_url?: string
    expected_version: number
  }
): Promise<InvoiceRequest> {
  const res = await api.post(`/api/invoice/admin/invoices/${id}/review`, input)
  return requireServerSuccess(res.data).data as InvoiceRequest
}
