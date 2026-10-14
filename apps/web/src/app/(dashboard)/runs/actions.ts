'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'
import { JobQueue } from '@/lib/queue'
import { WorkflowDefinitionSchema } from '@flowbridge/core/schema'

/**
 * Replay a failed run from the failed step: re-enqueue a retry job for that
 * step; when it succeeds the engine resumes the run from there.
 */
export async function retryFailedStep(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return

  const runId = formData.get('runId')
  const stepKey = formData.get('stepKey')
  if (typeof runId !== 'string' || typeof stepKey !== 'string') return

  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workspaceId: session.user.workspaceId },
    include: { workflow: true, steps: true },
  })
  if (!run) return
  if (run.status !== 'FAILED') return

  const failedStep = run.steps.find(
    (step) => step.stepKey === stepKey && step.status === 'FAILED'
  )
  if (!failedStep) return

  let parsed
  try {
    parsed = WorkflowDefinitionSchema.parse(run.workflow.definition)
  } catch {
    return
  }
  const stepDef = parsed.steps.find((step) => step.id === stepKey)
  if (!stepDef) return

  const queue = new JobQueue(prisma, `worker-retry-${Date.now()}`)

  await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING' } })
  await queue.enqueue(
    {
      workflowRunId: run.id,
      stepKey,
      stepType: stepDef.type,
      config: stepDef.config ?? {},
      attempt: failedStep.attempts + 1,
    },
    new Date(Date.now() + 10 * 1000) // let the user see the run flip back to WAITING
  )

  revalidatePath(`/runs/${run.id}`)
  revalidatePath('/runs')
}

/**
 * Cancel a non-terminal run (SPEC §8 `CANCELED`). A run parked on a delay or
 * waiting on a retry would otherwise be unstoppable. We also fail its queued
 * jobs so the next tick cannot pick them back up.
 */
export async function cancelRun(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return

  const runId = formData.get('runId')
  if (typeof runId !== 'string') return

  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workspaceId: session.user.workspaceId },
  })
  if (!run) return
  if (run.status === 'SUCCEEDED' || run.status === 'FAILED' || run.status === 'CANCELED') return

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: 'CANCELED', finishedAt: new Date(), error: 'Canceled by user' },
  })

  // Drop any queued/claimed job for this run so the next tick cannot resume it.
  await prisma.job.updateMany({
    where: {
      status: { in: ['PENDING', 'CLAIMED'] },
      payload: { path: ['workflowRunId'], equals: run.id },
    },
    data: { status: 'FAILED', error: 'Canceled by user', completedAt: new Date() },
  })

  revalidatePath(`/runs/${run.id}`)
  revalidatePath('/runs')
  revalidatePath('/dashboard')
}