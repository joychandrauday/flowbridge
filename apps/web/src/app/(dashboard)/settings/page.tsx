import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { isEncryptedPayload } from '@/lib/crypto'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IntegrationCards } from './integration-cards'

export const metadata: Metadata = {
  title: 'Settings | FlowBridge',
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

  const [integrations, members, apiKeys] = await Promise.all([
    prisma.integration.findMany({ where: { workspaceId }, orderBy: { type: 'asc' } }),
    prisma.member.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { role: 'asc' },
    }),
    prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const publicIntegrations = integrations.map((i) => ({
    id: i.id,
    type: i.type,
    name: i.name,
    configured: isEncryptedPayload(i.configEnc),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          {workspace?.name ?? 'Workspace'} · manage integrations, members, and API access
        </p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="api">API keys</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4">
          <IntegrationCards integrations={publicIntegrations} />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>People in this workspace and their roles.</CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <ul className="divide-y">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{member.user.name ?? 'Unnamed'}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {member.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Inviting teammates lands in the member-management phase.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>Machine access to intake and workspace data.</CardDescription>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No API keys yet. Key creation and revocation arrive with the API hardening phase.
                </p>
              ) : (
                <ul className="divide-y">
                  {apiKeys.map((key) => (
                    <li key={key.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{key.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {key.prefix}… · {key.scopes.join(', ') || 'no scopes'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {key.lastUsedAt ? `Last used ${key.lastUsedAt.toLocaleDateString()}` : 'Never used'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}