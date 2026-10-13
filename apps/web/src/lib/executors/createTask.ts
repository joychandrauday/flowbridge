import { StepExecutor, StepResult, ExecutorContext, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'

export const createTaskExecutor: StepExecutor = {
  type: 'create_task',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead, workflowRun, workspace } = context
    const { title, description, dueInMinutes, dueAt, assigneeStrategy, assigneeId, role } = config as {
      title: string
      description?: string
      dueInMinutes?: number
      dueAt?: string
      assigneeStrategy?: string
      assigneeId?: string
      role?: string
    }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    const templateContext = {
      lead: leadTemplate(lead),
      assignee: context.assignee
        ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
        : undefined,
      workspace,
      trigger: { type: 'workflow', config: {} },
      now: new Date().toISOString(),
      uuid: crypto.randomUUID(),
    }
    const renderedTitle = renderTemplateValue(title, templateContext)
    const renderedDescription = description ? renderTemplateValue(description, templateContext) : undefined

    let targetAssigneeId: string | undefined = assigneeId

    if (!targetAssigneeId && assigneeStrategy === 'lead_assignee') {
      targetAssigneeId = lead.assigneeId
    }

    if (!targetAssigneeId && assigneeStrategy === 'round_robin') {
      const members = await prisma.member.findMany({
        where: { workspaceId: lead.workspaceId, available: true },
        orderBy: { createdAt: 'asc' },
      })
      if (members.length > 0) {
        const runCount = await prisma.workflowRun.count({
          where: { workflowId: workflowRun.workflowId, leadId: lead.id },
        })
        targetAssigneeId = members[runCount % members.length].id
      }
    }

    if (!targetAssigneeId && assigneeStrategy === 'least_open_leads') {
      const membersWithCounts = await prisma.member.findMany({
        where: { workspaceId: lead.workspaceId, available: true },
        include: {
          _count: {
            select: { assignedLeads: { where: { status: { in: ['NEW', 'CONTACTED'] } } } },
          },
        },
        orderBy: { assignedLeads: { _count: 'asc' } },
      })
      targetAssigneeId = membersWithCounts[0]?.id ?? undefined
    }

    if (!targetAssigneeId && assigneeStrategy === 'role') {
      const member = await prisma.member.findFirst({
        where: { workspaceId: lead.workspaceId, role: role as any, available: true },
        orderBy: { createdAt: 'asc' },
      })
      targetAssigneeId = member?.id ?? undefined
    }

    let dueDate: Date | null = null
    if (dueInMinutes) {
      dueDate = new Date(Date.now() + dueInMinutes * 60 * 1000)
    } else if (dueAt) {
      const rendered = renderTemplateValue(dueAt, templateContext)
      dueDate = new Date(rendered)
    }

    const task = await prisma.task.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        title: renderedTitle,
        description: renderedDescription,
        dueAt: dueDate,
        assigneeId: targetAssigneeId,
        createdByRunId: workflowRun.id,
      },
    })

    return { success: true, output: { taskId: task.id } }
  },
}