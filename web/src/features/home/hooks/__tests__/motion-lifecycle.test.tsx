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
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useHomeMotion } from '../use-home-motion'

let onIntersection: IntersectionObserverCallback
let onMotionChange: (event: MediaQueryListEvent) => void
let query: MediaQueryList
const disconnect = vi.fn()

function MotionStatus(props: { paused: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useHomeMotion(ref, props.paused)
  return (
    <div ref={ref} role='status'>
      {active ? 'Playing' : 'Static'}
    </div>
  )
}

beforeEach(() => {
  disconnect.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersection = callback
      }
      observe() {}
      disconnect = disconnect
    }
  )
  query = {
    matches: false,
    addEventListener: vi.fn((_event, callback) => {
      onMotionChange = callback as (event: MediaQueryListEvent) => void
    }),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockReturnValue(query)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setVisible(visible: boolean) {
  act(() =>
    onIntersection(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  )
}

it('only visible, unpaused content runs and observer ownership ends on unmount', () => {
  const view = render(<MotionStatus paused={false} />)
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  setVisible(true)
  expect(screen.getByRole('status')).toHaveTextContent('Playing')
  view.rerender(<MotionStatus paused />)
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  setVisible(false)
  view.rerender(<MotionStatus paused={false} />)
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  setVisible(true)
  expect(screen.getByRole('status')).toHaveTextContent('Playing')
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(query.removeEventListener).toHaveBeenCalledWith(
    'change',
    onMotionChange
  )
})

it('changing the reduced-motion preference stops playback and a pause toggle cannot bypass it', () => {
  const view = render(<MotionStatus paused={false} />)
  setVisible(true)
  act(() => onMotionChange({ matches: true } as MediaQueryListEvent))
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  view.rerender(<MotionStatus paused />)
  view.rerender(<MotionStatus paused={false} />)
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  act(() => onMotionChange({ matches: false } as MediaQueryListEvent))
  expect(screen.getByRole('status')).toHaveTextContent('Playing')
})

it('pagehide suspends playback and pageshow resumes only when still visible and unpaused', () => {
  const view = render(<MotionStatus paused={false} />)
  setVisible(true)
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(screen.getByRole('status')).toHaveTextContent('Static')
  act(() => window.dispatchEvent(new Event('pageshow')))
  expect(screen.getByRole('status')).toHaveTextContent('Playing')
  view.rerender(<MotionStatus paused />)
  act(() => window.dispatchEvent(new Event('pagehide')))
  act(() => window.dispatchEvent(new Event('pageshow')))
  expect(screen.getByRole('status')).toHaveTextContent('Static')
})
