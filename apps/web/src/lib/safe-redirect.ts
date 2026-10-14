/**
 * Same-origin guard for post-login redirects.
 *
 * `callbackUrl` arrives from the query string, so it is attacker-controlled.
 * Only a site-relative path is honoured. A bare `startsWith('/')` is not enough:
 * `//evil.com` is a *protocol-relative* URL (the browser fills in the current
 * scheme), so `/login?callbackUrl=//evil.com` would bounce a freshly
 * authenticated user off-site. `/\evil.com` is the same trick, because browsers
 * normalise backslashes in the authority to forward slashes.
 *
 * Anything else — absolute URLs, `javascript:`, blank, missing — falls back to
 * the workspace dashboard.
 */
export function safeCallbackUrl(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate) return '/dashboard'
  if (!candidate.startsWith('/')) return '/dashboard'
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return '/dashboard'
  return candidate
}
