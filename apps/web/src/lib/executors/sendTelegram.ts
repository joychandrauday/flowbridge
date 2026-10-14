import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'

export const sendTelegramExecutor: StepExecutor = {
  type: 'send_telegram',
  async execute(config, context): Promise<StepResult> {
    const { lead, integrations, prisma, workspace } = context
    const { message, parseMode, chatId, sendToRole, integrationName } = config as {
      message: string
      parseMode?: 'Markdown' | 'HTML' | 'MarkdownV2'
      chatId?: string
      sendToRole?: 'OWNER' | 'ADMIN' | 'AGENT' | 'LEAD_ASSIGNEE'
      integrationName?: string
    }

    const integration = integrationName
      ? integrations.find((i) => i.type === 'telegram' && i.name === integrationName)
      : integrations.find((i) => i.type === 'telegram')

    if (!integration) {
      return { success: false, error: 'No Telegram integration configured' }
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

    let targetChatId = chatId ? renderTemplateValue(chatId, templateContext) : undefined

    if (!targetChatId && sendToRole) {
      if (sendToRole === 'LEAD_ASSIGNEE' && lead?.assigneeId) {
        const assignee = await prisma.member.findUnique({
          where: { id: lead.assigneeId },
          include: { user: true },
        })
        targetChatId = assignee?.user.telegramChatId ?? undefined
      } else {
        const member = await prisma.member.findFirst({
          where: { workspaceId: workspace.id, role: sendToRole as 'OWNER' | 'ADMIN' | 'AGENT' },
          include: { user: true },
        })
        targetChatId = member?.user.telegramChatId ?? undefined
      }
    }

    const configData = integration.config as Record<string, unknown>

    if (!targetChatId) {
      targetChatId = configData.defaultChatId as string | undefined
    }

    const botToken = configData.botToken as string | undefined

    // Demo / log-only mode (AGENTS §10). The seed wires a placeholder bot token
    // so the golden path works offline and CI never calls a real provider. Log
    // the rendered message and record an activity instead of hitting Telegram.
    // Real deployments always set a real token, so this branch is demo-only.
    if (!botToken || botToken === 'log-only-demo-mode') {
      console.info(`[send_telegram] log-only mode — message:\n${renderedMessage}`)
      if (lead) {
        await prisma.activity.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            type: 'telegram_sent',
            body: 'Telegram message logged (log-only demo mode)',
            meta: { logOnly: true, chatId: targetChatId ?? null },
          },
        })
      }
      return { success: true, output: { logOnly: true, chatId: targetChatId ?? null } }
    }

    if (!targetChatId) {
      return { success: false, error: 'No Telegram chat ID configured' }
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: renderedMessage,
          parse_mode: parseMode || 'Markdown',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.description || 'Telegram API error' }
      }

      if (lead) {
        await prisma.activity.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            type: 'telegram_sent',
            body: `Telegram message sent`,
            meta: { chatId: targetChatId, messageId: data.result?.message_id },
          },
        })
      }

      return { success: true, output: { messageId: data.result?.message_id, chatId: targetChatId } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Telegram send failed' }
    }
  },
}