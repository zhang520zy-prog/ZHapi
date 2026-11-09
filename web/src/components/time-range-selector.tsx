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

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type TimeRangeValue = '24h' | '7d' | '30d' | 'custom'

const TIME_RANGE_OPTIONS: { value: TimeRangeValue; labelKey: string }[] = [
  { value: '24h', labelKey: '24 Hours' },
  { value: '7d', labelKey: '7 Days' },
  { value: '30d', labelKey: '30 Days' },
  { value: 'custom', labelKey: 'Custom' },
]

export interface TimeRangeSelectorProps {
  value: TimeRangeValue
  onChange: (value: TimeRangeValue) => void
  /**
   * Fired when the custom option is clicked, including re-clicks while it is
   * already selected — use it to open a date-range picker.
   */
  onCustomSelect?: () => void
  className?: string
  'aria-label'?: string
}

/**
 * Segmented time-range control: 24 Hours / 7 Days / 30 Days / Custom. The
 * selected segment uses the accent tint, matching sidebar selection.
 */
export function TimeRangeSelector(props: TimeRangeSelectorProps) {
  const { t } = useTranslation()

  return (
    <ToggleGroup
      data-slot='time-range-selector'
      variant='outline'
      spacing={0}
      value={[props.value]}
      onValueChange={(values) => {
        const next = values.find((item) => item !== props.value)
        if (next != null) props.onChange(next as TimeRangeValue)
      }}
      aria-label={props['aria-label'] ?? t('Time range')}
      className={props.className}
    >
      {TIME_RANGE_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          onClick={
            option.value === 'custom' ? props.onCustomSelect : undefined
          }
          className={cn(
            'min-w-0 px-3',
            'aria-pressed:bg-accent aria-pressed:text-accent-foreground'
          )}
        >
          {t(option.labelKey)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
