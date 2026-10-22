import { useEffect, useState } from 'react'

// Per-viewer display preference (theme). index.html applies the same logic before first paint.
const PREFS_KEY = 'ttgen:prefs'
const DEFAULTS = { theme: 'system' }

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
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // preferences are a convenience only
    }
    // Always print in the light theme; restore the chosen theme afterwards.
    const beforePrint = () => root.classList.remove('dark')
    media.addEventListener('change', apply)
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', apply)
    return () => {
      media.removeEventListener('change', apply)
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', apply)
    }
  }, [prefs])

  return [prefs, (changes) => setPrefs((p) => ({ ...p, ...changes }))]
}
