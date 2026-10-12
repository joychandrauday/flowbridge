'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const sidebarVariants = cva(
  'fixed left-0 top-0 z-40 w-64 h-screen border-r bg-sidebar transition-transform duration-200 ease-linear data-[state=open]:translate-x-0 data-[state=closed]:translate-x-[-100%] data-[side=left]:-translate-x-full data-[side=right]:translate-x-full',
  {
    variants: {
      variant: {
        sidebar: '',
        floating: 'rounded-xl border shadow',
        inset: 'border-r shadow-sm',
      },
      collapsible: {
        icon: 'w-64 data-[state=open]:w-64 data-[state=closed]:w-16',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'sidebar',
      collapsible: 'none',
    },
  }
)

interface SidebarProps extends React.ComponentProps<'aside'>, VariantProps<typeof sidebarVariants> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, variant, collapsible, children, open = true, onOpenChange, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        data-state={open ? 'open' : 'closed'}
        data-collapsible={collapsible === 'icon' ? 'icon' : 'none'}
        data-variant={variant}
        className={cn(sidebarVariants({ variant, collapsible }), className)}
        {...props}
      >
        {children}
        <SidebarToggle onClick={() => onOpenChange?.(!open)} />
      </aside>
    )
  }
)
Sidebar.displayName = 'Sidebar'

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col h-full', className)}
      {...props}
    />
  )
)
SidebarContent.displayName = 'SidebarContent'

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('relative flex w-full min-w-0 flex-col p-2', className)} {...props} />
  )
)
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('duration-200 text-xs font-medium text-muted-foreground/70', className)}
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
    <ul ref={ref} className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
  )
)
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('group/menu-item relative w-full', className)} {...props} />
  )
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

const sidebarMenuButtonVariants = cva(
  'flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-side=left]]:rounded-r-md group-has-[[data-side=right]]:rounded-l-md data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'text-sidebar-foreground',
        outline: 'bg-background shadow-[0_0_0_1px]_hsl(var(--sidebar-border))',
      },
      size: {
        default: 'h-9 text-sm',
        sm: 'h-8 text-xs',
        lg: 'h-10 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface SidebarMenuButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean
  isActive?: boolean
}

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, asChild = false, isActive, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants(), className)}
        {...props}
      />
    )
  }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex w-full items-center', className)} {...props} />
  )
)
SidebarFooter.displayName = 'SidebarFooter'

const SidebarToggle = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, onClick, ...props }, ref) => (
    <button
      ref={ref}
      className={cn('absolute right-0 top-0 z-50 flex size-9 items-center justify-center -translate-x-1/2 border-none bg-transparent text-sidebar-foreground', className)}
      onClick={onClick}
      {...props}
    >
      <span className="sr-only">Toggle sidebar</span>
    </button>
  )
)
SidebarToggle.displayName = 'SidebarToggle'

const SidebarProvider = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('group has-data-[collapsible=icon]:w-16', className)} {...props} />
  )
)
SidebarProvider.displayName = 'SidebarProvider'

const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-1 min-w-0 group-has-[[data-variant=inset]]:ml-64', className)} {...props} />
  )
)
SidebarInset.displayName = 'SidebarInset'

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, onClick, ...props }, ref) => (
    <button
      ref={ref}
      className={cn('flex h-10 w-10 items-center justify-center rounded-md bg-background text-foreground shadow-sm', className)}
      onClick={onClick}
      {...props}
    />
  )
)
SidebarTrigger.displayName = 'SidebarTrigger'

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
}