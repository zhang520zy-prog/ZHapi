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
import { useRender } from '@base-ui/react/use-render'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

export interface SettingsCategoryListProps {
  children: ReactNode
  className?: string
}

export function SettingsCategoryList(props: SettingsCategoryListProps) {
  return (
    <div
      data-slot='settings-category-list'
      className={cn('flex flex-col gap-1', props.className)}
    >
      {props.children}
    </div>
  )
}

export interface SettingsCategoryItemProps {
  icon?: LucideIcon
  iconTone?: IconBadgeTone
  title: ReactNode
  description?: ReactNode
  /** Right-side status badge, e.g. <StatusBadge/> or <Badge/>. */
  badge?: ReactNode
  selected?: boolean
  showChevron?: boolean
  onClick?: () => void
  className?: string
}

/**
 * One row of a settings category list: icon, title, one-line description and
 * an optional right-side badge. Pass `render={<Link to=.../>}` to navigate.
 */
export function SettingsCategoryItem({
  render,
  ...props
}: SettingsCategoryItemProps & {
  render?: useRender.ComponentProps<'button'>['render']
}) {
  const Icon = props.icon

  return useRender({
    defaultTagName: 'button',
    render,
    props: {
      type: 'button',
      onClick: props.onClick,
      'data-slot': 'settings-category-item',
      'aria-current': props.selected ? ('page' as const) : undefined,
      className: cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none',
        'hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        props.selected &&
          'bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--primary)]',
        props.className
      ),
      children: (
        <>
          {Icon != null && (
            <IconBadge size='sm' tone={props.iconTone ?? 'neutral'}>
              <Icon />
            </IconBadge>
          )}
          <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <span className='truncate text-sm font-medium'>{props.title}</span>
            {props.description != null && (
              <span className='text-muted-foreground truncate text-xs'>
                {props.description}
              </span>
            )}
          </span>
          {props.badge != null && (
            <span className='shrink-0'>{props.badge}</span>
          )}
          {(props.showChevron ?? true) && (
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          )}
        </>
      ),
    },
    state: { slot: 'settings-category-item' },
  })
}
