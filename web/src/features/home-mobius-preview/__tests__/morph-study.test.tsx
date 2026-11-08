/* Copyright (C) 2023-2026 QuantumNous — AGPL-3.0-or-later */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { MorphStudy } from '../morph-study'

const renderer = vi.hoisted(() => ({
  setActive: vi.fn(),
  seek: vi.fn(),
  setRate: vi.fn(),
  setStructure: vi.fn(),
  destroy: vi.fn(),
  onFrame: undefined as ((time: number) => void) | undefined,
}))
vi.mock('../lib/morph-renderer', () => ({
  createMorphRenderer: (
    _canvas: HTMLCanvasElement,
    onFrame: (time: number) => void
  ) => {
    renderer.onFrame = onFrame
    return renderer
  },
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('selecting a key model pauses the loop and exposes its exact timeline position', async () => {
  render(<MorphStudy />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Model 04' }))
  expect(renderer.seek).toHaveBeenLastCalledWith(12)
  expect(screen.getByRole('button', { name: 'Model 04' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(
    screen.getByRole('button', { name: 'Play visual effects' })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('slider', { name: 'Timeline' })).toHaveValue('12')
})

it('scrubbing pauses at an intermediate model, and replay resumes from the first model', async () => {
  render(<MorphStudy />)
  const user = userEvent.setup()
  fireEvent.change(screen.getByRole('slider', { name: 'Timeline' }), {
    target: { value: '6.5' },
  })
  expect(renderer.seek).toHaveBeenLastCalledWith(6.5)
  await user.click(screen.getByRole('button', { name: 'Replay animation' }))
  expect(renderer.seek).toHaveBeenLastCalledWith(0)
  expect(
    screen.getByRole('button', { name: 'Pause visual effects' })
  ).toHaveAttribute('aria-pressed', 'false')
  await user.click(screen.getByRole('button', { name: 'Model' }))
  expect(renderer.setStructure).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Model' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await user.click(screen.getByRole('button', { name: '0.5×' }))
  expect(renderer.setRate).toHaveBeenLastCalledWith(0.5)
})

it('playing frames keep the timeline and active shape in sync without stealing keyboard focus', () => {
  render(<MorphStudy />)
  const timeline = screen.getByRole('slider', { name: 'Timeline' })
  timeline.focus()
  act(() => renderer.onFrame?.(8.25))
  expect(timeline).toHaveValue('8.25')
  expect(screen.getByRole('button', { name: 'Model 03' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('status')).toHaveTextContent('08.25 / 24.00 s')
  expect(timeline).toHaveFocus()
  act(() => renderer.onFrame?.(0.02))
  expect(timeline).toHaveValue('0.02')
  expect(screen.getByRole('button', { name: 'Model 01' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})
