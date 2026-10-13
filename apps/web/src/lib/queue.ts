import { PrismaClient, Prisma } from '@prisma/client'
import { resolveIntegrations } from './integrations'

export interface JobPayload {
  workflowRunId: string
  stepKey?: string
  stepType: string
  config?: Record<string, unknown>
  attempt: number
}

export interface StepHandler {
  (payload: JobPayload, context: JobContext): Promise<StepResult>
}

export interface StepResult {
  success: boolean
  output?: Record<string, unknown>
  error?: string
  runAfter?: Date
}

export interface JobContext {
  lead: any
  workflowRun: any
  assignee: any
  workspace: any
  integrations: any[]
  prisma: PrismaClient
}

export interface Job {
  id: string
  payload: JobPayload
  status: string
  attempts: number
  runAfter: Date | null
  lockedBy: string | null
  lockedAt: Date | null
}

export class JobQueue {
  private prisma: PrismaClient
  private workerId: string

  constructor(prisma: PrismaClient, workerId: string) {
    this.prisma = prisma
    this.workerId = workerId
  }

  async enqueue(payload: JobPayload, runAfter: Date = new Date()): Promise<void> {
    await this.createJob(this.prisma, payload, runAfter)
  }

  /** Enqueue inside an interactive transaction so intake and job writes commit atomically. */
  async enqueueTx(
    tx: Prisma.TransactionClient,
    payload: JobPayload,
    runAfter: Date = new Date()
  ): Promise<void> {
    await this.createJob(tx as PrismaClient, payload, runAfter)
  }

  private async createJob(
    client: PrismaClient | Prisma.TransactionClient,
    payload: JobPayload,
    runAfter: Date
  ): Promise<void> {
    await (client as PrismaClient).job.create({
      data: {
        payload: payload as any,
        status: 'PENDING',
        runAfter,
      },
    })
  }

  async claim(limit: number): Promise<Job[]> {
    const jobs = await this.prisma.$queryRaw<Job[]>`
      UPDATE "Job"
      SET status = 'CLAIMED', "lockedBy" = ${this.workerId}, "lockedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "Job"
        WHERE status = 'PENDING'
        AND (runAfter IS NULL OR runAfter <= NOW())
        ORDER BY "runAfter" ASC NULLS FIRST
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `
    return jobs
  }

  async complete(jobId: string, output: Record<string, unknown>): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        output: output as any,
        completedAt: new Date(),
      },
    })
  }

  async fail(jobId: string, error: string, runAfter?: Date): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } })
    if (!job) return

    const nextAttempt = job.attempts + 1
    const maxAttempts = 3

    if (nextAttempt >= maxAttempts) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error,
          completedAt: new Date(),
        },
      })
    } else {
      // Exponential backoff: 1min, 5min, 15min
      const backoffMinutes = [1, 5, 15][nextAttempt - 1] || 15
      const nextRunAfter = runAfter || new Date(Date.now() + backoffMinutes * 60 * 1000)

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          attempts: nextAttempt,
          runAfter: nextRunAfter,
          error,
        },
      })
    }
  }

  async reschedule(jobId: string, runAfter: Date): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        runAfter,
        lockedBy: null,
        lockedAt: null,
      },
    })
  }

  async getStats(): Promise<Record<string, number>> {
    const [pending, claimed, completed, failed] = await Promise.all([
      this.prisma.job.count({ where: { status: 'PENDING' } }),
      this.prisma.job.count({ where: { status: 'CLAIMED' } }),
      this.prisma.job.count({ where: { status: 'COMPLETED' } }),
      this.prisma.job.count({ where: { status: 'FAILED' } }),
    ])
    return { pending, claimed, completed, failed }
  }
}

export async function createJobContext(
  prisma: PrismaClient,
  workflowRunId: string
): Promise<JobContext | null> {
  const workflowRun = await prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflow: true,
      lead: { include: { assignee: { include: { user: true } } } },
      workspace: true,
    },
  })

  if (!workflowRun) return null

  const integrations = await resolveIntegrations(prisma, workflowRun.workspaceId)

  return {
    lead: workflowRun.lead,
    workflowRun,
    assignee: workflowRun.lead?.assignee,
    workspace: workflowRun.workspace,
    integrations,
    prisma,
  }
}