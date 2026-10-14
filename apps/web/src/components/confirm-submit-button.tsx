'use client'

import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmSubmitButtonProps extends ComponentProps<typeof Button> {
  /** Message shown in the native confirm dialog before the form submits. */
  confirmText: string
}

/**
 * A submit button that asks for confirmation first. Drop it inside a
 * `<form action={serverAction}>` for destructive actions (delete a lead, etc.)
 * without turning the whole page into a client component.
 */
export function ConfirmSubmitButton({
  confirmText,
  children,
  ...buttonProps
}: ConfirmSubmitButtonProps) {
  return (
    <Button
      type="submit"
      {...buttonProps}
      onClick={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault()
      }}
    >
      {children}
    </Button>
  )
}
