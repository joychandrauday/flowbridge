import { isDemoLoginEnabled, resolveDemoAccount } from '@flowbridge/core'
import { safeCallbackUrl } from '@/lib/safe-redirect'
import LoginForm from './login-form'

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string | string[] }
}) {
  // Only offer Google when it is genuinely configured. The button used to render
  // unconditionally, so clicking it sent an empty client_id to Google, which
  // answered "Access blocked: Authorization Error — The OAuth client was not
  // found (Error 401: invalid_client)" — a dead end for the visitor.
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  // Demo credentials come from the same resolver the seed uses, so what the page
  // advertises is exactly what exists in the database. Off unless DEMO_LOGIN=true.
  const demoEnabled = isDemoLoginEnabled(process.env)
  const demo = resolveDemoAccount(process.env)

  // `callbackUrl` is read here (server) rather than via `useSearchParams` inside
  // the form on purpose. A client component that calls `useSearchParams` under a
  // statically rendered route is not server-rendered at all — Next bails out with
  // NEXT_DYNAMIC_NO_SSR_CODE — which left the whole sign-in page blank until
  // hydration and empty without JavaScript. Passing it down keeps the form (and
  // the demo panel) in the initial HTML.
  return (
    <LoginForm
      callbackUrl={safeCallbackUrl(searchParams?.callbackUrl)}
      googleEnabled={googleEnabled}
      demoEnabled={demoEnabled}
      demoEmail={demo.email}
      demoPassword={demo.password}
    />
  )
}
