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

/** Scheme C's six chapter forms, now reached by scrolling instead of a clock. */
export const SECTION_MORPHS = [0, 1, 2.2, 1.6, 1, 3] as const

// Share of the scroll between two sections during which the form stays still,
// so text is read against a steady sculpture and only reshapes in between.
const HOLD = 0.16

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Fractional section index: i when section i is centered in the viewport. */
export function sectionProgress(centers: readonly number[], focus: number) {
  if (centers.length === 0) return 0
  if (focus <= centers[0]) return 0
  for (let i = 0; i < centers.length - 1; i++) {
    if (focus < centers[i + 1]) {
      return i + (focus - centers[i]) / (centers[i + 1] - centers[i])
    }
  }
  return centers.length - 1
}

/** Local blend between section i and i + 1, flat near both ends. */
function transitionAt(progress: number) {
  const i = Math.floor(progress)
  return { i, t: smooth((progress - i - HOLD) / (1 - 2 * HOLD)) }
}

/** Continuous ribbon morph for a scroll position, holding each section's form. */
export function morphAt(progress: number) {
  const last = SECTION_MORPHS.length - 1
  const p = Number.isFinite(progress)
    ? Math.max(0, Math.min(last, progress))
    : 0
  if (p >= last) return SECTION_MORPHS[last]
  const { i, t } = transitionAt(p)
  return SECTION_MORPHS[i] + (SECTION_MORPHS[i + 1] - SECTION_MORPHS[i]) * t
}

/** Gentle rotation with scroll: zero at each section center, so composed forms stay exact. */
export function turnAt(progress: number) {
  const p = Number.isFinite(progress) ? progress : 0
  return Math.sin(p * Math.PI) * 0.16
}

/** Text opacity of section `index`: fully shown when centered, gone halfway to a neighbour. */
export function sectionOpacity(progress: number, index: number) {
  return 1 - smooth((Math.abs(progress - index) - 0.16) / 0.3)
}

/** 1 while a section is being read, 0 midway between sections. */
export function readingAt(progress: number) {
  const last = SECTION_MORPHS.length - 1
  const p = Number.isFinite(progress)
    ? Math.max(0, Math.min(last, progress))
    : 0
  const offset = Math.abs(p - Math.round(p))
  return 1 - smooth((offset - HOLD * 0.5) / (0.5 - HOLD * 0.5))
}
