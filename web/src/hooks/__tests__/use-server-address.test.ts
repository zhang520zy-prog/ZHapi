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
import { describe, expect, it } from 'vitest'

import { resolveServerAddress } from '../use-server-address'

describe('resolveServerAddress', () => {
  it('returns server_address trimmed, preserving the trailing slash', () => {
    expect(
      resolveServerAddress({ server_address: 'https://api.example.com/' })
    ).toBe('https://api.example.com/')
    expect(
      resolveServerAddress({ server_address: 'https://api.example.com//' })
    ).toBe('https://api.example.com//')
  })

  it('supports the camelCase and nested data spellings', () => {
    expect(resolveServerAddress({ serverAddress: 'https://a.example.com' })).toBe(
      'https://a.example.com'
    )
    expect(
      resolveServerAddress({ data: { server_address: 'https://b.example.com' } })
    ).toBe('https://b.example.com')
    expect(
      resolveServerAddress({ data: { serverAddress: 'https://c.example.com' } })
    ).toBe('https://c.example.com')
  })

  it('falls back to the current origin when the field is missing or blank', () => {
    expect(resolveServerAddress(null)).toBe(window.location.origin)
    expect(resolveServerAddress({})).toBe(window.location.origin)
    expect(resolveServerAddress({ server_address: '   ' })).toBe(
      window.location.origin
    )
    expect(resolveServerAddress({ server_address: 42 })).toBe(
      window.location.origin
    )
  })

  it('trims whitespace around the configured address', () => {
    expect(
      resolveServerAddress({ server_address: '  https://api.example.com/  ' })
    ).toBe('https://api.example.com/')
  })
})
