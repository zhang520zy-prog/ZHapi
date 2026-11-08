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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import { ThemeProvider } from '@/context/theme-provider'
import i18n from '@/i18n/config'

import { MobiusFlowPreview } from './index'

import '@/styles/mobius-flow.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

// ?lang= lets reviewers pin a language; otherwise the shared detector decides.
const requested = new URLSearchParams(window.location.search).get('lang')
if (requested && ['zhCN', 'zhTW', 'en'].includes(requested)) {
  void i18n.changeLanguage(requested)
}

const root = document.querySelector('#root')
if (!root) throw new Error('Missing preview root')
createRoot(root).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme='dark'>
          <MobiusFlowPreview />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>
)
