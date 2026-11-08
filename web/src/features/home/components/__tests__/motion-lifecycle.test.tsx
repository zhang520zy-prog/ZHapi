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
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { RelayDeskTerminal } from '../relaydesk-terminal'
import { TypewriterCommand } from '../typewriter-command'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('pausing the visible command and demo shows complete static text and releases timers on pause and unmount', () => {
  vi.useFakeTimers()
  const callbacks: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as MediaQueryList)
  const view = render(
    <>
      <TypewriterCommand paused={false} />
      <RelayDeskTerminal paused={false} />
    </>
  )
  act(() =>
    callbacks.forEach((callback) =>
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    )
  )
  const command = screen.getByLabelText('POST /v1/chat/completions')
  act(() => vi.advanceTimersByTime(55))
  expect(command).toHaveTextContent(/^P$/)
  view.rerender(
    <>
      <TypewriterCommand paused />
      <RelayDeskTerminal paused />
    </>
  )
  expect(command).toHaveTextContent('POST /v1/chat/completions')
  expect(screen.getByText('✓ 3 tools wired — ready')).toBeInTheDocument()
  expect(vi.getTimerCount()).toBe(0)
  view.rerender(
    <>
      <TypewriterCommand paused={false} />
      <RelayDeskTerminal paused={false} />
    </>
  )
  act(() => vi.advanceTimersByTime(55))
  expect(command).toHaveTextContent(/^P$/)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
