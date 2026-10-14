import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'
import { Role } from '@prisma/client'
import { nextRoundRobinMember } from '../round-robin'
import { touchLeadActivity } from '../lead-lifecycle'

export const createTaskExecutor: StepExecutor = {
  type: 'create_task',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead, workflowRun, workspace } = context
    const { title, description, dueInMinutes, dueAt, assigneeStrategy, assigneeId, role } = config as {
      title: string
      description?: string
      dueInMinutes?: number
      dueAt?: string
      assigneeStrategy?: 'lead_assignee' | 'round_robin' | 'least_open_leads' | 'fixed' | 'role'
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
      targetAssigneeId = lead.assigneeId ?? undefined
    }

    if (!targetAssigneeId && assigneeStrategy === 'round_robin') {
      const members = await prisma.member.findMany({
        where: { workspaceId: lead.workspaceId, available: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      targetAssigneeId = (await nextRoundRobinMember(prisma, workflowRun.workflowId, members))?.id
    }

    if (!targetAssigneeId && assigneeStrategy === 'least_open_leads') {
      const members = await prisma.member.findMany({
        where: { workspaceId: lead.workspaceId, available: true },
        select: {
          id: true,
          _count: { select: { assignedLeads: { where: { status: { in: ['NEW', 'CONTACTED'] } } } } },
        },
      })
      members.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)
      targetAssigneeId = members[0]?.id
    }

    if (!targetAssigneeId && assigneeStrategy === 'role') {
      const member = await prisma.member.findFirst({
        where: { workspaceId: lead.workspaceId, role: role as Role, available: true },
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

    // A created task is activity on the lead (SPEC §2.3 timeline) and must reset
    // the inactivity clock, or `no_activity_for` would ignore work the
    // automation just produced.
    await prisma.activity.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        type: 'task_created',
        body: `Task created: ${renderedTitle}`,
        meta: { taskId: task.id, assigneeId: targetAssigneeId ?? null, runId: workflowRun.id },
      },
    })
    await touchLeadActivity(prisma, lead.id)

    return { success: true, output: { taskId: task.id, assigneeId: targetAssigneeId ?? null } }
  },
}
