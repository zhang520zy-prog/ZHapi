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
import { queryOptions } from '@tanstack/react-query'

import { getPasskeyStatus } from '@/features/auth/passkey/api'
import type { PasskeyStatus } from '@/features/auth/passkey/types'
import { getSelfOAuthBindings } from '@/features/profile/api'
import { AuthOperationError } from '@/lib/secure-verification'

import { get2FAStatus } from '../api'

// Shared security queries. The security cards and the profile-page security
// score read the same keys, so one fetch serves both and mutations invalidate
// every observer at once.
export const passkeyStatusQueryOptions = queryOptions({
  queryKey: ['security', 'passkey', 'status'] as const,
  queryFn: async (): Promise<PasskeyStatus> => {
    const response = await getPasskeyStatus()
    if (!response.success || !response.data) {
      throw new AuthOperationError(
        response.message || 'Failed to load Passkey status'
      )
    }
    return response.data
  },
})

export const twoFAStatusQueryOptions = queryOptions({
  queryKey: ['security', '2fa', 'status'] as const,
  queryFn: () => get2FAStatus(),
})

export const customOAuthBindingsQueryOptions = queryOptions({
  queryKey: ['security', 'oauth-bindings'] as const,
  queryFn: async () => {
    try {
      const response = await getSelfOAuthBindings()
      return response.success ? (response.data ?? []) : []
    } catch {
      return []
    }
  },
})
