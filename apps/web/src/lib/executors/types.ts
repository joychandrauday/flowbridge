import { PrismaClient } from '@prisma/client'

export interface ExecutorContext {
  prisma: PrismaClient
  lead: any
  workflowRun: any
  assignee?: any
  workspace: any
  integrations: any[]
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

/** Normalized lead object for template rendering (adds `url`, flattens `data`). */
export function leadTemplate(lead: any): any {
  if (!lead) return undefined
  return { ...lead, data: lead.data || {}, url: `/leads/${lead.id}` }
}