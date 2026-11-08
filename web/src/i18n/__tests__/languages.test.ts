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
import { createInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, expect, test } from 'vitest'

import {
  convertDetectedLanguage,
  normalizeInterfaceLanguage,
  toIntlLocale,
} from '../languages'
import en from '../locales/en.json'
import zhTW from '../locales/zh-TW.json'
import zhCN from '../locales/zh.json'

afterEach(() => localStorage.removeItem('i18nextLng'))

test.each([
  ['en', 'Database health', 'Audit delivery retry'],
  ['zhCN', '数据库健康', '审计补写重试'],
  ['zhTW', '資料庫健康', '稽核補寫重試'],
])(
  'database health and audit task labels use the actual %s locale resources',
  async (language, heading, retry) => {
    const instance = createInstance()
    await instance.init({
      resources: { en, zhCN, zhTW },
      lng: language,
      fallbackLng: 'en',
      nsSeparator: false,
    })
    expect(instance.t('Database health')).toBe(heading)
    expect(instance.t('Audit delivery retry')).toBe(retry)
  }
)

test.each(['zhTW', 'zh-TW', 'zh-Hant-TW', 'zh_HK'])(
  'reloading with cached %s preserves traditional Chinese',
  async (stored) => {
    localStorage.setItem('i18nextLng', stored)
    const instance = createInstance()
    await instance.use(LanguageDetector).init({
      resources: {
        en: { translation: { language: 'English' } },
        zhCN: { translation: { language: '简体中文' } },
        zhTW: { translation: { language: '繁體中文' } },
      },
      fallbackLng: 'en',
      supportedLngs: ['en', 'zhCN', 'zhTW'],
      load: 'currentOnly',
      detection: {
        order: ['localStorage'],
        caches: [],
        convertDetectedLanguage,
      },
    })
    expect(instance.t('language')).toBe('繁體中文')
  }
)

test.each(['zh-Hans-CN', 'zh_Hans_SG'])(
  'regional simplified locale %s selects simplified Chinese',
  (locale) => expect(normalizeInterfaceLanguage(locale)).toBe('zhCN')
)

test.each([
  ['zhCN', 'zh-CN'],
  ['zhTW', 'zh-TW'],
  ['en', 'en'],
  ['fr', 'fr'],
  ['ru', 'ru'],
  ['ja', 'ja'],
  ['vi', 'vi'],
  ['invalid_locale', undefined],
])('locale %s remains safe for number formatting', (locale, expected) => {
  expect(toIntlLocale(locale)).toBe(expected)
  expect(() =>
    new Intl.NumberFormat(toIntlLocale(locale)).format(1234)
  ).not.toThrow()
})
