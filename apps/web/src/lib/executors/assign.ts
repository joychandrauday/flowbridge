import { StepExecutor, StepResult, leadTemplate } from './types'
import { evaluateConditions } from '@flowbridge/core/engine/evaluator'
import { Role } from '@prisma/client'
import { nextRoundRobinMember } from '../round-robin'

export const assignExecutor: StepExecutor = {
  type: 'assign',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead, workflowRun, workspace } = context
    const { strategy, assigneeId, role, rules } = config as {
      strategy: 'round_robin' | 'least_open_leads' | 'rule_based' | 'fixed' | 'role'
      assigneeId?: string
      role?: string
      rules?: { field: string; operator: string; value: unknown; assigneeId: string }[]
    }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    let targetAssigneeId: string | null = null

    switch (strategy) {
      case 'fixed':
        targetAssigneeId = assigneeId || null
        break
      case 'role': {
        const member = await prisma.member.findFirst({
          where: { workspaceId: lead.workspaceId, role: role as Role, available: true },
          orderBy: { createdAt: 'asc' },
        })
        targetAssigneeId = member?.id ?? null
        break
      }
      case 'rule_based': {
        const templateContext = {
          lead: leadTemplate(lead),
          assignee: context.assignee
            ? {
                id: context.assignee.id,
                name: context.assignee.user.name,
                email: context.assignee.user.email,
              }
            : undefined,
          workspace,
          trigger: { type: 'workflow', config: {} },
          now: new Date().toISOString(),
          uuid: crypto.randomUUID(),
        }
        for (const rule of rules ?? []) {
          const condition = { field: rule.field, operator: rule.operator, value: rule.value }
          if (evaluateConditions([{ operator: 'AND', conditions: [condition] }], templateContext)) {
            targetAssigneeId = rule.assigneeId
            break
          }
        }
        break
      }
      case 'round_robin': {
        const members = await prisma.member.findMany({
          where: { workspaceId: lead.workspaceId, available: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
        targetAssigneeId = (await nextRoundRobinMember(prisma, workflowRun.workflowId, members))?.id ?? null
        break
      }
      case 'least_open_leads': {
        // `orderBy` on a filtered relation count is not supported, so rank in JS.
        const members = await prisma.member.findMany({
          where: { workspaceId: lead.workspaceId, available: true },
          select: {
            id: true,
            _count: { select: { assignedLeads: { where: { status: { in: ['NEW', 'CONTACTED'] } } } } },
          },
        })
        members.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)
        targetAssigneeId = members[0]?.id ?? null
        break
      }
    }

    // Assignment that silently picks nobody is the "silent automation" failure
    // FlowBridge exists to surface (SPEC §3 / AGENTS §10): fail the step instead.
    if (!targetAssigneeId) {
      return {
        success: false,
        error: `No available member to assign (strategy: ${strategy})`,
      }
    }

    const previousAssigneeId = lead.assigneeId
    await prisma.lead.update({
      where: { id: lead.id },
      data: { assigneeId: targetAssigneeId, lastActivityAt: new Date() },
    })

    await prisma.activity.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        type: 'assignment',
        body:
          previousAssigneeId && previousAssigneeId !== targetAssigneeId
            ? `Reassigned by workflow (${strategy})`
            : `Lead assigned by workflow (${strategy})`,
        meta: { assigneeId: targetAssigneeId, strategy, previousAssigneeId },
      },
    })

    return {
      success: true,
      output: { assigneeId: targetAssigneeId, strategy },
    }
  },
}
