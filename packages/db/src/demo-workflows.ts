/**
 * Demo workflow definitions for the seed.
 *
 * Kept in a pure module (no Prisma, no IO) so `demo-workflows.test.ts` can
 * validate every definition against `WorkflowDefinitionSchema`. Step configs
 * are `.strict()`, so an unknown key (e.g. a renamed field) breaks the whole
 * workflow at runtime — this test turns that into a red pipeline instead.
 */

export interface DemoWorkflow {
  id: string
  name: string
  description: string
  definition: Record<string, unknown>
}

export const DEMO_WORKFLOWS: DemoWorkflow[] = [
  {
    id: 'wf_instant_assignment',
    name: 'Instant Lead Assignment',
    description: 'Assign new lead round-robin, create task, send Telegram notification',
    definition: {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [
        {
          id: 'step_assign',
          type: 'assign',
          config: { strategy: 'round_robin' },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'stop',
        },
        {
          id: 'step_task',
          type: 'create_task',
          config: {
            title: 'Contact new lead: {{lead.name}}',
            description: 'Lead source: {{lead.source}}\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
            dueInMinutes: 60,
          },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'continue',
        },
        {
          id: 'step_telegram',
          type: 'send_telegram',
          config: {
            message: '🎯 New lead assigned to you!\n\n*{{lead.name}}* ({{lead.email}})\nSource: {{lead.source}}\n\n[View Lead]({{lead.url}})',
            parseMode: 'Markdown',
          },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'continue',
        },
      ],
    },
  },
  {
    id: 'wf_followup_escalation',
    name: 'Follow-up Escalation (24h)',
    description: 'If lead still NEW after 24h, notify admin and create urgent task',
    definition: {
      // 1 minute stands in for 24h so the escalation is demoable quickly.
      trigger: { type: 'lead.no_activity_for', config: { minutes: 1 } },
      conditions: [
        {
          operator: 'AND',
          conditions: [{ field: 'lead.status', operator: 'equals', value: 'NEW' }],
        },
      ],
      steps: [
        {
          id: 'step_escalate_task',
          type: 'create_task',
          config: {
            title: 'URGENT: Follow up on {{lead.name}} (no activity 24h)',
            description: 'Lead has been NEW for 24 hours without contact.\nEmail: {{lead.email}}\nPhone: {{lead.phone}}',
            dueInMinutes: 30,
            assigneeStrategy: 'role',
            role: 'ADMIN',
          },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'continue',
        },
        {
          id: 'step_escalate_telegram',
          type: 'send_telegram',
          config: {
            message: '⚠️ *ESCALATION*: Lead {{lead.name}} has had no activity for 24h!\n\nPlease follow up immediately.\n[View Lead]({{lead.url}})',
            parseMode: 'Markdown',
            sendToRole: 'ADMIN',
          },
          retry: { maxAttempts: 3, backoff: 'exponential' },
          onFailure: 'continue',
        },
      ],
    },
  },
]
