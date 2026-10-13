import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const publicRoutes = ['/login', '/register', '/api/intake', '/api/webhooks', '/embed', '/api/health']

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  // Allow public routes
  if (publicRoutes.some((route) => nextUrl.pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    nextUrl.pathname.startsWith('/_next') ||
    nextUrl.pathname.startsWith('/favicon') ||
    nextUrl.pathname.startsWith('/embed')
  ) {
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn || !req.auth) {
    const loginUrl = new URL('/login', nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check if user has workspace
  if (!req.auth.user.workspaceId) {
    return NextResponse.redirect(new URL('/onboarding', nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Protect dashboard pages only. All /api routes manage their own auth
     * (NextAuth handlers, CRON_SECRET for /api/internal/tick, form-scoped
     * lookup for /api/intake) — the middleware must never hijack them.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|embed|login|register|onboarding).*)',
  ],
}