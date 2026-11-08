/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { Box, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHomeMotion } from '@/features/home/hooks/use-home-motion'

import '@/styles/morph-study.css'

import { MORPH_DURATION } from './lib/morph-model'
import { createMorphRenderer, type MorphRenderer } from './lib/morph-renderer'

const KEY_TIMES = [0, 4, 8, 12, 16, 20] as const

export function MorphStudy() {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLOutputElement>(null)
  const rendererRef = useRef<MorphRenderer | null>(null)
  const selectedRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [selected, setSelected] = useState(0)
  const [rate, setRate] = useState(0.5)
  const [structure, setStructure] = useState(false)
  const [supported, setSupported] = useState(true)
  const active = useHomeMotion(canvasRef, paused)

  // The canvas clock updates only its readout and slider. React changes once per key shape.
  function updateTimeline(time: number) {
    if (timelineRef.current) timelineRef.current.value = String(time)
    if (timeRef.current) {
      timeRef.current.textContent = `${time.toFixed(2).padStart(5, '0')} / ${MORPH_DURATION}.00 s`
    }
    const key = Math.min(5, Math.floor(time / 4))
    if (key !== selectedRef.current) {
      selectedRef.current = key
      setSelected(key)
    }
  }
  const onFrameRef = useRef(updateTimeline)
  onFrameRef.current = updateTimeline

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createMorphRenderer(canvas, (time) =>
      onFrameRef.current(time)
    )
    rendererRef.current = renderer
    setSupported(!!renderer)
    renderer?.setRate(0.5)
    setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => {
      renderer?.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setActive(active)
  }, [active])

  function seek(time: number) {
    rendererRef.current?.seek(time)
    updateTimeline(time)
  }

  return (
    <main className='morph-study'>
      <header className='morph-study__header'>
        <a className='morph-study__brand' href='./' aria-label={t('Back')}>
          <span className='morph-study__mark'>N</span>
          <span>
            NEW API <i>/</i> MÖBIUS
          </span>
        </a>
        <span className='morph-study__edition'>C / {t('Preview')}</span>
      </header>

      <div className='morph-study__workspace'>
        <section className='morph-study__stage' aria-label={t('Preview')}>
          <div className='morph-study__stage-heading'>
            <span>
              {t('Preview')} <i>/</i> 0{selected + 1}
            </span>
            <output ref={timeRef} className='morph-study__time' aria-live='off'>
              00.00 / 24.00 s
            </output>
          </div>
          <div className='morph-study__canvas-area'>
            <canvas
              ref={canvasRef}
              aria-label={t('Preview')}
              data-testid='morph-canvas'
            />
            {!supported && (
              <p className='morph-study__fallback' role='status'>
                {t('Preview unavailable')}
              </p>
            )}
          </div>
        </section>

        <section className='morph-study__models' aria-label={t('Models')}>
          <div className='morph-study__section-title'>
            <h2>{t('Models')}</h2>
            <span>01 — 06</span>
          </div>
          <div className='morph-study__key-list'>
            {KEY_TIMES.map((time, index) => (
              <Button
                key={time}
                className='morph-study__key'
                variant='ghost'
                disabled={!supported}
                aria-label={`${t('Model')} ${String(index + 1).padStart(2, '0')}`}
                aria-pressed={selected === index}
                onClick={() => {
                  setPaused(true)
                  rendererRef.current?.setActive(false)
                  seek(time)
                }}
              >
                <img
                  className='morph-study__key-image'
                  src={`/morph-study/model-${String(index + 1).padStart(2, '0')}.svg`}
                  alt=''
                />
                <span className='morph-study__key-index'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className='morph-study__key-time'>
                  {time.toFixed(0).padStart(2, '0')}s
                </span>
              </Button>
            ))}
          </div>
        </section>
      </div>

      <footer className='morph-study__controls'>
        <div className='morph-study__transport'>
          <Button
            variant='ghost'
            size='icon'
            disabled={!supported}
            aria-label={
              paused ? t('Play visual effects') : t('Pause visual effects')
            }
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? (
              <Play aria-hidden='true' />
            ) : (
              <Pause aria-hidden='true' />
            )}
          </Button>
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('Replay animation')}
            disabled={!supported}
            onClick={() => {
              seek(0)
              setPaused(false)
            }}
          >
            <RotateCcw aria-hidden='true' />
          </Button>
        </div>
        <label className='morph-study__timeline'>
          <span>{t('Timeline')}</span>
          <Input
            ref={timelineRef}
            aria-label={t('Timeline')}
            type='range'
            disabled={!supported}
            min={0}
            max={MORPH_DURATION}
            step={0.01}
            defaultValue={0}
            onChange={(event) => {
              setPaused(true)
              rendererRef.current?.setActive(false)
              seek(Number(event.currentTarget.value))
            }}
          />
        </label>
        <div className='morph-study__options'>
          <Button
            variant='ghost'
            size='sm'
            aria-label={t('Model')}
            disabled={!supported}
            aria-pressed={structure}
            onClick={() => {
              const next = !structure
              setStructure(next)
              rendererRef.current?.setStructure(next)
            }}
          >
            <Box aria-hidden='true' />
            <span>{t('Model')}</span>
          </Button>
          <span className='morph-study__divider' aria-hidden='true' />
          {[0.5, 1].map((value) => (
            <Button
              key={value}
              variant='ghost'
              size='sm'
              aria-pressed={rate === value}
              disabled={!supported}
              onClick={() => {
                setRate(value)
                rendererRef.current?.setRate(value)
              }}
            >
              {value}×
            </Button>
          ))}
        </div>
      </footer>
    </main>
  )
}
