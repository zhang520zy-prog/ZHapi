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
// ----------------------------------------------------------------------------
// 24h availability thresholds for model cards and the pricing table
// ----------------------------------------------------------------------------

/** >= this percentage counts as a healthy (normal) 24h success rate. */
export const AVAILABILITY_NORMAL_THRESHOLD = 99
/** >= this percentage counts as degraded-but-usable. */
export const AVAILABILITY_LOW_THRESHOLD = 95

export type AvailabilityLevel = 'normal' | 'low' | 'critical' | 'none'

export function getAvailabilityLevel(
  successRate: number | null | undefined
): AvailabilityLevel {
  if (
    successRate == null ||
    !Number.isFinite(successRate) ||
    successRate < 0 ||
    successRate > 100
  ) {
    return 'none'
  }
  if (successRate >= AVAILABILITY_NORMAL_THRESHOLD) return 'normal'
  if (successRate >= AVAILABILITY_LOW_THRESHOLD) return 'low'
  return 'critical'
}
