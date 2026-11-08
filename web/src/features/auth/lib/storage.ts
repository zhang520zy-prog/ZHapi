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
 * Utilities for managing authentication-related browser storage
 */

// ============================================================================
// LocalStorage Keys
// ============================================================================

const STORAGE_KEYS = {
  AFFILIATE: 'aff',
  DISTRIBUTOR: 'dist',
  STATUS: 'status',
} as const

// ============================================================================
// Affiliate Code Storage
// ============================================================================

/**
 * Get affiliate code from localStorage
 */
export function getAffiliateCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEYS.AFFILIATE) ?? ''
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get affiliate code:', error)
    return ''
  }
}

/**
 * Save affiliate code to localStorage. The last link the visitor clicked wins,
 * so a stored distributor code is cleared.
 */
export function saveAffiliateCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.AFFILIATE, code)
    window.localStorage.removeItem(STORAGE_KEYS.DISTRIBUTOR)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save affiliate code:', error)
  }
}

/**
 * Get distributor code from localStorage
 */
export function getDistributorCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEYS.DISTRIBUTOR) ?? ''
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get distributor code:', error)
    return ''
  }
}

/**
 * Save distributor code to localStorage. A stored distributor code takes
 * precedence over the affiliate code during registration.
 */
export function saveDistributorCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.DISTRIBUTOR, code)
    window.localStorage.removeItem(STORAGE_KEYS.AFFILIATE)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save distributor code:', error)
  }
}
