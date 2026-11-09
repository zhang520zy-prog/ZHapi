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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, Headset, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SidebarFooter } from '@/components/ui/sidebar'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getNotice } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

const footerButtonClass =
  'size-7 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar'

function useNoticeContent() {
  const { data } = useQuery({
    queryKey: ['notice'],
    queryFn: async () => requireServerSuccess(await getNotice()),
    staleTime: 1000 * 60 * 5,
  })
  return (data?.data ?? '').trim()
}

function DocsLink(props: { docsLink?: string }) {
  const { t } = useTranslation()
  const label = t('Docs')
  const docsHref: string = '/docs'
  const render = props.docsLink ? (
    <a
      href={props.docsLink}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={label}
    />
  ) : (
    <Link to={docsHref} aria-label={label} />
  )
  return (
    <Button
      variant='ghost'
      size='icon'
      className={footerButtonClass}
      render={render}
    >
      <BookOpen className='size-4' />
    </Button>
  )
}

/**
 * Sidebar bottom block: one-line brand summary, announcement / docs /
 * customer-service icon buttons, and the copyright line. Contact entries
 * are hidden while the corresponding content is not configured.
 */
export function AppSidebarFooter() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { systemName, logo } = useSystemConfig()
  const notice = useNoticeContent()
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)

  const docsLink = status?.docs_link as string | undefined
  const customerService = String(status?.customer_service ?? '').trim()
  const name = systemName || 'ZH Api'
  const year = new Date().getFullYear()

  return (
    <SidebarFooter className='border-sidebar-border mt-auto border-t'>
      <div className='flex items-center gap-2 px-2 pt-1 group-data-[collapsible=icon]:hidden'>
        <img
          src={logo}
          alt={name}
          className='size-5 shrink-0 rounded-md object-cover'
        />
        <div className='min-w-0'>
          <div className='truncate text-xs font-medium'>{name}</div>
          <div className='text-muted-foreground truncate text-[11px]'>
            {t('Powerful API Management Platform')}
          </div>
        </div>
      </div>

      <div className='flex items-center gap-0.5 px-1 group-data-[collapsible=icon]:flex-col'>
        {notice !== '' && (
          <Button
            variant='ghost'
            size='icon'
            className={footerButtonClass}
            aria-label={t('Announcements')}
            onClick={() => setNoticeOpen(true)}
          >
            <Megaphone className='size-4' />
          </Button>
        )}
        <DocsLink docsLink={docsLink} />
        {customerService !== '' && (
          <Button
            variant='ghost'
            size='icon'
            className={footerButtonClass}
            aria-label={t('Customer service')}
            onClick={() => setServiceOpen(true)}
          >
            <Headset className='size-4' />
          </Button>
        )}
      </div>

      <div className='text-muted-foreground px-2 pb-1 text-[11px] group-data-[collapsible=icon]:hidden'>
        &copy; {year} {name}
      </div>

      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('Announcements')}</DialogTitle>
          </DialogHeader>
          <RichContent content={notice} breaks />
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('Customer service')}</DialogTitle>
          </DialogHeader>
          <RichContent content={customerService} breaks />
        </DialogContent>
      </Dialog>
    </SidebarFooter>
  )
}
