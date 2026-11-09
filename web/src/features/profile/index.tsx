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
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  Bell,
  EyeOff,
  Link2,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import {
  SettingsCategoryItem,
  SettingsCategoryList,
} from '@/components/settings-category-list'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { AccessTokenCard } from '@/features/security/components/access-token-card'
import { AccountActionCard } from '@/features/security/components/account-action-card'
import { AccountBindings } from '@/features/security/components/account-bindings'
import { LoginSessionsCard } from '@/features/security/components/login-sessions-card'
import { PasskeyCard } from '@/features/security/components/passkey-card'
import { PrivacyCard } from '@/features/security/components/privacy-card'
import { SecurityScoreCard } from '@/features/security/components/security-score-card'
import { TwoFACard } from '@/features/security/components/two-fa-card'
import {
  useBoundBindingsCount,
  useSecurityScore,
} from '@/features/security/hooks/use-security-score'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileHeader } from './components/profile-header'
import { ProfileSettingsCard } from './components/profile-settings-card'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import {
  DEFAULT_PROFILE_SECTION,
  PROFILE_SECTIONS,
  type ProfileSection,
} from './constants'
import { useProfile } from './hooks'
import { parseUserSettings } from './lib'

function isProfileSection(value: unknown): value is ProfileSection {
  return (
    typeof value === 'string' &&
    (PROFILE_SECTIONS as readonly string[]).includes(value)
  )
}

function SettingsSection(props: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`settings-${props.title}`} className='space-y-3'>
      <h2 id={`settings-${props.title}`} className='text-sm font-semibold'>
        {props.title}
      </h2>
      <div className='space-y-4'>{props.children}</div>
    </section>
  )
}

export function Profile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { section } = useSearch({ from: '/_authenticated/profile/' })
  const { profile, loading, refreshProfile, fetchProfile } = useProfile()
  const permissions = useAuthStore((s) => s.auth.user?.permissions)
  const score = useSecurityScore(profile)
  const boundCount = useBoundBindingsCount(profile)

  const canConfigureSidebar = permissions?.sidebar_settings !== false
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasExplicitSection = isProfileSection(section)
  const activeSection: ProfileSection = hasExplicitSection
    ? section
    : DEFAULT_PROFILE_SECTION
  const showSelection = hasExplicitSection || isDesktop

  const selectSection = (next: ProfileSection) => {
    void navigate({ to: '/profile', search: { section: next } })
  }

  const notifyType = profile?.setting
    ? parseUserSettings(profile.setting).notify_type
    : undefined

  const categories: {
    key: ProfileSection
    icon: typeof Link2
    title: string
    description: string
    badge?: ReactNode
  }[] = [
    {
      key: 'bindings',
      icon: Link2,
      title: t('Account bindings'),
      description: t('Manage login methods linked to your account'),
      badge: (
        <StatusBadge
          label={t('{{count}} bound', { count: boundCount })}
          variant='neutral'
          copyable={false}
        />
      ),
    },
    {
      key: 'security',
      icon: ShieldCheck,
      title: t('Security settings'),
      description: t('Password, two-factor, passkeys and sessions'),
      badge:
        score.completed < score.total ? (
          <StatusBadge
            label={t('Needs attention')}
            variant='warning'
            copyable={false}
          />
        ) : undefined,
    },
    {
      key: 'notifications',
      icon: Bell,
      title: t('Notifications & alerts'),
      description: t('Quota warnings and notification channels'),
      badge: notifyType ? (
        <StatusBadge label={t('Enabled')} variant='success' copyable={false} />
      ) : undefined,
    },
    {
      key: 'preferences',
      icon: Settings2,
      title: t('Preferences'),
      description: t('Language and sidebar modules'),
    },
    {
      key: 'privacy',
      icon: EyeOff,
      title: t('Privacy & account'),
      description: t('Privacy controls and account deletion'),
    },
  ]

  let content: ReactNode = null
  if (profile) {
    if (activeSection === 'bindings') {
      content = (
        <TitledCard
          title={t('Account Bindings')}
          icon={<Link2 className='size-4' />}
          headerClassName='px-3 py-2.5 !pb-2.5 sm:px-4 sm:py-2.5 sm:!pb-2.5'
          contentClassName='p-3 sm:p-3'
          titleClassName='text-sm sm:text-sm'
          iconClassName='size-7 sm:size-7'
          disableHoverEffect
        >
          <AccountBindings profile={profile} onUpdate={refreshProfile} />
        </TitledCard>
      )
    } else if (activeSection === 'security') {
      content = (
        <SettingsSection title={t('Security settings')}>
          <AccountActionCard
            action='password'
            username={profile.username}
            hasPassword={profile.has_password}
            onUpdate={refreshProfile}
          />
          <TwoFACard loading={loading} />
          <PasskeyCard loading={loading} />
          <LoginSessionsCard />
          <AccessTokenCard />
        </SettingsSection>
      )
    } else if (activeSection === 'notifications') {
      content = (
        <ProfileSettingsCard
          profile={profile}
          loading={loading}
          onProfileUpdate={refreshProfile}
        />
      )
    } else if (activeSection === 'preferences') {
      content = (
        <SettingsSection title={t('Preferences')}>
          <LanguagePreferencesCard
            profile={profile}
            onProfileUpdate={refreshProfile}
          />
          {canConfigureSidebar && <SidebarModulesCard />}
        </SettingsSection>
      )
    } else {
      content = (
        <SettingsSection title={t('Privacy & account')}>
          <PrivacyCard profile={profile} onUpdate={refreshProfile} />
          <AccountActionCard action='delete' username={profile.username} />
        </SettingsSection>
      )
    }
  }

  const categoryList = (
    <SettingsCategoryList>
      {categories.map((category) => (
        <SettingsCategoryItem
          key={category.key}
          icon={category.icon}
          title={category.title}
          description={category.description}
          badge={category.badge}
          selected={showSelection && activeSection === category.key}
          render={
            <Link
              to='/profile'
              search={{ section: category.key }}
              replace={false}
            />
          }
        />
      ))}
    </SettingsCategoryList>
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Personal Settings')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6'>
          <ProfileHeader profile={profile} loading={loading} />

          {!loading && !profile ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('Failed to load profile')}</EmptyTitle>
                <EmptyDescription>
                  {t('Refresh the list and try again.')}
                </EmptyDescription>
              </EmptyHeader>
              <Button
                type='button'
                variant='outline'
                onClick={() => void fetchProfile()}
              >
                {t('Retry')}
              </Button>
            </Empty>
          ) : (
            <div className='grid gap-4 sm:gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start'>
              <div
                className={cn(
                  'flex min-w-0 flex-col gap-4 sm:gap-5',
                  hasExplicitSection && 'hidden lg:flex'
                )}
              >
                {categoryList}
                <SecurityScoreCard score={score} onSelect={selectSection} />
              </div>

              <div
                className={cn(
                  'min-w-0 space-y-4',
                  !hasExplicitSection && 'hidden lg:block'
                )}
              >
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-2 lg:hidden'
                  render={<Link to='/profile' search={{}} />}
                >
                  <ArrowLeft data-icon='inline-start' />
                  {t('Back')}
                </Button>
                {loading ? (
                  <div
                    role='status'
                    aria-label={t('Loading...')}
                    className='space-y-4'
                  >
                    <Skeleton className='h-28 w-full' />
                    <Skeleton className='h-52 w-full' />
                  </div>
                ) : (
                  content
                )}
              </div>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
