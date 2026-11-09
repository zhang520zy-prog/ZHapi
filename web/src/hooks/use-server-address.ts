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
import { useStatus } from '@/hooks/use-status'

/**
 * Resolve the public API base URL from a `/api/status` payload.
 *
 * Reads `server_address` (and the camelCase / nested-`data` spellings some
 * payloads still carry) and trims whitespace. Falls back to
 * `window.location.origin` when the field is missing — the same origin the
 * app is served from. Callers that append paths to the value must strip
 * trailing slashes themselves, matching the /docs page's requirement.
 */
export function resolveServerAddress(status: unknown): string {
  const record = status as Record<string, unknown> | null | undefined
  const nested = record?.data as Record<string, unknown> | undefined
  const candidate =
    record?.server_address ??
    record?.serverAddress ??
    nested?.server_address ??
    nested?.serverAddress
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim()
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

/**
 * Reactive version of {@link resolveServerAddress} backed by the shared
 * status query — returns the deployment's public API base URL.
 */
export function useServerAddress(): string {
  const { status } = useStatus()
  return resolveServerAddress(status)
}
