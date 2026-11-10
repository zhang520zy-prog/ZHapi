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
 * One entry of `console_setting.announcements` as served by `/api/status`.
 * `id` is assigned by the server (B6.1); entries the admin saved before ids
 * existed may lack one until the backend backfill runs.
 */
export interface PopupAnnouncement {
  id?: number
  title?: string
  content?: string
  publishDate?: string
  expireDate?: string
  popup?: boolean
  type?: string
  extra?: string
}
