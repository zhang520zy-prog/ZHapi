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
import { Check, ChevronRight, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import { TitledCard } from '@/components/ui/titled-card'
import { cn } from '@/lib/utils'

import type {
  SecurityScore,
  SecurityScoreSection,
} from '../hooks/use-security-score'

interface SecurityScoreCardProps {
  score: SecurityScore
  onSelect: (section: SecurityScoreSection) => void
}

export function SecurityScoreCard(props: SecurityScoreCardProps) {
  const { t } = useTranslation()
  const score = props.score
  const percent = score.total === 0 ? 0 : (score.completed / score.total) * 100

  return (
    <TitledCard
      title={t('Security score')}
      description={t('Keep your account protected')}
      icon={<ShieldCheck className='h-4 w-4' />}
      iconTone='success'
      disableHoverEffect
    >
      <div className='space-y-3'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Completed {{completed}} of {{total}}', {
              completed: score.completed,
              total: score.total,
            })}
          </span>
          <span className='text-foreground font-mono text-xs font-semibold tabular-nums'>
            {score.completed}/{score.total}
          </span>
        </div>
        <Progress value={percent} aria-label={t('Security score')} />
        <ul className='space-y-1'>
          {score.items.map((item) => {
            const row = (
              <>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    item.completed
                      ? 'bg-success/15 text-success'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Check className='size-3' aria-hidden='true' />
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs',
                    item.completed
                      ? 'text-muted-foreground'
                      : 'text-foreground font-medium'
                  )}
                >
                  {t(item.labelKey)}
                </span>
                {!item.completed && (
                  <ChevronRight
                    className='text-muted-foreground size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                )}
              </>
            )

            return (
              <li key={item.key}>
                {item.completed ? (
                  <div className='flex items-center gap-2 px-1 py-1.5'>
                    {row}
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => props.onSelect(item.section)}
                    className='hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors outline-none focus-visible:ring-[3px]'
                  >
                    {row}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </TitledCard>
  )
}
