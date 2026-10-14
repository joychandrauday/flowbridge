/**
 * Workflow templates (SPEC §2 stretch / §13 Week 4 "Templates gallery").
 *
 * Pure data — no Prisma, no IO. Every definition is validated against
 * `WorkflowDefinitionSchema` by `templates.test.ts`, so a renamed step field
 * becomes a red pipeline instead of a runtime failure when a user clicks
 * "Use template".
 */

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  /** Untyped on purpose so the test (and the create action) run it through the schema. */
  definition: Record<string, unknown>
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'instant-assignment',
    name: 'Instant Lead Assignment',
    description: 'Assign every new lead round-robin, create a follow-up task, and email the lead.',
    definition: {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [
        {
          id: 'assign',
          type: 'assign',
          config: { strategy: 'round_robin' },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'stop',
        },
        {
          id: 'task',
          type: 'create_task',
          config: {
            title: 'Contact new lead: {{lead.name}}',
            description: 'Source: {{lead.source}}\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
            dueInMinutes: 60,
            assigneeStrategy: 'lead_assignee',
          },
          onFailure: 'continue',
        },
        {
          id: 'ack',
          type: 'send_email',
          config: {
            subject: 'Thanks for reaching out, {{lead.name}}',
            text: 'Hi {{lead.name}},\n\nThanks for contacting us — someone will be in touch shortly.\n\n— The team at {{workspace.name}}',
          },
          onFailure: 'continue',
        },
      ],
    },
  },
  {
    id: 'followup-escalation',
    name: 'Follow-up Escalation (24h)',
    description: 'If a lead is still NEW after 24 hours, create an urgent task and notify an admin.',
    definition: {
      trigger: { type: 'lead.no_activity_for', config: { minutes: 1440 } },
      conditions: [
        {
          operator: 'AND',
          conditions: [{ field: 'lead.status', operator: 'equals', value: 'NEW' }],
        },
      ],
      steps: [
        {
          id: 'escalate-task',
          type: 'create_task',
          config: {
            title: 'URGENT: follow up with {{lead.name}} (no activity for 24h)',
            description: 'This lead has not been contacted in 24 hours.\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
            dueInMinutes: 30,
            assigneeStrategy: 'role',
            role: 'ADMIN',
          },
          onFailure: 'continue',
        },
        {
          id: 'escalate-notify',
          type: 'send_telegram',
          config: {
            message: '⚠️ ESCALATION: {{lead.name}} has had no activity for 24h.\n[View lead]({{lead.url}})',
            parseMode: 'Markdown',
            sendToRole: 'ADMIN',
          },
          onFailure: 'continue',
        },
      ],
    },
  },
  {
    id: 'welcome-and-followup',
    name: 'Welcome & Follow-up',
    description: 'Send a welcome email, wait an hour, then create a follow-up task.',
    definition: {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [
        {
          id: 'welcome',
          type: 'send_email',
          config: {
            subject: 'Welcome, {{lead.name}}!',
            text: 'Hi {{lead.name}},\n\nGreat to meet you. We will follow up shortly with next steps.\n\n— {{workspace.name}}',
          },
          onFailure: 'continue',
        },
        { id: 'wait', type: 'delay', config: { minutes: 60 }, onFailure: 'stop' },
        {
          id: 'followup-task',
          type: 'create_task',
          config: {
            title: 'Follow up with {{lead.name}}',
            description: 'One hour after the welcome email — check in and qualify.',
            dueInMinutes: 120,
          },
          onFailure: 'continue',
        },
      ],
    },
  },
]

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id)
}
