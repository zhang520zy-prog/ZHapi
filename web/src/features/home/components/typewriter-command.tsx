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

import { useHomeMotion } from '../hooks/use-home-motion'

const COMMAND = 'POST /v1/chat/completions'

export function TypewriterCommand(props: { paused: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const active = useHomeMotion(ref, props.paused)
  const [length, setLength] = useState(COMMAND.length)

  useEffect(() => {
    if (!active) return
    let current = 0
    setLength(0)
    const timer = window.setInterval(() => {
      current += 1
      setLength(current)
      if (current >= COMMAND.length) window.clearInterval(timer)
    }, 55)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <code ref={ref} aria-label={COMMAND} data-animating={active}>
      <span aria-hidden='true'>
        {active ? COMMAND.slice(0, length) : COMMAND}
      </span>
      <i className='relaydesk-cursor' aria-hidden='true' />
    </code>
  )
}
