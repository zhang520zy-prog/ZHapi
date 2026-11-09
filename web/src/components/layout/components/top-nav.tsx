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
import { Menu } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

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
  const { t } = useTranslation()
  const normalizedLinks = useNormalizedLinks(links)
  const pathname = useLocation({ select: (location) => location.pathname })

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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
