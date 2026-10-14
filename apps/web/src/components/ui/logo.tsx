import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The brand mark.
 *
 * `logo.png` is the wide mark on the source's own white field; `logo-tile.png`
 * is that same field cropped square. The mark carries navy accents, so on a dark
 * surface it needs the white tile behind it or those accents vanish — hence two
 * assets rather than one.
 *
 * Corner radii stay under ~19% of the length on purpose: the mark occupies the
 * middle 79%×53% of the tile, and anything rounder starts clipping its diagonal
 * tips.
 */

/** The mark alone, for light surfaces where the white field is invisible. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={320}
      height={215}
      priority
      className={cn('h-5 w-auto', className)}
    />
  )
}

/** The mark on its white tile, for dark surfaces (the sidebar rail). */
export function LogoTile({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-tile.png"
      alt=""
      width={128}
      height={128}
      priority
      className={cn('size-8 rounded-[6px]', className)}
    />
  )
}

/** Mark plus wordmark — the full lockup used at the top of the rail. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoTile />
      <span className="text-[15px] font-semibold tracking-display text-sidebar-accent-foreground">
        FlowBridge
      </span>
    </span>
  )
}
