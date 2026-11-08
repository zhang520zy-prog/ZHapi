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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useHomeMotion } from '../hooks/use-home-motion'

const LINES = [
  { command: true, text: 'relaydesk doctor', result: '' },
  {
    command: false,
    text: '→ git · node · python · reachability',
    result: 'ok',
  },
  {
    command: false,
    text: '→ proxy · dir writable · 3 cli found',
    result: 'ok',
  },
  { command: true, text: 'relaydesk apply', result: '' },
  { command: false, text: '[01] MODEL  your-model', result: 'selected' },
  {
    command: false,
    text: '[02] APP    claude · codex · gemini',
    result: '3 targets',
  },
  { command: false, text: '[03] APPLY  group key + config', result: 'ok' },
  { command: false, text: '✓ 3 tools wired — ready', result: '' },
] as const

export function RelayDeskTerminal(props: { paused: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const active = useHomeMotion(ref, props.paused)
  const [progress, setProgress] = useState({ line: 0, characters: 0 })

  useEffect(() => {
    if (!active) return
    let line = 0
    let characters = 0
    let timer: number
    const tick = () => {
      const current = LINES[line]
      if (!current) {
        line = 0
        characters = 0
        setProgress({ line: 0, characters: 0 })
        timer = window.setTimeout(tick, 550)
        return
      }
      if (current.command && characters < current.text.length) {
        characters += 1
        setProgress({ line, characters })
        timer = window.setTimeout(tick, 55)
      } else {
        line += 1
        characters = 0
        setProgress({ line, characters })
        timer = window.setTimeout(tick, line === LINES.length ? 4600 : 380)
      }
    }
    setProgress({ line: 0, characters: 0 })
    timer = window.setTimeout(tick, 550)
    return () => window.clearTimeout(timer)
  }, [active])

  return (
    <div ref={ref} className='relaydesk-mock' data-animating={active}>
      <div className='relaydesk-mock-bar'>
        <i aria-hidden='true' />
        <i aria-hidden='true' />
        <i aria-hidden='true' />
        <span>relaydesk — {t('Illustrative demo')}</span>
      </div>
      <div className='relaydesk-mock-body' aria-hidden='true'>
        {LINES.map((line, index) => {
          const visible = !active || index <= progress.line
          let text: string = line.text
          if (active && index === progress.line && line.command) {
            text = text.slice(0, progress.characters)
          }
          return (
            <p key={line.text} data-visible={visible}>
              {line.command && <b>$</b>}
              <span>{text}</span>
              <em>{line.result}</em>
            </p>
          )
        })}
        <p className='relaydesk-mock-cursor'>
          <b>$</b>
          <i className='relaydesk-cursor' />
        </p>
      </div>
    </div>
  )
}
