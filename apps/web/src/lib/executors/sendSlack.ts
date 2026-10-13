import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'

export const sendSlackExecutor: StepExecutor = {
  type: 'send_slack',
  async execute(config, context): Promise<StepResult> {
    const { lead, integrations, prisma, workspace } = context
    const { message, channel, blocks, integrationName } = config as {
      message: string
      channel?: string
      blocks?: unknown[]
      integrationName?: string
    }

    const integration = integrationName
      ? integrations.find((i) => i.type === 'slack' && i.name === integrationName)
      : integrations.find((i) => i.type === 'slack')

    if (!integration) {
      return { success: false, error: 'No Slack integration configured' }
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

    const renderedMessage = renderTemplateValue(message, templateContext)
    const renderedChannel = channel ? renderTemplateValue(channel, templateContext) : undefined

    const configData = integration.config as Record<string, unknown>
    const botToken = configData.botToken as string
    const defaultChannel = configData.defaultChannel as string

    const targetChannel = renderedChannel || defaultChannel

    if (!targetChannel) {
      return { success: false, error: 'No Slack channel configured' }
    }

    try {
      const payload: Record<string, unknown> = {
        channel: targetChannel,
        text: renderedMessage,
      }

      if (blocks) {
        payload.blocks = blocks
      }

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!data.ok) {
        return { success: false, error: data.error || 'Slack API error' }
      }

      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          type: 'slack_sent',
          body: `Slack message sent to ${targetChannel}`,
          meta: { channel: targetChannel, ts: data.ts },
        },
      })

      return { success: true, output: { ts: data.ts, channel: targetChannel } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Slack send failed' }
    }
  },
}