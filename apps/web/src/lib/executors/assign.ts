import { StepExecutor, StepResult, leadTemplate } from './types'
import { evaluateConditions } from '@flowbridge/core/engine/evaluator'

export const assignExecutor: StepExecutor = {
  type: 'assign',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead, workflowRun, workspace } = context
    const { strategy, assigneeId, role, rules } = config as {
      strategy: string
      assigneeId?: string
      role?: string
      rules?: Array<{ field: string; operator: string; value: unknown; assigneeId: string }>
    }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    let targetAssigneeId: string | null = null

    switch (strategy) {
      case 'fixed':
        targetAssigneeId = assigneeId || null
        break
      case 'role':
        const member = await prisma.member.findFirst({
          where: {
            workspaceId: lead.workspaceId,
            role: role as any,
            available: true,
          },
          orderBy: { createdAt: 'asc' },
        })
        targetAssigneeId = member?.id || null
        break
      case 'rule_based':
        if (rules && rules.length > 0) {
          const conditionContext = {
            lead: leadTemplate(lead),
            assignee: undefined,
            workspace,
            trigger: { type: 'workflow', config: {} },
            now: new Date().toISOString(),
            uuid: crypto.randomUUID(),
          }
          for (const rule of rules) {
            const condition = { field: rule.field, operator: rule.operator, value: rule.value }
            if (evaluateConditions([{ operator: 'AND', conditions: [condition] }], conditionContext)) {
              targetAssigneeId = rule.assigneeId
              break
            }
          }
        }
        break
      case 'round_robin':
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
        break
      case 'least_open_leads':
        const membersWithCounts = await prisma.member.findMany({
          where: { workspaceId: lead.workspaceId, available: true },
          include: {
            _count: {
              select: { assignedLeads: { where: { status: { in: ['NEW', 'CONTACTED'] } } } },
            },
          },
          orderBy: { assignedLeads: { _count: 'asc' } },
        })
        targetAssigneeId = membersWithCounts[0]?.id || null
        break
    }

    if (targetAssigneeId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { assigneeId: targetAssigneeId, status: 'CONTACTED' },
      })

      await prisma.activity.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          type: 'assignment',
          body: `Lead assigned via workflow (${strategy})`,
          meta: { assigneeId: targetAssigneeId, strategy },
        },
      })
    }

    return {
      success: true,
      output: { assigneeId: targetAssigneeId, strategy },
    }
  },
}