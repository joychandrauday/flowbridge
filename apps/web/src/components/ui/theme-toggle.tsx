'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Dark mode is first-class (SPEC §10), so it gets a permanent control rather
 * than hiding inside a settings page.
 *
 * The class is applied before first paint by the inline script in the root
 * layout; this component only reads the current state and flips it, so there is
 * no flash of the wrong theme on load.
 */
const STORAGE_KEY = 'fb-theme'

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    setMounted(true)
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    } catch {
      // Private mode: the preference simply does not persist.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={className}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {/* Both icons are always mounted so the swap never shifts layout. */}
      <Sun className={mounted && isDark ? 'hidden' : 'block'} aria-hidden="true" />
      <Moon className={mounted && isDark ? 'block' : 'hidden'} aria-hidden="true" />
    </Button>
  )
}
