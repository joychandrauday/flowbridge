import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'
import { Prisma } from '@prisma/client'
import { JobQueue } from '../queue'
import { createRunsForLeadStatusChange } from '../run-dispatch'
import { deriveFirstContactedAt, isLeadStatus } from '../lead-lifecycle'

/**
 * Mutates a lead field. A `status` write is treated as a first-class event
 * (SPEC §2.3/§4.1): it sets `firstContactedAt`, records an Activity, and
 * dispatches matching `lead.status_changed` workflows in the same transaction —
 * exactly like the manual status action, so automation is observable and can
 * chain.
 */
export const updateFieldExecutor: StepExecutor = {
  type: 'update_field',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead, workflowRun, workspace } = context
    const { field, value } = config as { field: string; value: unknown }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    // Accept both `status` and `lead.status` spellings.
    const fieldName = field.startsWith('lead.') ? field.slice(5) : field

    let renderedValue = value
    if (typeof value === 'string') {
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
      renderedValue = renderTemplateValue(value, templateContext)
    }

    // ── status change: validate, record, and chain `lead.status_changed` ──
    if (fieldName === 'status') {
      const nextStatus = String(renderedValue)
      if (!isLeadStatus(nextStatus)) {
        return { success: false, error: `Invalid status value: ${nextStatus}` }
      }
      if (nextStatus === lead.status) {
        return { success: true, output: { field, value: nextStatus, unchanged: true } }
      }

      const queue = new JobQueue(prisma, `worker-status-${Date.now()}`)
      const activityId = await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: nextStatus,
            firstContactedAt: deriveFirstContactedAt(lead.firstContactedAt, nextStatus),
            lastActivityAt: new Date(),
          },
        })
        const activity = await tx.activity.create({
          data: {
            workspaceId: lead.workspaceId,
            leadId: lead.id,
            type: 'status_change',
            body: `Status changed to ${nextStatus} by workflow`,
            meta: { from: lead.status, to: nextStatus, runId: workflowRun.id },
          },
        })
        await createRunsForLeadStatusChange(tx, queue, {
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          eventId: `statuschange:${activity.id}`,
          from: lead.status,
          to: nextStatus,
        })
        return activity.id
      })

      return { success: true, output: { field, value: nextStatus, activityId } }
    }

    // ── assignee change: validate the member belongs to this workspace ──
    if (fieldName === 'assigneeId') {
      const assigneeId = renderedValue === null || renderedValue === '' ? null : String(renderedValue)
      if (assigneeId) {
        const member = await prisma.member.findFirst({
          where: { id: assigneeId, workspaceId: lead.workspaceId },
          select: { id: true },
        })
        if (!member) return { success: false, error: `Assignee not in workspace: ${assigneeId}` }
      }
      await prisma.$transaction([
        prisma.lead.update({
          where: { id: lead.id },
          data: { assigneeId, lastActivityAt: new Date() },
        }),
        prisma.activity.create({
          data: {
            workspaceId: lead.workspaceId,
            leadId: lead.id,
            type: 'assignment',
            body: assigneeId ? 'Assignee changed by workflow' : 'Lead unassigned by workflow',
            meta: { assigneeId, runId: workflowRun.id },
          },
        }),
      ])
      return { success: true, output: { field, value: assigneeId } }
    }

    // ── any other field: custom `data.*` merge or a direct column ──
    const updateData: Record<string, unknown> = { lastActivityAt: new Date() }
    if (fieldName.startsWith('data.')) {
      const currentData = (lead.data as Record<string, unknown>) || {}
      const key = fieldName.slice(5)
      updateData.data = { ...currentData, [key]: renderedValue }
    } else {
      updateData[fieldName] = renderedValue
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: updateData as Prisma.LeadUncheckedUpdateInput,
    })

    await prisma.activity.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        type: 'field_update',
        body: `Workflow set ${fieldName}`,
        meta: { field: fieldName, value: renderedValue as Prisma.InputJsonValue, runId: workflowRun.id },
      },
    })

    return { success: true, output: { field, value: renderedValue } }
  },
}
