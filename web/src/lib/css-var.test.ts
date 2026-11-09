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

import { afterEach, describe, expect, it } from 'vitest'

import { readCssVar } from './css-var'

const TEST_VAR = '--read-css-var-test'

describe('readCssVar', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(TEST_VAR)
    document.body.style.removeProperty(TEST_VAR)
  })

  it('reads the value defined on <body> when html and body differ', () => {
    // Regression: theme presets attach tokens to <body data-theme-preset>
    // while the default theme attaches them to :root. The body value must
    // win, otherwise preset charts resolve to the default palette.
    document.documentElement.style.setProperty(TEST_VAR, 'rgb(1, 2, 3)')
    document.body.style.setProperty(TEST_VAR, 'rgb(9, 8, 7)')

    expect(readCssVar(TEST_VAR)).toBe('rgb(9, 8, 7)')
  })

  it('returns an empty string when the variable is not defined', () => {
    expect(readCssVar(TEST_VAR)).toBe('')
  })
})
