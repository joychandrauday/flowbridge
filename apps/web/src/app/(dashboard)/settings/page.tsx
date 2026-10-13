import { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { isEncryptedPayload } from '@/lib/crypto'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IntegrationCards } from './integration-cards'
import { WorkspaceSettings } from './workspace-settings'
import { ApiKeys } from './api-keys'
import { setMemberAvailability, setMemberRole } from './actions'

export const metadata: Metadata = {
  title: 'Settings | FlowBridge',
}

const ROLE_OPTIONS = ['OWNER', 'ADMIN', 'AGENT'] as const

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

  const actor = members.find((member) => member.userId === session.user.id)
  const canManage = actor?.role === 'OWNER' || actor?.role === 'ADMIN'
  const isOwner = actor?.role === 'OWNER'

  const requestHeaders = headers()
  const origin = `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${
    requestHeaders.get('host') ?? 'localhost:3000'
  }`

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
          {workspace?.name ?? 'Workspace'} · manage the workspace, integrations, members, and API access
        </p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="api">API keys</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="space-y-4">
          <WorkspaceSettings
            name={workspace?.name ?? ''}
            slug={workspace?.slug ?? ''}
            webhookConfigured={Boolean(workspace?.webhookSecret)}
            origin={origin}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <IntegrationCards integrations={publicIntegrations} />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>People in this workspace, their roles, and availability.</CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <ul className="divide-y">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.user.name ?? 'Unnamed'}
                          {member.userId === session.user.id && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Availability toggle — drives round-robin assignment. */}
                        {canManage ? (
                          <form action={setMemberAvailability}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input type="hidden" name="available" value={String(!member.available)} />
                            <Button type="submit" variant="outline" size="sm">
                              {member.available ? 'Available' : 'Unavailable'}
                            </Button>
                          </form>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {member.available ? 'Available' : 'Unavailable'}
                          </span>
                        )}

                        {/* Role — owners can reassign; everyone else sees a badge. */}
                        {isOwner && member.userId !== session.user.id && member.role !== 'OWNER' ? (
                          <form action={setMemberRole} className="flex items-center gap-2">
                            <input type="hidden" name="memberId" value={member.id} />
                            <select
                              name="role"
                              defaultValue={member.role}
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" variant="outline" size="sm">
                              Save
                            </Button>
                          </form>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {member.role}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Team invitations land in the member-management phase.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <ApiKeys
            keys={apiKeys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              scopes: key.scopes,
              lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
            }))}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
