import { useEffect, useState } from 'react'

// Per-viewer display preferences. index.html applies the same logic before first paint.
const PREFS_KEY = 'ttgen:prefs'
export const TEXT_SIZES = { normal: 16, large: 18, xl: 20 }
const DEFAULTS = { theme: 'system', textSize: 'large' }

function readPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY)) }
  } catch {
    return DEFAULTS
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    root.style.fontSize = `${TEXT_SIZES[prefs.textSize] ?? 18}px`
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // preferences are a convenience only
    }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs])

  return [prefs, (changes) => setPrefs((p) => ({ ...p, ...changes }))]
}
