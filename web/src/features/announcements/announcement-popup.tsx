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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { getAnnouncementKey } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

import { ackUserAnnouncements } from './api'
import {
  isEligiblePopupAnnouncement,
  readSuppressedPopupIds,
  writeSuppressedPopupIds,
} from './lib/popup'
import type { PopupAnnouncement } from './types'

/**
 * Presentational dialog for popup announcements — shared by the console
 * popup and the admin form preview. Navigation and close are delegated to
 * the parent via `onOpenChange`; this component never calls the ack API.
 */
export function AnnouncementPopupDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PopupAnnouncement[]
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const acknowledgeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (props.open) setIndex(0)
  }, [props.open])

  const lastIndex = Math.max(props.items.length - 1, 0)
  const item = props.items[Math.min(index, lastIndex)]
  const publishDate = item?.publishDate ? new Date(item.publishDate) : null
  const multiple = props.items.length > 1

  return (
    <Dialog
      open={props.open && props.items.length > 0}
      onOpenChange={props.onOpenChange}
      initialFocus={acknowledgeRef}
      title={
        <span className='flex items-center gap-2'>
          <span
            className={cn(
              'inline-block size-2 shrink-0 rounded-full',
              getAnnouncementColorClass(item?.type)
            )}
            aria-hidden='true'
          />
          <span className='min-w-0 flex-1 truncate'>
            {item?.title?.trim() || t('System Announcement')}
          </span>
          {multiple ? (
            <span
              className='text-muted-foreground shrink-0 text-xs font-normal'
              aria-live='polite'
            >
              {`${Math.min(index, lastIndex) + 1} / ${props.items.length}`}
            </span>
          ) : null}
        </span>
      }
      description={
        publishDate && !Number.isNaN(publishDate.getTime())
          ? formatDateTimeObject(publishDate)
          : undefined
      }
      bodyClassName='max-h-[60dvh] overflow-y-auto'
      footer={
        <>
          {multiple ? (
            <>
              <Button
                variant='outline'
                onClick={() => setIndex((i) => i - 1)}
                disabled={index <= 0}
              >
                <ChevronLeft />
                {t('Previous')}
              </Button>
              <Button
                variant='outline'
                onClick={() => setIndex((i) => i + 1)}
                disabled={index >= lastIndex}
              >
                {t('Next')}
                <ChevronRight />
              </Button>
            </>
          ) : null}
          <Button
            ref={acknowledgeRef}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Got it')}
          </Button>
        </>
      }
    >
      <RichContent breaks content={item?.content ?? ''} />
    </Dialog>
  )
}

/**
 * Post-login announcement popup (N5/F6.1). Mounted inside the authenticated
 * console only; stays closed while the agreement confirmation is pending.
 * Every close path (acknowledge button, close button, Esc, backdrop) records
 * all displayed ids via `POST /api/user/announcements/ack`. On failure the
 * popup still closes and the ids are suppressed for this browser session.
 */
export function AnnouncementPopup() {
  const user = useAuthStore((state) => state.auth.user)
  const setUser = useAuthStore((state) => state.auth.setUser)
  const markAnnouncementsRead = useNotificationStore(
    (state) => state.markAnnouncementsRead
  )
  const { status } = useStatus()
  // Ids closed in this mount — covers the in-flight gap before the acked
  // list (or session suppression) reflects the close.
  const [closedIds, setClosedIds] = useState<ReadonlySet<number>>(new Set())

  const announcementsEnabled = status?.announcements_enabled === true

  const items = useMemo(() => {
    if (!user || !announcementsEnabled) return []
    const skip = new Set<number>([
      ...(user.announcement_acked_ids ?? []),
      ...readSuppressedPopupIds(),
      ...closedIds,
    ])
    const now = Date.now()
    return ((status?.announcements ?? []) as PopupAnnouncement[])
      .filter((announcement) =>
        isEligiblePopupAnnouncement(announcement, skip, now)
      )
      .sort(
        (a, b) =>
          Date.parse(b.publishDate ?? '') - Date.parse(a.publishDate ?? '')
      )
  }, [user, announcementsEnabled, status?.announcements, closedIds])

  // The agreement confirmation dialog takes precedence; the same predicate
  // as AgreementConfirmDialog keeps both dialogs from stacking.
  const currentVersion =
    typeof status?.user_agreement_version === 'number'
      ? status.user_agreement_version
      : 0
  const agreementBlocking =
    !!user &&
    currentVersion > 0 &&
    (user.agreement_version ?? 0) < currentVersion

  const handleOpenChange = (open: boolean) => {
    if (open) return
    const ids = items.map((item) => item.id)
    setClosedIds((previous) => new Set([...previous, ...ids]))
    void (async () => {
      try {
        const res = await ackUserAnnouncements(ids)
        if (res.success && res.data) {
          // Read the freshest user object — other fields (e.g. quota) may
          // have changed since this render.
          const currentUser = useAuthStore.getState().auth.user
          if (currentUser) {
            setUser({
              ...currentUser,
              announcement_acked_ids: res.data.announcement_acked_ids,
            })
          }
          markAnnouncementsRead(ids.map((id) => getAnnouncementKey({ id })))
          return
        }
        writeSuppressedPopupIds(ids)
      } catch {
        writeSuppressedPopupIds(ids)
      }
    })()
  }

  if (!user) return null
  return (
    <AnnouncementPopupDialog
      open={items.length > 0 && !agreementBlocking}
      onOpenChange={handleOpenChange}
      items={items}
    />
  )
}
