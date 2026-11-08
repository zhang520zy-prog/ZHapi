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
import path from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: '../design-previews/mobius-data-home/scheme-b/source/main.tsx',
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  html: {
    title: 'New API — Möbius / RelayDesk',
    meta: {
      description: 'AI gateway and RelayDesk — intelligence in continuous flow',
      viewport: 'width=device-width, initial-scale=1',
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4176,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:31089', changeOrigin: true } },
  },
  output: {
    distPath: { root: '../design-previews/mobius-data-home/scheme-b/dist' },
    cleanDistPath: false,
  },
  performance: { buildCache: false },
})
