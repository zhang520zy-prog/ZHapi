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
 * Dashboard chart palette resolved from design tokens at render time.
 * Canvas charts need concrete color strings; the palette is read from CSS
 * variables so theme/preset switches are reflected on the next render.
 *
 * Series colors cycle through --chart-1..4; once exhausted the same hues
 * repeat at reduced opacity (70%, then 45%) instead of inventing new hues.
 */
const CHART_SERIES_VARS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
] as const
const CHART_ALPHA_BANDS = [1, 0.7, 0.45] as const

// Light-theme fallbacks matching theme-presets.css; only used outside the DOM
// (tests, SSR) where getComputedStyle cannot resolve the tokens.
const FALLBACK_SERIES = [
  'oklch(0.5315 0.0694 156.19)',
  'oklch(0.5748 0.0862 336.52)',
  'oklch(0.8603 0.0731 158.6)',
  'oklch(0.8292 0.0422 332)',
]
const FALLBACK_MUTED = '#8a919c'
const FALLBACK_FOREGROUND = '#1f2430'

function readCssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

let alphaProbe: HTMLSpanElement | null = null

/** Resolve `color-mix(in srgb, color pct%, transparent)` to a canvas-safe color. */
function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1 || !color) return color
  if (typeof window === 'undefined') return color
  if (!alphaProbe) {
    alphaProbe = document.createElement('span')
    alphaProbe.style.display = 'none'
    alphaProbe.setAttribute('aria-hidden', 'true')
    document.documentElement.appendChild(alphaProbe)
  }
  alphaProbe.style.color = `color-mix(in srgb, ${color} ${Math.round(
    alpha * 100
  )}%, transparent)`
  const resolved = getComputedStyle(alphaProbe).color
  alphaProbe.style.color = ''
  return resolved || color
}

/** Color for series `index`: --chart-(1..4), repeating at 70%/45% opacity. */
export function getChartSeriesColor(index: number): string {
  const safeIndex = Math.max(0, index)
  const varIndex = safeIndex % CHART_SERIES_VARS.length
  const band =
    CHART_ALPHA_BANDS[
      Math.min(
        Math.floor(safeIndex / CHART_SERIES_VARS.length),
        CHART_ALPHA_BANDS.length - 1
      )
    ]
  const base =
    readCssVar(CHART_SERIES_VARS[varIndex]) || FALLBACK_SERIES[varIndex]
  return withAlpha(base, band)
}

export function getChartSeriesColors(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    getChartSeriesColor(i)
  )
}

/** Muted color for aggregate buckets such as "Other". */
export function getChartOtherColor(): string {
  return readCssVar('--muted-foreground') || FALLBACK_MUTED
}

/** Stroke for hover/selected chart states. */
export function getChartStateStrokeColor(): string {
  return readCssVar('--foreground') || FALLBACK_FOREGROUND
}

/** Label color used inside chart canvas areas. */
export function getChartLabelColor(): string {
  return readCssVar('--muted-foreground') || FALLBACK_MUTED
}

/** Apply opacity to any resolved color (resolved via a DOM probe). */
export function chartColorAlpha(color: string, alpha: number): string {
  return withAlpha(color, alpha)
}
