import { Prisma, PrismaClient } from '@prisma/client'
import type { ResolvedIntegration } from '../integrations'

/** Lead as loaded by the engine (with its assignee + that assignee's user). */
export type ContextLead = Prisma.LeadGetPayload<{
  include: { assignee: { include: { user: true } } }
}>

/** Workflow run as loaded by the engine. */
export type ContextWorkflowRun = Prisma.WorkflowRunGetPayload<{
  include: { workflow: true }
}>

export type ContextAssignee = Prisma.MemberGetPayload<{ include: { user: true } }>

export type ContextWorkspace = Prisma.WorkspaceGetPayload<Record<string, never>>

export interface ExecutorContext {
  prisma: PrismaClient
  lead: ContextLead | null
  workflowRun: ContextWorkflowRun
  assignee?: ContextAssignee | null
  workspace: ContextWorkspace
  integrations: ResolvedIntegration[]
}

export interface StepResult {
  success: boolean
  output?: Record<string, unknown>
  error?: string
  runAfter?: Date
}

export interface StepExecutor {
  type: string
  execute(config: Record<string, unknown>, context: ExecutorContext): Promise<StepResult>
}

/**
 * Normalized lead object for template rendering: adds `url` and defaults
 * `data`. Returns `{}` for a missing lead so `{{lead.x}}` renders empty
 * (the template allowlist skips unknown keys) instead of throwing.
 */
export function leadTemplate(lead: ContextLead | null | undefined): Record<string, unknown> {
  if (!lead) return {}
  return { ...lead, data: lead.data || {}, url: `/leads/${lead.id}` }
}
