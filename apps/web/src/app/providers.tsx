'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { Toaster } from '@/components/ui/toaster'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  )
}