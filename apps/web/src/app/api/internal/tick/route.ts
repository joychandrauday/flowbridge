import { PrismaClient } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'
import { JobQueue, createJobContext, JobPayload, StepHandler } from '@/lib/queue'
import { WorkflowDefinition } from '@flowbridge/core/schema'
import { evaluateConditions, renderTemplateValue } from '@flowbridge/core/engine/evaluator'

const CRON_SECRET = process.env.CRON_SECRET
const WORKER_ID = `worker-${process.env.VERCEL_DEPLOYMENT_ID || 'local'}`

// Verify cron authorization
function verifyCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.warn('CRON_SECRET not set, skipping auth check')
    return true
  }
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${CRON_SECRET}`
}

// Job queue instance
const jobQueue = new JobQueue(prisma, WORKER_ID)

// Time budget: 25 seconds
const TIME_BUDGET_MS = 25000
const MAX_JOBS_PER_TICK = 10

// Step handlers
const stepHandlers: Record<string, StepHandler> = {
  assign: async (payload, context) => {
    const { lead, workflowRun, prisma } = context
    const config = payload.config as { strategy: string; assigneeId?: string; role?: string }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    let assigneeId: string | null = null

    switch (config.strategy) {
      case 'fixed':
        assigneeId = config.assigneeId || null
        break
      case 'role':
        // Find member with role in workspace
        const member = await prisma.member.findFirst({
          where: {
            workspaceId: lead.workspaceId,
            role: config.role as any,
            available: true,
          },
          orderBy: { createdAt: 'asc' },
        })
        assigneeId = member?.id || null
        break
      case 'round_robin':
        // Simple round-robin: get available members, pick next
        const members = await prisma.member.findMany({
          where: { workspaceId: lead.workspaceId, available: true },
          orderBy: { createdAt: 'asc' },
        })
        if (members.length > 0) {
          // Use workflow run count as pointer
          const runCount = await prisma.workflowRun.count({
            where: { workflowId: workflowRun.workflowId, leadId: lead.id },
          })
          assigneeId = members[runCount % members.length].id
        }
        break
      case 'least_open_leads':
        // Find member with fewest open leads
        const membersWithCounts = await prisma.member.findMany({
          where: { workspaceId: lead.workspaceId, available: true },
          include: {
            _count: {
              select: { assignedLeads: { where: { status: { in: ['NEW', 'CONTACTED'] } } } },
            },
          },
          orderBy: { assignedLeads: { _count: 'asc' } },
        })
        assigneeId = membersWithCounts[0]?.id || null
        break
    }

    if (assigneeId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { assigneeId, status: 'CONTACTED' },
      })

      // Create activity
      await prisma.activity.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          type: 'assignment',
          body: `Lead assigned via workflow`,
          meta: { assigneeId, strategy: config.strategy },
        },
      })
    }

    return {
      success: true,
      output: { assigneeId, strategy: config.strategy },
    }
  },

  create_task: async (payload, context) => {
    const { lead, workflowRun, prisma } = context
    const config = payload.config as {
      title: string
      description?: string
      dueInMinutes?: number
      assigneeStrategy?: string
      assigneeId?: string
      role?: string
    }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    let assigneeId = config.assigneeId

    if (!assigneeId && config.assigneeStrategy === 'lead_assignee') {
      assigneeId = lead.assigneeId
    }

    const dueAt = config.dueInMinutes
      ? new Date(Date.now() + config.dueInMinutes * 60 * 1000)
      : null

    const task = await prisma.task.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        title: config.title,
        description: config.description,
        dueAt,
        assigneeId,
        createdByRunId: workflowRun.id,
      },
    })

    return { success: true, output: { taskId: task.id } }
  },

  update_field: async (payload, context) => {
    const { lead, prisma } = context
    const config = payload.config as { field: string; value: unknown }

    if (!lead) {
      return { success: false, error: 'No lead associated with workflow run' }
    }

    const field = config.field
    let value = config.value

    // Render template if value is string
    if (typeof value === 'string') {
      const templateContext = {
        lead: { ...lead, data: lead.data || {} },
        assignee: context.assignee
          ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
          : undefined,
        workspace: context.workspace,
        trigger: { type: 'workflow', config: {} },
        now: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      }
      value = renderTemplateValue(value, templateContext)
    }

    // Handle nested fields like 'data.customField'
    const updateData: Record<string, unknown> = {}
    if (field.startsWith('data.')) {
      const currentData = (lead.data as Record<string, unknown>) || {}
      const key = field.slice(5)
      currentData[key] = value
      updateData.data = currentData
    } else {
      updateData[field] = value
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: updateData,
    })

    return { success: true, output: { field, value } }
  },

  send_email: async (payload, context) => {
    const { lead, integrations } = context
    const config = payload.config as {
      to?: string
      subject: string
      html?: string
      text?: string
      integrationName?: string
    }

    if (!lead?.email && !config.to) {
      return { success: false, error: 'No email recipient' }
    }

    // Find email integration
    const integration = config.integrationName
      ? integrations.find((i) => i.type === 'email' && i.name === config.integrationName)
      : integrations.find((i) => i.type === 'email')

    if (!integration) {
      return { success: false, error: 'No email integration configured' }
    }

    // TODO: Implement actual email sending with Resend/SMTP
    // For now, log and return success
    console.log('Sending email:', { to: config.to || lead.email, subject: config.subject })

    return { success: true, output: { sent: true, provider: 'mock' } }
  },

  send_telegram: async (payload, context) => {
    const { lead, integrations } = context
    const config = payload.config as {
      message: string
      chatId?: string
      integrationName?: string
    }

    const integration = config.integrationName
      ? integrations.find((i) => i.type === 'telegram' && i.name === config.integrationName)
      : integrations.find((i) => i.type === 'telegram')

    if (!integration) {
      return { success: false, error: 'No Telegram integration configured' }
    }

    // TODO: Implement actual Telegram sending
    console.log('Sending Telegram:', { message: config.message })

    return { success: true, output: { sent: true, provider: 'mock' } }
  },

  http_request: async (payload, context) => {
    const config = payload.config as {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: unknown
      timeoutMs?: number
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000)

    try {
      // Render body template
      let body = config.body
      if (typeof body === 'string') {
        const templateContext = {
          lead: { ...context.lead, data: context.lead?.data || {} },
          assignee: context.assignee
            ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
            : undefined,
          workspace: context.workspace,
          trigger: { type: 'workflow', config: {} },
          now: new Date().toISOString(),
          uuid: crypto.randomUUID(),
        }
        body = renderTemplateValue(body, templateContext)
      }

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const responseText = await response.text()
      let responseData: unknown
      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = responseText
      }

      return {
        success: response.ok,
        output: { status: response.status, data: responseData },
        error: response.ok ? undefined : `HTTP ${response.status}: ${responseText}`,
      }
    } catch (error) {
      clearTimeout(timeout)
      return { success: false, error: error instanceof Error ? error.message : 'Request failed' }
    }
  },

  delay: async (payload) => {
    const config = payload.config as { minutes: number }
    const runAfter = new Date(Date.now() + config.minutes * 60 * 1000)
    return { success: true, output: { delayed: true }, runAfter }
  },
}

async function processWorkflowRun(prismaClient: PrismaClient, workflowRunId: string): Promise<void> {
  const workflowRun = await prismaClient.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflow: true,
      lead: { include: { assignee: { include: { user: true } } } },
      steps: true,
    },
  })

  if (!workflowRun || workflowRun.status !== 'QUEUED') return

  const definition = workflowRun.workflow.definition as WorkflowDefinition
  const context = await createJobContext(prismaClient, workflowRunId)
  if (!context) return

  // Evaluate conditions
  const conditionContext = {
    lead: workflowRun.lead ? { ...workflowRun.lead, data: workflowRun.lead.data || {} } : {},
    assignee: workflowRun.lead?.assignee
      ? { id: workflowRun.lead.assignee.id, name: workflowRun.lead.assignee.user.name, email: workflowRun.lead.assignee.user.email }
      : undefined,
    workspace: context.workspace,
    trigger: { type: definition.trigger.type, config: definition.trigger.config },
    now: new Date().toISOString(),
    uuid: crypto.randomUUID(),
  }

  const conditionsMet = evaluateConditions(definition.conditions, conditionContext as any)
  if (!conditionsMet) {
    await prismaClient.workflowRun.update({
      where: { id: workflowRunId },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    })
    return
  }

  // Update run status
  await prismaClient.workflowRun.update({
    where: { id: workflowRunId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  // Execute steps sequentially
  let runFailed = false
  for (const stepDef of definition.steps) {
    const existingStep = workflowRun.steps.find((s: { stepKey: string; status: string }) => s.stepKey === stepDef.id)
    if (existingStep && existingStep.status === 'SUCCEEDED') continue

    const stepRecord = existingStep || await prismaClient.runStep.create({
      data: {
        runId: workflowRunId,
        stepKey: stepDef.id,
        type: stepDef.type,
        status: 'RUNNING',
        attempts: 0,
        input: stepDef.config as any,
      },
    })

    const handler = stepHandlers[stepDef.type]
    if (!handler) {
      await prismaClient.runStep.update({
        where: { id: stepRecord.id },
        data: { status: 'FAILED', error: `Unknown step type: ${stepDef.type}`, finishedAt: new Date() },
      })
      runFailed = true
      break
    }

    await prismaClient.runStep.update({
      where: { id: stepRecord.id },
      data: { startedAt: new Date() },
    })

    const jobPayload: JobPayload = {
      workflowRunId,
      stepKey: stepDef.id,
      stepType: stepDef.type,
      config: stepDef.config as Record<string, unknown>,
      attempt: stepRecord.attempts + 1,
    }

    const result = await handler(jobPayload, context)

    if (result.success) {
      await prismaClient.runStep.update({
        where: { id: stepRecord.id },
        data: {
          status: 'SUCCEEDED',
          output: result.output as any,
          finishedAt: new Date(),
        },
      })
    } else {
      await prismaClient.runStep.update({
        where: { id: stepRecord.id },
        data: {
          status: 'FAILED',
          error: result.error,
          finishedAt: new Date(),
        },
      })

      if (stepDef.onFailure === 'stop') {
        runFailed = true
        break
      }
      // If continue, proceed to next step
    }

    // Handle delay step - schedule next run
    const stepType = stepDef.type as string
    if (stepType === 'delay' && result.runAfter) {
      await prismaClient.workflowRun.update({
        where: { id: workflowRunId },
        data: { status: 'WAITING' },
      })
      // Re-enqueue for after delay
      await jobQueue.enqueue(jobPayload, result.runAfter)
      return // Stop processing, will resume later
    }
  }

  // Complete workflow run
  await prismaClient.workflowRun.update({
    where: { id: workflowRunId },
    data: {
      status: runFailed ? 'FAILED' : 'SUCCEEDED',
      finishedAt: new Date(),
    },
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Reclaim expired locks
    const thirtySecAgo = new Date(Date.now() - 30000)
    await prisma.$executeRaw`
      UPDATE "Job"
      SET status = 'PENDING', "lockedBy" = NULL, "lockedAt" = NULL
      WHERE status = 'CLAIMED'
      AND "lockedAt" < ${thirtySecAgo}
    `

    // 2. Claim jobs
    const jobs = await jobQueue.claim(MAX_JOBS_PER_TICK)

    // 3. Process each job
    const results = []
    for (const job of jobs) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        // Re-queue remaining jobs
        await jobQueue.reschedule(job.id, new Date())
        break
      }

      const payload = job.payload as JobPayload

      if (payload.stepType === 'workflow_run' || !payload.stepKey) {
        // Process entire workflow run
        await processWorkflowRun(prisma, payload.workflowRunId)
      } else {
        // Process individual step (for retry/resume)
        const context = await createJobContext(prisma, payload.workflowRunId)
        if (context) {
          const handler = stepHandlers[payload.stepType]
          if (handler) {
            const result = await handler(payload, context)
            if (result.success) {
              await jobQueue.complete(job.id, result.output || {})
            } else {
              await jobQueue.fail(job.id, result.error || 'Unknown error', result.runAfter)
            }
          } else {
            await jobQueue.fail(job.id, `Unknown step type: ${payload.stepType}`)
          }
        } else {
          await jobQueue.fail(job.id, 'Failed to create job context')
        }
      }
      results.push({ jobId: job.id, processed: true })
    }

    // 4. Check for workflow runs that need to be created from intake events
    // This is handled by the intake endpoint creating jobs

    const stats = await jobQueue.getStats()
    const elapsed = Date.now() - startTime

    return NextResponse.json({
      success: true,
      processed: results.length,
      elapsedMs: elapsed,
      stats,
    })
  } catch (error) {
    console.error('Tick error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}