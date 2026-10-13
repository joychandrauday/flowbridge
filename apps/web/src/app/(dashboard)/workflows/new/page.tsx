import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { redirect } from 'next/navigation'
import { WorkflowEditor } from '../workflow-editor'

export const metadata: Metadata = {
  title: 'New Workflow | FlowBridge',
}

export default async function NewWorkflowPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const [leads, members] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.member.findMany({
      where: { workspaceId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <WorkflowEditor leads={leads} members={members} />
    </div>
  )
}