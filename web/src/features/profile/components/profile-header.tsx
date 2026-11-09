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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatCompactNumber, formatQuota } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

// ============================================================================
// Profile Header Component
// ============================================================================

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

export function ProfileHeader({ profile, loading }: ProfileHeaderProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardContent className='p-4 sm:p-5'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex items-center gap-3 sm:gap-4'>
              <Skeleton className='h-14 w-14 rounded-full' />
              <div className='space-y-2'>
                <Skeleton className='h-6 w-40' />
                <Skeleton className='h-4 w-56' />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {['balance', 'usage', 'requests', 'group'].map((key) => (
                <div key={key} className='space-y-1.5'>
                  <Skeleton className='h-3.5 w-16' />
                  <Skeleton className='h-6 w-20' />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = getUserAvatarStyle(avatarName)
  const roleLabel = getRoleLabel(profile.role)
  const stats = [
    { label: t('Current Balance'), value: formatQuota(profile.quota) },
    { label: t('Total Usage'), value: formatQuota(profile.used_quota) },
    {
      label: t('API Requests'),
      value: formatCompactNumber(profile.request_count),
    },
    { label: t('User Group'), value: profile.group || '-' },
  ]

  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
      <CardContent className='p-4 sm:p-5'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6'>
          <div className='flex min-w-0 items-center gap-3 sm:gap-4'>
            <Avatar className='ring-background h-14 w-14 rounded-full text-base ring-2 sm:h-16 sm:w-16 sm:text-lg'>
              <AvatarFallback
                className='rounded-full font-semibold text-white'
                style={avatarFallbackStyle}
              >
                {avatarFallback}
              </AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex min-w-0 items-center gap-2'>
                <h1 className='truncate text-lg font-semibold tracking-tight sm:text-xl'>
                  {displayName}
                </h1>
                <StatusBadge
                  label={roleLabel}
                  variant='neutral'
                  copyable={false}
                />
              </div>
              <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm'>
                <span className='truncate'>@{profile.username}</span>
                <span className='text-muted-foreground/50'>·</span>
                <span className='flex items-center gap-1'>
                  <span className='font-mono tabular-nums'>
                    {t('User ID')} {profile.id}
                  </span>
                  <CopyButton
                    value={String(profile.id)}
                    className='size-5'
                    iconClassName='size-3'
                    aria-label={t('Copy user ID')}
                  />
                </span>
              </div>
            </div>
          </div>

          <dl className='grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:gap-x-8'>
            {stats.map((item) => (
              <div key={item.label} className='min-w-0'>
                <dt className='text-muted-foreground truncate text-xs font-medium tracking-wider uppercase'>
                  {item.label}
                </dt>
                <dd className='text-foreground mt-1 truncate font-mono text-base font-semibold tracking-tight tabular-nums sm:text-lg'>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
