'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The navigation rail.
 *
 * A dark navy rail is the one large area of brand colour in the product, which
 * is why the mark sits here. It is a *rail* rather than a drawer: on desktop it
 * collapses to an icon strip instead of sliding away, so the shape of the app
 * stays stable while you work. On narrow screens the same component becomes an
 * off-canvas drawer.
 *
 * Widths are constants rather than arbitrary values because `SidebarInset` has to
 * match them exactly or the content will drift by a few pixels on collapse.
 */
const WIDTH_EXPANDED = 'w-[236px]'
const WIDTH_COLLAPSED = 'md:w-[68px]'
const PAD_EXPANDED = 'md:pl-[236px]'
const PAD_COLLAPSED = 'md:pl-[68px]'

const RAIL_TRANSITION = 'transition-[transform,width] duration-flow-base ease-flow'

interface SidebarProps extends React.ComponentProps<'aside'> {
  /** Expanded (true) or collapsed to an icon strip (false). */
  open?: boolean
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, open = true, children, ...props }, ref) => (
    <aside
      ref={ref}
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'group/sidebar fixed inset-y-0 left-0 z-40 flex flex-col',
        'border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        RAIL_TRANSITION,
        open
          ? cn('translate-x-0', WIDTH_EXPANDED)
          : cn('-translate-x-full', WIDTH_EXPANDED, WIDTH_COLLAPSED, 'md:translate-x-0'),
        className
      )}
      {...props}
    >
      {children}
    </aside>
  )
)
Sidebar.displayName = 'Sidebar'

/** Brand lockup row at the top of the rail. */
const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4',
        'md:group-data-[state=closed]/sidebar:justify-center md:group-data-[state=closed]/sidebar:px-0',
        className
      )}
      {...props}
    />
  )
)
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('scrollbar-slim flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4', className)}
      {...props}
    />
  )
)
SidebarContent.displayName = 'SidebarContent'

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('shrink-0 border-t border-sidebar-border p-3', className)}
      {...props}
    />
  )
)
SidebarFooter.displayName = 'SidebarFooter'

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex w-full min-w-0 flex-col gap-1 px-3', className)} {...props} />
  )
)
SidebarGroup.displayName = 'SidebarGroup'

/** A quiet section label; hidden when the rail is collapsed. */
const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'px-2.5 pb-1 text-2xs font-semibold text-sidebar-foreground/55',
        'md:group-data-[state=closed]/sidebar:invisible md:group-data-[state=closed]/sidebar:h-0 md:group-data-[state=closed]/sidebar:overflow-hidden md:group-data-[state=closed]/sidebar:pb-0',
        className
      )}
      {...props}
    />
  )
)
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('w-full', className)} {...props} />
  )
)
SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex w-full min-w-0 flex-col gap-0.5', className)} {...props} />
  )
)
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('relative w-full', className)} {...props} />
  )
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

/**
 * A nav item. The active state is carried by a filled background *and* a short
 * azure bar on the leading edge — colour alone is not a reliable signal for
 * colour-blind users, and the bar also survives the collapsed icon strip.
 *
 * Any trailing `<span>` is treated as the label and hidden when collapsed, which
 * keeps call sites free of layout conditionals.
 */
interface SidebarMenuButtonProps extends React.ComponentProps<'button'> {
  asChild?: boolean
  isActive?: boolean
}

const SidebarMenuButton = React.forwardRef<HTMLElement, SidebarMenuButtonProps>(
  ({ className, asChild = false, isActive, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref as never}
        data-active={isActive ? 'true' : 'false'}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-[13px] font-medium',
          'text-sidebar-foreground/85 transition-colors duration-flow ease-flow',
          'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
          '[&>svg]:size-4 [&>svg]:shrink-0',
          'md:group-data-[state=closed]/sidebar:justify-center md:group-data-[state=closed]/sidebar:gap-0 md:group-data-[state=closed]/sidebar:px-0',
          'md:group-data-[state=closed]/sidebar:[&>span:last-child]:hidden',
          className
        )}
        {...props}
      >
        {isActive ? (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-brand"
          />
        ) : null}
        {children}
      </Comp>
    )
  }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

/** Collapse/expand control. On mobile it dismisses the drawer. */
const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { open?: boolean }
>(({ className, open = true, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'grid size-8 place-items-center rounded-control text-sidebar-foreground/70',
      'transition-colors duration-flow ease-flow hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      className
    )}
    {...props}
  >
    {open ? (
      <PanelLeftClose className="size-4" aria-hidden="true" />
    ) : (
      <PanelLeftOpen className="size-4" aria-hidden="true" />
    )}
    <span className="sr-only">{open ? 'Collapse navigation' : 'Expand navigation'}</span>
  </button>
))
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { open?: boolean }>(
  ({ className, open = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex min-h-svh min-w-0 flex-1 flex-col',
        'transition-[padding] duration-flow-base ease-flow',
        open ? PAD_EXPANDED : PAD_COLLAPSED,
        className
      )}
      {...props}
    />
  )
)
SidebarInset.displayName = 'SidebarInset'

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
}
