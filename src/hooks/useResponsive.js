import { useState, useEffect } from 'react'

/**
 * Hook that returns true when the viewport is narrower than the given breakpoint.
 * Defaults to false (wide) to avoid narrow-mode flash on initial render.
 * @param {number} [breakpoint=1030] - Width in pixels
 * @returns {boolean}
 */
export function useResponsive(breakpoint = 1030) {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)

    const handleChange = (e) => {
      setIsNarrow(e.matches)
    }

    // Set correct initial value
    setIsNarrow(mediaQuery.matches)

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [breakpoint])

  return isNarrow
}
