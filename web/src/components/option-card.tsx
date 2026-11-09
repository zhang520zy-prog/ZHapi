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
import { Check, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

export interface OptionCardProps extends Omit<
  React.ComponentProps<'button'>,
  'children' | 'onSelect' | 'title'
> {
  icon?: LucideIcon
  iconTone?: IconBadgeTone
  title: ReactNode
  description?: ReactNode
  /** Trailing content on the title row, e.g. a fee badge or a price. */
  meta?: ReactNode
  selected?: boolean
  onSelect?: () => void
}

/**
 * Selectable option card for payment method / package pickers. Renders a
 * button with `aria-pressed`; selected state uses the accent border and tint.
 */
export function OptionCard(props: OptionCardProps) {
  const {
    icon: Icon,
    iconTone,
    title,
    description,
    meta,
    selected,
    onSelect,
    onClick,
    className,
    ...rest
  } = props
  const resolvedIconTone = iconTone ?? (selected ? 'primary' : 'neutral')

  return (
    <button
      {...rest}
      data-slot='option-card'
      type='button'
      aria-pressed={selected ?? false}
      onClick={(event) => {
        onClick?.(event)
        onSelect?.()
      }}
      className={cn(
        'border-border bg-card relative flex w-full items-center gap-3 rounded-[var(--rd-radius-option)] border p-3 text-left transition-colors outline-none',
        'hover:border-primary/40 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-pressed:bg-primary/6 aria-pressed:shadow-[inset_0_0_0_2px_var(--primary)]',
        className
      )}
    >
      {selected && (
        <Check
          className='text-primary absolute top-2.5 right-2.5 size-4'
          aria-hidden='true'
        />
      )}
      {Icon != null && (
        <IconBadge size='md' tone={resolvedIconTone}>
          <Icon />
        </IconBadge>
      )}
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex items-center gap-2'>
          <span className='text-foreground min-w-0 flex-1 truncate text-sm font-medium'>
            {title}
          </span>
          {meta != null && <span className='shrink-0'>{meta}</span>}
        </span>
        {description != null && (
          <span className='text-muted-foreground line-clamp-2 text-xs'>
            {description}
          </span>
        )}
      </span>
    </button>
  )
}
