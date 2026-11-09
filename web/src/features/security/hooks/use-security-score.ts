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
import { useQuery } from '@tanstack/react-query'

import type { UserProfile } from '@/features/profile/types'
import { useStatus } from '@/hooks/use-status'

import { BUILTIN_BINDING_DEFS, isBindingEnabled } from '../lib/binding-defs'
import {
  customOAuthBindingsQueryOptions,
  passkeyStatusQueryOptions,
  twoFAStatusQueryOptions,
} from './queries'

export type SecurityScoreSection = 'bindings' | 'security'

export interface SecurityScoreItem {
  key: 'email' | 'passkey' | 'two-fa'
  labelKey: string
  completed: boolean
  section: SecurityScoreSection
}

export interface SecurityScore {
  completed: number
  total: number
  items: SecurityScoreItem[]
}

/**
 * Security health score: bound email + registered passkey + enabled 2FA.
 * When the site disables passkey login the passkey item is dropped and the
 * total becomes 2. Reads the same queries as PasskeyCard/TwoFACard so
 * mutations update the score without an extra request.
 */
export function useSecurityScore(profile: UserProfile | null): SecurityScore {
  const { status } = useStatus()
  const passkeyEnabled = Boolean(status?.passkey_login)
  const passkeyQuery = useQuery({
    ...passkeyStatusQueryOptions,
    enabled: passkeyEnabled,
  })
  const twoFAQuery = useQuery(twoFAStatusQueryOptions)

  const items: SecurityScoreItem[] = [
    {
      key: 'email',
      labelKey: 'Bind a security email',
      completed: Boolean(profile?.email),
      section: 'bindings',
    },
  ]
  if (passkeyEnabled) {
    items.push({
      key: 'passkey',
      labelKey: 'Register a passkey',
      completed: Boolean(passkeyQuery.data?.enabled),
      section: 'security',
    })
  }
  items.push({
    key: 'two-fa',
    labelKey: 'Enable two-factor authentication',
    completed: Boolean(twoFAQuery.data?.enabled),
    section: 'security',
  })

  const completed = items.filter((item) => item.completed).length
  return { completed, total: items.length, items }
}

/**
 * Number of bound login methods shown in the account bindings section:
 * enabled built-in methods that are bound, plus bound custom OAuth providers.
 */
export function useBoundBindingsCount(profile: UserProfile | null): number {
  const { status } = useStatus()
  const customProviders =
    (status?.custom_oauth_providers as unknown[] | undefined) ?? []
  const customBindingsQuery = useQuery({
    ...customOAuthBindingsQueryOptions,
    enabled: customProviders.length > 0,
  })

  const builtinBound = BUILTIN_BINDING_DEFS.filter(
    (def) => isBindingEnabled(def, status) && Boolean(profile?.[def.field])
  ).length
  return builtinBound + (customBindingsQuery.data?.length ?? 0)
}
