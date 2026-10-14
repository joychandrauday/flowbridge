import { z } from 'zod'

// ============================================
// Condition System
// ============================================

export const OperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
  'regex_match',
])

/**
 * Bare lead columns accepted by the condition builder. The evaluator resolves
 * paths against a `{ lead, assignee, workspace, … }` context, so a field that
 * the UI stored as `status` (instead of `lead.status`) would resolve to
 * `undefined` and silently disable the condition. Normalizing here — at parse
 * time — repairs both newly-authored and already-stored definitions.
 */
const BARE_LEAD_FIELDS = new Set([
  'id',
  'name',
  'email',
  'phone',
  'source',
  'status',
  'data',
  'assigneeId',
  'firstContactedAt',
  'lastActivityAt',
  'createdAt',
  'updatedAt',
])

/**
 * Normalize a condition field to a context path. `status` → `lead.status`,
 * `company` → `lead.company`, while `lead.status`, `workspace.name`, `now`
 * and `trigger.type` are left untouched.
 */
export function normalizeConditionField(field: string): string {
  const trimmed = field.trim()
  if (!trimmed) return field
  // Already namespaced or a system variable — leave as authored.
  if (/^(lead|assignee|workspace|trigger)\./.test(trimmed)) return trimmed
  if (trimmed === 'now' || trimmed === 'uuid') return trimmed
  // Bare lead column, a custom field (`company`), or a `data.*` path.
  if (BARE_LEAD_FIELDS.has(trimmed) || trimmed.startsWith('data.')) return `lead.${trimmed}`
  if (!trimmed.includes('.')) return `lead.${trimmed}`
  return trimmed
}

export const ConditionSchema = z.object({
  field: z.string().min(1).transform((field) => normalizeConditionField(field)),
  operator: OperatorSchema,
  value: z.unknown().optional(), // Optional for is_empty/is_not_empty
})

// Recursive schema for condition groups (AND/OR)
// @ts-expect-error - recursive schema reference
export const ConditionGroupSchema = z.object({
  operator: z.enum(['AND', 'OR']).default('AND'),
  // @ts-expect-error - recursive lazy reference
  conditions: z.array(z.union([ConditionSchema, z.lazy(() => ConditionGroupSchema)])).min(1),
})

export type Condition = z.infer<typeof ConditionSchema>
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>

/**
 * A condition list entry may be a single comparison (`{ field, operator, value }`)
 * or a nested AND/OR group. The workflow editor authors the flat form, while the
 * API/imports may use groups — accepting both here is what lets a user actually
 * save a workflow with a condition.
 */
export const ConditionNodeSchema = z.union([ConditionSchema, ConditionGroupSchema])
export type ConditionNode = z.infer<typeof ConditionNodeSchema>

// ============================================
// Trigger Configurations
// ============================================

export const TriggerTypeSchema = z.enum([
  'lead.created',
  'lead.status_changed',
  'lead.no_activity_for',
  'schedule',
  'manual',
])

export const LeadCreatedTriggerConfigSchema = z.object({})

export const LeadStatusChangedTriggerConfigSchema = z.object({
  from: z.nativeEnum({ NEW: 'NEW', CONTACTED: 'CONTACTED', QUALIFIED: 'QUALIFIED', WON: 'WON', LOST: 'LOST' }).optional(),
  to: z.nativeEnum({ NEW: 'NEW', CONTACTED: 'CONTACTED', QUALIFIED: 'QUALIFIED', WON: 'WON', LOST: 'LOST' }).optional(),
}).refine((data) => data.from || data.to, {
  message: 'At least one of "from" or "to" must be specified',
})

export const LeadNoActivityForTriggerConfigSchema = z.object({
  minutes: z.number().int().positive(),
})

export const ScheduleTriggerConfigSchema = z.object({
  cron: z.string().min(1), // Standard cron expression
  timezone: z.string().default('UTC'),
})

export const ManualTriggerConfigSchema = z.object({})

export const TriggerConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead.created'), config: LeadCreatedTriggerConfigSchema }),
  z.object({ type: z.literal('lead.status_changed'), config: LeadStatusChangedTriggerConfigSchema }),
  z.object({ type: z.literal('lead.no_activity_for'), config: LeadNoActivityForTriggerConfigSchema }),
  z.object({ type: z.literal('schedule'), config: ScheduleTriggerConfigSchema }),
  z.object({ type: z.literal('manual'), config: ManualTriggerConfigSchema }),
])

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>

// ============================================
// Step Configurations (Discriminated Union by type)
// ============================================

export const StepRetrySchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  backoff: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
  baseDelayMinutes: z.number().int().positive().default(1),
})

export const StepOnFailureSchema = z.enum(['stop', 'continue'])

export const AssignStepConfigSchema = z.object({
  strategy: z.enum(['round_robin', 'least_open_leads', 'rule_based', 'fixed', 'role']),
  // For rule_based: array of { field, operator, value, assigneeId }
  rules: z.array(z.object({
    field: z.string(),
    operator: OperatorSchema,
    value: z.unknown(),
    assigneeId: z.string(),
  })).optional(),
  // For fixed strategy
  assigneeId: z.string().optional(),
  // For role strategy
  role: z.enum(['OWNER', 'ADMIN', 'AGENT']).optional(),
  // For round_robin: pointer persisted per workflow
}).strict()

export const CreateTaskStepConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueInMinutes: z.number().int().positive().optional(),
  dueAt: z.string().datetime().optional(), // ISO string template
  assigneeStrategy: z.enum(['lead_assignee', 'round_robin', 'least_open_leads', 'fixed', 'role']).default('lead_assignee'),
  assigneeId: z.string().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'AGENT']).optional(),
}).strict()

export const UpdateFieldStepConfigSchema = z.object({
  field: z.string().min(1), // e.g., 'status', 'data.customField', 'assigneeId'
  value: z.unknown(), // Can be a template string
}).strict()

export const SendEmailStepConfigSchema = z.object({
  to: z.string().email().optional(), // Template, defaults to lead.email
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().optional(),
  templateId: z.string().optional(), // For Resend templates
  integrationName: z.string().optional(), // Specific integration to use
}).strict()

export const SendTelegramStepConfigSchema = z.object({
  message: z.string().min(1),
  parseMode: z.enum(['Markdown', 'HTML', 'MarkdownV2']).default('Markdown'),
  chatId: z.string().optional(), // Template, defaults to lead's telegram chat or integration default
  sendToRole: z.enum(['OWNER', 'ADMIN', 'AGENT', 'LEAD_ASSIGNEE']).optional(),
  integrationName: z.string().optional(),
}).strict()

export const SendSlackStepConfigSchema = z.object({
  message: z.string().min(1),
  channel: z.string().optional(), // Template; defaults to integration defaultChannel
  blocks: z.array(z.record(z.unknown())).optional(),
  integrationName: z.string().optional(),
}).strict()

export const SendDiscordStepConfigSchema = z.object({
  message: z.string().min(1),
  username: z.string().optional(), // Template; overrides the webhook's display name
  integrationName: z.string().optional(),
}).strict()

export const HttpRequestStepConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(), // Can be template
  timeoutMs: z.number().int().positive().max(30000).default(10000),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().int().positive().default(5),
  responseSizeLimitBytes: z.number().int().positive().default(1048576), // 1MB
  successCodes: z.array(z.number().int()).default([200, 201, 202, 204]),
}).strict()

export const DelayStepConfigSchema = z.object({
  minutes: z.number().int().positive(),
}).strict()

export const StepConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('assign'), config: AssignStepConfigSchema }),
  z.object({ type: z.literal('create_task'), config: CreateTaskStepConfigSchema }),
  z.object({ type: z.literal('update_field'), config: UpdateFieldStepConfigSchema }),
  z.object({ type: z.literal('send_email'), config: SendEmailStepConfigSchema }),
  z.object({ type: z.literal('send_telegram'), config: SendTelegramStepConfigSchema }),
  z.object({ type: z.literal('send_slack'), config: SendSlackStepConfigSchema }),
  z.object({ type: z.literal('send_discord'), config: SendDiscordStepConfigSchema }),
  z.object({ type: z.literal('http_request'), config: HttpRequestStepConfigSchema }),
  z.object({ type: z.literal('delay'), config: DelayStepConfigSchema }),
])

export type StepConfig = z.infer<typeof StepConfigSchema>

/** Builds the per-step schema for a given step type. */
function stepSchemaOf<T extends StepConfig['type']>(
  type: T,
  configSchema: (typeof StepConfigSchema.options)[number]['shape']['config']
) {
  return z.object({
    id: z.string().min(1),
    type: z.literal(type),
    config: configSchema,
    retry: StepRetrySchema.optional(),
    onFailure: StepOnFailureSchema.optional(),
  })
}

// ============================================
// Workflow Definition
// ============================================

export const WorkflowStepSchema = z.discriminatedUnion('type', [
  stepSchemaOf('assign', AssignStepConfigSchema),
  stepSchemaOf('create_task', CreateTaskStepConfigSchema),
  stepSchemaOf('update_field', UpdateFieldStepConfigSchema),
  stepSchemaOf('send_email', SendEmailStepConfigSchema),
  stepSchemaOf('send_telegram', SendTelegramStepConfigSchema),
  stepSchemaOf('send_slack', SendSlackStepConfigSchema),
  stepSchemaOf('send_discord', SendDiscordStepConfigSchema),
  stepSchemaOf('http_request', HttpRequestStepConfigSchema),
  stepSchemaOf('delay', DelayStepConfigSchema),
])

export const WorkflowDefinitionSchema = z.object({
  trigger: TriggerConfigSchema,
  conditions: z.array(ConditionNodeSchema).default([]),
  steps: z.array(WorkflowStepSchema).min(1),
})

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

// ============================================
// Template Variables Allowlist
// ============================================

export const TEMPLATE_ALLOWLIST = [
  // Lead fields
  'lead.id',
  'lead.name',
  'lead.email',
  'lead.phone',
  'lead.source',
  'lead.status',
  'lead.data',
  'lead.createdAt',
  'lead.updatedAt',
  'lead.url', // Generated: /leads/{id}

  // Assignee fields (when assigned)
  'assignee.id',
  'assignee.name',
  'assignee.email',
  'assignee.image',

  // Workspace fields
  'workspace.id',
  'workspace.name',
  'workspace.slug',

  // Trigger fields
  'trigger.type',
  'trigger.config',

  // System variables
  'now', // ISO datetime
  'uuid', // Random UUID
] as const

export type TemplateVariable = typeof TEMPLATE_ALLOWLIST[number]

// ============================================
// Validation Helpers
// ============================================

export function validateWorkflowDefinition(definition: unknown): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse(definition)
}

export function validateStepConfig(type: string, config: unknown) {
  const stepSchema = StepConfigSchema.options.find((s) => s.shape.type.value === type)
  if (!stepSchema) {
    throw new Error(`Unknown step type: ${type}`)
  }
  return stepSchema.shape.config.parse(config)
}