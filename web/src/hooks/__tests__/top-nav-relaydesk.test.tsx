/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
} from '@/i18n/languages'

import { useTopNavLinks } from '../use-top-nav-links'

describe('RelayDesk console navigation', () => {
  it('offers exactly Home, Model Square, Console and Docs', () => {
    const client = new QueryClient()
    client.setQueryData(['status'], { HeaderNavModules: '' })
    function Wrapper(props: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useTopNavLinks(), { wrapper: Wrapper })
    expect(result.current.map((link) => [link.title, link.href])).toEqual([
      ['Home', '/'],
      ['Model Square', '/pricing'],
      ['Console', '/dashboard'],
      ['Docs', '/docs'],
    ])
  })

  it('honours per-module toggles and an external docs link', () => {
    const client = new QueryClient()
    client.setQueryData(['status'], {
      HeaderNavModules: JSON.stringify({
        home: false,
        docs: true,
      }),
      docs_link: 'https://docs.example.com',
    })
    function Wrapper(props: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useTopNavLinks(), { wrapper: Wrapper })
    expect(result.current.map((link) => [link.title, link.href])).toEqual([
      ['Model Square', '/pricing'],
      ['Console', '/dashboard'],
      ['Docs', 'https://docs.example.com'],
    ])
    expect(result.current.at(-1)?.external).toBe(true)
  })

  it('offers only simplified Chinese, traditional Chinese, and English', () => {
    expect(INTERFACE_LANGUAGE_OPTIONS.map((option) => option.code)).toEqual([
      'zhCN',
      'zhTW',
      'en',
    ])
  })

  it.each([
    ['zhCN', 'zhCN'],
    ['zh-Hans', 'zhCN'],
    ['zhTW', 'zhTW'],
    ['zh-Hant', 'zhTW'],
    ['en', 'en'],
    ['fr', 'en'],
  ])(
    'normalizes stored language %s to supported language %s',
    (stored, expected) => {
      expect(normalizeInterfaceLanguage(stored)).toBe(expected)
    }
  )
})
