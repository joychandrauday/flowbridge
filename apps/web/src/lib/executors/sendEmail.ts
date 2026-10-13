import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'

export const sendEmailExecutor: StepExecutor = {
  type: 'send_email',
  async execute(config, context): Promise<StepResult> {
    const { lead, integrations, prisma, workspace } = context
    const { to, cc, bcc, subject, html, text, templateId, integrationName } = config as {
      to?: string
      cc?: string[]
      bcc?: string[]
      subject: string
      html?: string
      text?: string
      templateId?: string
      integrationName?: string
    }

    if (!lead?.email && !to) {
      return { success: false, error: 'No email recipient' }
    }

    const integration = integrationName
      ? integrations.find((i) => i.type === 'email' && i.name === integrationName)
      : integrations.find((i) => i.type === 'email')

    if (!integration) {
      return { success: false, error: 'No email integration configured' }
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

    const renderedSubject = renderTemplateValue(subject, templateContext)
    const renderedTo = to ? renderTemplateValue(to, templateContext) : lead.email
    const renderedHtml = html ? renderTemplateValue(html, templateContext) : undefined
    const renderedText = text ? renderTemplateValue(text, templateContext) : undefined
    const renderedCc = cc?.map((c) => renderTemplateValue(c, templateContext))
    const renderedBcc = bcc?.map((b) => renderTemplateValue(b, templateContext))

    const configData = integration.config as Record<string, unknown>
    const provider = (configData.provider as string) || 'resend'
    const apiKey = configData.apiKey as string

    try {
      let result: { success: boolean; messageId?: string; error?: string } = { success: false }

      if (provider === 'resend') {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: configData.from as string || `noreply@${workspace.slug}.flowbridge.local`,
            to: renderedTo,
            cc: renderedCc,
            bcc: renderedBcc,
            subject: renderedSubject,
            html: renderedHtml,
            text: renderedText,
            template_id: templateId,
          }),
        })

        const data = await response.json()
        if (response.ok) {
          result = { success: true, messageId: data.id }
        } else {
          result = { success: false, error: data.message || 'Resend error' }
        }
      } else if (provider === 'smtp') {
        const host = (configData.host as string) || process.env.SMTP_HOST || 'localhost'
        const port = Number((configData.port as string) || process.env.SMTP_PORT || 587)
        const user = (configData.user as string) || process.env.SMTP_USER || undefined
        const pass = (configData.password as string) || process.env.SMTP_PASSWORD || undefined
        const from = (configData.from as string) || process.env.SMTP_FROM || `noreply@${workspace.slug}.flowbridge.local`
        const secure = (configData.secure as boolean) ?? (port === 465)

        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: user && pass ? { user, pass } : undefined,
        })
        const info = await transporter.sendMail({
          from,
          to: renderedTo,
          cc: renderedCc,
          bcc: renderedBcc,
          subject: renderedSubject,
          html: renderedHtml,
          text: renderedText,
        })
        result = { success: true, messageId: info.messageId }
      } else {
        console.log('Email (log-only):', { to: renderedTo, subject: renderedSubject, html: renderedHtml })
        result = { success: true, messageId: 'log-' + Date.now() }
      }

      if (result.success) {
        await prisma.activity.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            type: 'email_sent',
            body: `Email sent: ${renderedSubject}`,
            meta: { to: renderedTo, subject: renderedSubject, messageId: result.messageId },
          },
        })
      }

      return {
        success: result.success,
        output: { messageId: result.messageId, provider },
        error: result.error,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Email send failed' }
    }
  },
}