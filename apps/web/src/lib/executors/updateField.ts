import { StepExecutor, StepResult, ExecutorContext, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'

export const updateFieldExecutor: StepExecutor = {
  type: 'update_field',
  async execute(config, context): Promise<StepResult> {
    const { prisma, lead } = context
    const { field, value } = config as { field: string; value: unknown }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    let renderedValue = value
    if (typeof value === 'string') {
      const templateContext = {
        lead: leadTemplate(lead),
        assignee: context.assignee
          ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
          : undefined,
        workspace: context.workspace,
        trigger: { type: 'workflow', config: {} },
        now: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      }
      renderedValue = renderTemplateValue(value, templateContext)
    }

    const updateData: Record<string, unknown> = {}
    if (field.startsWith('data.')) {
      const currentData = (lead.data as Record<string, unknown>) || {}
      const key = field.slice(5)
      currentData[key] = renderedValue
      updateData.data = currentData
    } else {
      updateData[field] = renderedValue
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: updateData,
    })

    return { success: true, output: { field, value: renderedValue } }
  },
}