import { Suspense } from 'react'
import { isDemoLoginEnabled, resolveDemoAccount } from '@flowbridge/core'
import LoginForm from './login-form'

export default function LoginPage() {
  // Only offer Google when it is genuinely configured. The button used to render
  // unconditionally, so clicking it sent an empty client_id to Google, which
  // answered "Access blocked: Authorization Error — The OAuth client was not
  // found (Error 401: invalid_client)" — a dead end for the visitor.
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  // Demo credentials come from the same resolver the seed uses, so what the page
  // advertises is exactly what exists in the database.
  const demoEnabled = isDemoLoginEnabled(process.env)
  const demo = resolveDemoAccount(process.env)

  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/50" aria-hidden />}>
      <LoginForm
        googleEnabled={googleEnabled}
        demoEnabled={demoEnabled}
        demoEmail={demo.email}
        demoPassword={demo.password}
      />
    </Suspense>
  )
}
