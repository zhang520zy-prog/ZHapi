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

export const RISK_RESTRICTED_EVENT = 'newapi:risk-restricted'
const RISK_RESTRICTED_CODE = 'risk_restricted'

/** Detect a 403 `risk_restricted` response in either relay (`error.code`)
 * or console (`code`/`success:false`) error payload shapes. */
export function isRiskRestrictedPayload(
  status: number | undefined,
  data: unknown
): boolean {
  if (status !== 403 || !data || typeof data !== 'object') return false
  const payload = data as {
    code?: unknown
    error?: { code?: unknown }
  }
  return (
    payload.code === RISK_RESTRICTED_CODE ||
    payload.error?.code === RISK_RESTRICTED_CODE
  )
}

/** Signal every listener that a request surfaced a risk restriction, so the
 * restriction-state query can be refreshed outside React Query boundaries. */
export function emitRiskRestricted() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RISK_RESTRICTED_EVENT))
}
