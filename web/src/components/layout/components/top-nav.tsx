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
import { Link, useLocation } from '@tanstack/react-router'
import {
  Check,
  Languages,
  Menu,
  Moon,
  Search as SearchIcon,
  Sun,
} from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSearch } from '@/context/search-provider'
import { useTheme } from '@/context/theme-provider'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
} from '@/i18n/languages'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import type { TopNavLink } from '../types'

type NormalizedTopNavLink = TopNavLink & {
  disabled: boolean
  external: boolean
}

function useNormalizedLinks(links: TopNavLink[]): NormalizedTopNavLink[] {
  return useMemo(
    () =>
      links.map((link) => ({
        disabled: false,
        external: false,
        ...link,
      })),
    [links]
  )
}

/**
 * The console capsule marks the section the user is currently in: Home is
 * exact-match only, the Console covers every other console page, and the
 * remaining entries highlight on their own path prefix.
 */
function isNavLinkActive(link: NormalizedTopNavLink, pathname: string) {
  if (link.external) return false
  if (link.href === '/') return pathname === '/'
  if (link.href === '/dashboard') {
    return (
      pathname !== '/' &&
      !pathname.startsWith('/pricing') &&
      !pathname.startsWith('/docs')
    )
  }
  return pathname === link.href || pathname.startsWith(`${link.href}/`)
}

const capsuleLinkClass =
  'inline-flex h-7 items-center rounded-full px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Capsule navigation rendered in the middle of the console top bar. Current
 * item gets a solid accent fill; the rest stay muted until hovered.
 */
export function TopNav({
  className,
  links,
  ...props
}: React.HTMLAttributes<HTMLElement> & { links: TopNavLink[] }) {
  const normalizedLinks = useNormalizedLinks(links)
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <nav
      className={cn(
        'border-border inline-flex items-center gap-0.5 rounded-full border p-1',
        className
      )}
      {...props}
    >
      {normalizedLinks.map((link) => {
        const active = isNavLinkActive(link, pathname)
        const linkClass = cn(
          capsuleLinkClass,
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )
        return link.external ? (
          <a
            key={`${link.title}-${link.href}`}
            href={link.href}
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {link.title}
          </a>
        ) : (
          <Link
            key={`${link.title}-${link.href}`}
            to={link.href}
            disabled={link.disabled}
            aria-current={active ? 'page' : undefined}
            className={linkClass}
          >
            {link.title}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Hamburger menu that collapses the capsule navigation below the lg
 * breakpoint.
 */
export function TopNavMenu({ links }: { links: TopNavLink[] }) {
  const { t, i18n } = useTranslation()
  const normalizedLinks = useNormalizedLinks(links)
  const pathname = useLocation({ select: (location) => location.pathname })
  const { setOpen: setSearchOpen } = useSearch()
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((s) => s.auth.user)
  const currentLanguage = normalizeInterfaceLanguage(i18n.language)
  const handleChangeLanguage = useCallback(
    async (code: string) => {
      await i18n.changeLanguage(code)
      if (user) {
        try {
          await api.put('/api/user/self', { language: code })
        } catch {
          // Best-effort persistence; don't block the UI on failure
        }
      }
    },
    [i18n, user]
  )
  const ThemeIcon = theme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            size='icon'
            variant='ghost'
            className='size-8'
            aria-label={t('Open navigation menu')}
          />
        }
      >
        <Menu className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent side='bottom' align='end'>
        {normalizedLinks.map((link) => {
          const active = isNavLinkActive(link, pathname)
          return (
            <DropdownMenuItem
              key={`${link.title}-${link.href}`}
              render={
                link.external ? (
                  <a
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={active ? '' : 'text-muted-foreground'}
                  >
                    {link.title}
                  </a>
                ) : (
                  <Link
                    to={link.href}
                    className={active ? '' : 'text-muted-foreground'}
                    disabled={link.disabled}
                  >
                    {link.title}
                  </Link>
                )
              }
            />
          )
        })}
        {/* Phone-only entries for the header controls hidden below `sm`:
            search, interface language, and theme. */}
        <DropdownMenuSeparator className='sm:hidden' />
        <DropdownMenuItem
          className='sm:hidden'
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon aria-hidden='true' />
          {t('Search')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className='sm:hidden'>
            <Languages aria-hidden='true' />
            {t('Interface Language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {INTERFACE_LANGUAGE_OPTIONS.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => handleChangeLanguage(lang.code)}
              >
                {lang.label}
                <Check
                  size={14}
                  className={cn(
                    'ms-auto',
                    currentLanguage !== lang.code && 'hidden'
                  )}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className='sm:hidden'>
            <ThemeIcon aria-hidden='true' className='size-4' />
            {t('Theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme('light')}>
              {t('Light')}
              <Check
                size={14}
                className={cn('ms-auto', theme !== 'light' && 'hidden')}
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              {t('Dark')}
              <Check
                size={14}
                className={cn('ms-auto', theme !== 'dark' && 'hidden')}
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              {t('System')}
              <Check
                size={14}
                className={cn('ms-auto', theme !== 'system' && 'hidden')}
              />
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
