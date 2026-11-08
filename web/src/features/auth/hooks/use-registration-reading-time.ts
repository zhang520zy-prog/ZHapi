import { useEffect, useState } from 'react'

export const REGISTRATION_READING_SECONDS = 6

/** A presentation delay, not an authentication or proof-of-reading control. */
export function useRegistrationReadingTime() {
  const [secondsLeft, setSecondsLeft] = useState(REGISTRATION_READING_SECONDS)

  useEffect(() => {
    let elapsed = 0
    let visibleSince: number | null = null
    let timer: number | undefined
    const duration = REGISTRATION_READING_SECONDS * 1000

    function updateElapsed() {
      if (visibleSince !== null) {
        const now = performance.now()
        elapsed = Math.min(duration, elapsed + now - visibleSince)
        visibleSince = now
      }
      setSecondsLeft(Math.ceil((duration - elapsed) / 1000))
      if (elapsed >= duration) window.clearInterval(timer)
    }

    function updateVisibility() {
      updateElapsed()
      window.clearInterval(timer)
      visibleSince = null
      if (document.visibilityState === 'visible' && elapsed < duration) {
        visibleSince = performance.now()
        timer = window.setInterval(updateElapsed, 100)
      }
    }

    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  return secondsLeft
}
