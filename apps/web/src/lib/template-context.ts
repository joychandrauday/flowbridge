/**
 * Shared template context builder (SPEC.md §3 allowlist).
 *
 * Every executor and the engine build the same context shape so
 * `{{lead.url}}` and friends resolve identically everywhere.
 */

export interface TemplateLead {
  id: string
  data?: unknown
  [key: string]: unknown
}

export interface TemplateAssignee {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface BuildTemplateContextInput {
  lead?: TemplateLead | null
  assignee?: TemplateAssignee | null
  workspace: Record<string, unknown>
  trigger?: { type: string; config: Record<string, unknown> }
}

export function leadTemplate(lead?: TemplateLead | null): TemplateLead | undefined {
  if (!lead) return undefined
  return { ...lead, data: lead.data || {}, url: `/leads/${lead.id}` }
}

export function assigneeTemplate(assignee?: TemplateAssignee | null) {
  if (!assignee) return undefined
  return {
    id: assignee.id,
    name: assignee.name,
    email: assignee.email,
    image: assignee.image,
  }
}

export function buildTemplateContext(input: BuildTemplateContextInput): {
  lead: TemplateLead | undefined
  assignee?: { id: string; name?: string | null; email?: string | null; image?: string | null }
  workspace: Record<string, unknown>
  trigger: { type: string; config: Record<string, unknown> }
  now: string
  uuid: string
} {
  return {
    lead: leadTemplate(input.lead),
    assignee: assigneeTemplate(input.assignee),
    workspace: input.workspace,
    trigger: input.trigger ?? { type: 'workflow', config: {} },
    now: new Date().toISOString(),
    uuid: crypto.randomUUID(),
  }
}