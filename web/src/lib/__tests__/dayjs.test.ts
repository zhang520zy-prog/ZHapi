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
import i18n from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import dayjs from '@/lib/dayjs'

describe('dayjs locale sync', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each([
    ['en', 'en'],
    ['zhCN', 'zh-cn'],
    ['zhTW', 'zh-tw'],
  ])('maps UI language %s to dayjs locale %s', async (uiLang, dayjsLocale) => {
    await i18n.changeLanguage(uiLang)
    expect(dayjs.locale()).toBe(dayjsLocale)
  })

  it.each(['fr', 'ja', 'ru', 'vi', 'xx-YY'])(
    'falls back to en for unsupported or invalid language %s',
    async (lang) => {
      // Start from a non-en locale so the assertion would fail if the
      // fallback mapping did not run.
      await i18n.changeLanguage('zhCN')
      expect(dayjs.locale()).toBe('zh-cn')
      await i18n.changeLanguage(lang)
      expect(dayjs.locale()).toBe('en')
    }
  )

  it('updates relative time output when the language switches', async () => {
    // dayjs instances capture the locale at creation time — the mapping is
    // observable on instances created after the switch.
    const threeMinutesAgo = () => dayjs().subtract(3, 'minute').fromNow()
    await i18n.changeLanguage('zhCN')
    expect(threeMinutesAgo()).toBe('3 分钟前')
    await i18n.changeLanguage('zhTW')
    expect(threeMinutesAgo()).toBe('3 分鐘前')
    await i18n.changeLanguage('en')
    expect(threeMinutesAgo()).toBe('3 minutes ago')
  })

  it('keeps ISO week bounds on Monday–Sunday in every language', async () => {
    // 2026-11-11 is a Wednesday; ISO week runs 11-09 (Mon) → 11-15 (Sun).
    // Instances capture the locale at creation time — build inside the loop.
    for (const lang of ['en', 'zhCN', 'zhTW']) {
      await i18n.changeLanguage(lang)
      const wednesday = dayjs('2026-11-11T12:00:00')
      expect(wednesday.startOf('isoWeek').format('YYYY-MM-DD')).toBe(
        '2026-11-09'
      )
      expect(wednesday.endOf('isoWeek').format('YYYY-MM-DD')).toBe('2026-11-15')
    }
  })
})
