import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

/**
 * Two typefaces, two jobs.
 *
 * Archivo carries the interface: a grotesque with square-cut terminals and a
 * sturdy, slightly industrial voice that suits an operations tool, without the
 * ubiquity of Inter/Geist. IBM Plex Mono is reserved for machine data only —
 * run ids, durations, step keys, cron expressions, JSON — where tabular figures
 * and unambiguous glyphs (0 vs O, 1 vs l) actually matter.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'FlowBridge — lead-to-action automation',
    template: '%s · FlowBridge',
  },
  description:
    'Every lead saved, assigned, notified and followed up automatically — with a run history that shows exactly what happened.',
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1a2b' },
  ],
}

/**
 * Applies the saved theme before first paint so dark mode never flashes white.
 * Deliberately a tiny inline script rather than a dependency.
 */
const themeBootstrap = `(function(){try{var s=localStorage.getItem('fb-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s!=='light'&&d)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${archivo.variable} ${plexMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
