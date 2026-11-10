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
import type { PopupAnnouncement } from '../types'

export type EligiblePopupAnnouncement = PopupAnnouncement & { id: number }

const SUPPRESSED_STORAGE_KEY = 'announcement-popup-suppressed'

/**
 * N5: a popup announcement shows only when all four hold — `popup` is on,
 * `publishDate` has arrived, it has not expired, and this account has not
 * acknowledged the id (server list or this session's suppression).
 */
export function isEligiblePopupAnnouncement(
  announcement: PopupAnnouncement,
  skipIds: ReadonlySet<number>,
  now: number
): announcement is EligiblePopupAnnouncement {
  if (announcement.popup !== true) return false
  const id = announcement.id
  if (typeof id !== 'number' || !Number.isInteger(id) || skipIds.has(id)) {
    return false
  }
  const published = Date.parse(announcement.publishDate ?? '')
  if (!Number.isFinite(published) || published > now) return false
  if (announcement.expireDate) {
    const expires = Date.parse(announcement.expireDate)
    if (!Number.isFinite(expires) || expires <= now) return false
  }
  return true
}

/** Ids whose ack request failed — suppressed until this browser session ends. */
export function readSuppressedPopupIds(): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(SUPPRESSED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item)
      )
    )
  } catch {
    return new Set()
  }
}

export function writeSuppressedPopupIds(ids: number[]): void {
  try {
    const merged = readSuppressedPopupIds()
    for (const id of ids) merged.add(id)
    window.sessionStorage.setItem(
      SUPPRESSED_STORAGE_KEY,
      JSON.stringify([...merged])
    )
  } catch {
    /* sessionStorage unavailable in private mode */
  }
}
