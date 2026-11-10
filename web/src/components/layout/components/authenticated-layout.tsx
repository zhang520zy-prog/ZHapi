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
import { AnimatedOutlet } from '@/components/page-transition'
import { SkipToMain } from '@/components/skip-to-main'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { AnnouncementPopup } from '@/features/announcements/announcement-popup'
import { AgreementConfirmDialog } from '@/features/legal/agreement-confirm-dialog'
import { RiskRestrictionBanner } from '@/features/risk-events/components/restriction-banner'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'

import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  // Collapsed default on 768–1279px, expanded on >=1280px; the cookie wins
  // once the user has made a choice.
  const stored = getCookie('sidebar_state')
  const defaultOpen =
    stored === undefined
      ? typeof window !== 'undefined' &&
        window.matchMedia('(min-width: 1280px)').matches
      : stored !== 'false'

  return (
    <LayoutProvider>
      <SearchProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          className='relaydesk-console flex-col'
        >
          <SkipToMain />
          <AppHeader />
          <div className='flex min-h-0 w-full flex-1'>
            <AppSidebar />
            <SidebarInset
              className={cn(
                '@container/content',
                'h-[calc(100svh-var(--app-header-height,0px))]',
                'min-h-0 overflow-hidden',
                'peer-data-[variant=inset]:h-[calc(100svh-var(--app-header-height,0px)-(var(--spacing)*4))]'
              )}
            >
              {/* Content area: 1440px cap, 24px gutter desktop / 12px mobile. */}
              <div className='mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-3 sm:px-6'>
                <RiskRestrictionBanner />
                {props.children ?? <AnimatedOutlet />}
              </div>
            </SidebarInset>
            <AgreementConfirmDialog />
            <AnnouncementPopup />
          </div>
        </SidebarProvider>
      </SearchProvider>
    </LayoutProvider>
  )
}
