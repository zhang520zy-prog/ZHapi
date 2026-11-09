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
import type { UserProfile } from '@/features/profile/types'

export type BuiltinBindingId =
  | 'email'
  | 'wechat'
  | 'github'
  | 'google'
  | 'discord'
  | 'oidc'
  | 'telegram'
  | 'linuxdo'

/**
 * Built-in login-method bindings. `statusKey` is the /api/status flag that
 * gates visibility; `null` means the method is always offered. Shared by the
 * bindings grid and the "bound N" badge so the rules cannot drift.
 */
export const BUILTIN_BINDING_DEFS: {
  id: BuiltinBindingId
  field: keyof UserProfile & string
  statusKey: string | null
}[] = [
  { id: 'email', field: 'email', statusKey: null },
  { id: 'wechat', field: 'wechat_id', statusKey: 'wechat_login' },
  { id: 'github', field: 'github_id', statusKey: 'github_oauth' },
  { id: 'google', field: 'google_id', statusKey: 'google_oauth' },
  { id: 'discord', field: 'discord_id', statusKey: 'discord_oauth' },
  { id: 'oidc', field: 'oidc_id', statusKey: 'oidc_enabled' },
  { id: 'telegram', field: 'telegram_id', statusKey: 'telegram_oauth' },
  { id: 'linuxdo', field: 'linux_do_id', statusKey: 'linuxdo_oauth' },
]

export function isBindingEnabled(
  def: (typeof BUILTIN_BINDING_DEFS)[number],
  status: Record<string, unknown> | null | undefined
): boolean {
  return def.statusKey === null || Boolean(status?.[def.statusKey])
}
