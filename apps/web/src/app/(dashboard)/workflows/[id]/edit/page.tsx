import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { notFound, redirect } from 'next/navigation'
import { WorkflowEditor } from '../../workflow-editor'

export const metadata: Metadata = {
  title: 'Edit Workflow | FlowBridge',
}

export default async function EditWorkflowPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const [workflow, leads, members] = await Promise.all([
    prisma.workflow.findFirst({ where: { id: params.id, workspaceId } }),
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
  if (!workflow) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <WorkflowEditor
        workflowId={workflow.id}
        initialName={workflow.name}
        initialDescription={workflow.description}
        initialDefinition={workflow.definition}
        leads={leads}
        members={members}
      />
    </div>
  )
}