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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { TopNavLink } from '@/components/layout/types'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export type { TopNavLink } from '@/components/layout/types'

const UPSTREAM_DOCS_LINK = 'https://docs.newapi.pro'

/**
 * Resolve the developer-docs destination shared by the capsule nav and the
 * sidebar footer. An empty `docs_link` or the untouched upstream default
 * (`https://docs.newapi.pro`) means "not configured": both surfaces then
 * point at the in-app `/docs` page. Only a customised value becomes an
 * external link.
 */
export function resolveDocsLink(docsLink: string | null | undefined): {
  href: string
  external: boolean
} {
  const trimmed = (docsLink ?? '').trim()
  if (trimmed === '' || trimmed.replace(/\/+$/, '') === UPSTREAM_DOCS_LINK) {
    return { href: '/docs', external: false }
  }
  return { href: trimmed, external: true }
}

/**
 * Console capsule navigation: Home / Model Square / Console / Docs.
 *
 * Each item can be toggled by the `HeaderNavModules` option configured in
 * System Settings → Maintenance → Header navigation. `pricing` additionally
 * supports `requireAuth`; `docs` resolves to the configured external
 * `docs_link` when set.
 */
export function useTopNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { auth } = useAuthStore()

  // Parse HeaderNavModules
  const modules = useMemo(() => {
    return parseHeaderNavModulesFromStatus(
      status as Record<string, unknown> | null
    )
  }, [status])

  // Documentation link (may be external)
  const docsLink: string | undefined = status?.docs_link as string | undefined

  const isAuthed = !!auth?.user

  const links: TopNavLink[] = []

  // Home
  if (modules?.home !== false) {
    links.push({ title: t('Home'), href: '/' })
  }

  // Model Square
  const pricing = modules?.pricing
  if (pricing && typeof pricing === 'object' && pricing.enabled) {
    const requiresAuth = pricing.requireAuth && !isAuthed
    links.push({ title: t('Model Square'), href: '/pricing', requiresAuth })
  }

  // Console -> /dashboard
  if (modules?.console !== false) {
    links.push({ title: t('Console'), href: '/dashboard' })
  }

  // Docs (customised external link, otherwise the in-app page)
  if (modules?.docs !== false) {
    const docs = resolveDocsLink(docsLink)
    links.push({ title: t('Docs'), href: docs.href, external: docs.external })
  }

  return links
}
