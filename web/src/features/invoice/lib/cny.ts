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

/**
 * CNY amount helpers — invoice money arrives as decimal strings from the
 * server and must never pass through binary floats. All comparisons go
 * through integer cents.
 */

/** Parse a "12.34" amount string into integer cents, or null when invalid. */
export function cnyToCents(value: string | null | undefined): number | null {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(value ?? '')
  if (!match) return null
  const yuan = Number.parseInt(match[1], 10)
  const fraction = Number.parseInt((match[2] ?? '').padEnd(2, '0'), 10)
  return yuan * 100 + fraction
}

/** Whether the server amount string is exactly zero. */
export function isZeroCny(value: string | null | undefined): boolean {
  return cnyToCents(value) === 0
}

/** Smaller of two server amount strings, keeping the original format. */
export function minCnyString(a: string, b: string): string {
  const ac = cnyToCents(a)
  const bc = cnyToCents(b)
  if (ac == null) return b
  if (bc == null) return a
  return ac <= bc ? a : b
}

/** Whether an amount string falls inside [min, max], all in cents. */
export function cnyInRange(amount: string, min: string, max: string): boolean {
  const value = cnyToCents(amount)
  const lo = cnyToCents(min)
  const hi = cnyToCents(max)
  if (value == null || lo == null || hi == null) return false
  return value >= lo && value <= hi
}
