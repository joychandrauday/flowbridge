import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'
import { touchLeadActivity } from '../lead-lifecycle'

/** Only real Discord webhook hosts are allowed, so a stored URL can never be
 * pointed at an internal address (SSRF — AGENTS §3). */
function isAllowedDiscordHost(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'discord.com' || host.endsWith('.discord.com') ||
      host === 'discordapp.com' || host.endsWith('.discordapp.com')
  } catch {
    return false
  }
}

/**
 * Post a message to a Discord channel via an incoming webhook URL
 * (SPEC.md §4.4). The webhook URL is a secret, so it lives encrypted on the
 * `discord` integration and never reaches the client.
 */
export const sendDiscordExecutor: StepExecutor = {
  type: 'send_discord',
  async execute(config, context): Promise<StepResult> {
    const { lead, integrations, prisma, workspace } = context
    const { message, username, integrationName } = config as {
      message: string
      username?: string
      integrationName?: string
    }

    const integration = integrationName
      ? integrations.find((i) => i.type === 'discord' && i.name === integrationName)
      : integrations.find((i) => i.type === 'discord')

    if (!integration) {
      return { success: false, error: 'No Discord integration configured' }
    }

    const configData = integration.config as Record<string, unknown>
    const webhookUrl = configData.webhookUrl as string
    if (!webhookUrl) {
      return { success: false, error: 'No Discord webhook URL configured' }
    }
    if (!isAllowedDiscordHost(webhookUrl)) {
      return { success: false, error: 'Discord webhook URL must be on discord.com' }
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
    const renderedUsername = username ? renderTemplateValue(username, templateContext) : undefined

    // Discord caps `content` at 2000 characters.
    const content = renderedMessage.length > 2000 ? `${renderedMessage.slice(0, 1997)}...` : renderedMessage

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          ...(renderedUsername ? { username: renderedUsername } : {}),
        }),
      })

      // Discord returns 204 No Content on success, 400/401/404 on failure.
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return { success: false, error: `Discord webhook error (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}` }
      }

      if (lead) {
        await prisma.activity.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            type: 'discord_sent',
            body: 'Discord message sent',
            meta: { integrationName: integration.name },
          },
        })
        await touchLeadActivity(prisma, lead.id)
      }

      return { success: true, output: { sent: true } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Discord send failed' }
    }
  },
}
