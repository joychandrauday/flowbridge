import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getEngineHeartbeat } from '@/lib/heartbeat'

/**
 * Dashboard shell (server component).
 *
 * The heart of the redesign: convert this to a server boundary so we can fetch
 * the engine heartbeat in one go, pass plain serialisable data down to the client
 * shell, and keep the heavy client logic (pathname, signOut, localStorage) to the
 * `AppShell` client component. The heartbeat stays scoped to the signed-in
 * workspace, so it never leaks cross-tenant information.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/onboarding')

  const [heartbeat] = await Promise.all([
    getEngineHeartbeat(session.user.workspaceId),
  ])

  return (
    <AppShell
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      heartbeat={heartbeat}
      serverNow={Date.now()}
    >
      {children}
    </AppShell>
  )
}
