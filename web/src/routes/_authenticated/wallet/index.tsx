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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { Wallet } from '@/features/wallet'

const walletSearchSchema = z.object({
  tab: z.enum(['topup', 'subscription', 'billing']).optional(),
  /** Legacy deep link — the wallet redirects it to ?tab=billing. */
  show_history: z.boolean().optional(),
  /** Billing tab filters — only meaningful with ?tab=billing. */
  kind: z
    .enum(['all', 'topup', 'subscription', 'invoice_fee'])
    .optional()
    .catch('all'),
  keyword: z.string().optional().catch(undefined),
  p: z.number().int().min(1).optional().catch(1),
})

export const Route = createFileRoute('/_authenticated/wallet/')({
  component: Wallet,
  validateSearch: walletSearchSchema,
})
