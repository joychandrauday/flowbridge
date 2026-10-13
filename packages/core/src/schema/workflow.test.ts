import { describe, it, expect } from 'vitest'
import { WorkflowDefinitionSchema } from './workflow'

describe('WorkflowDefinitionSchema', () => {
  it('parses a valid workflow', () => {
    const validWorkflow = {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [
        { id: 'step-1', type: 'assign', config: { strategy: 'round_robin' } },
      ],
    }
    const result = WorkflowDefinitionSchema.safeParse(validWorkflow)
    expect(result.success).toBe(true)
  })

  it('rejects invalid trigger type', () => {
    const invalidWorkflow = {
      trigger: { type: 'invalid', config: {} },
      conditions: [],
      steps: [],
    }
    const result = WorkflowDefinitionSchema.safeParse(invalidWorkflow)
    expect(result.success).toBe(false)
  })

  it('rejects workflow without steps', () => {
    const invalidWorkflow = {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [],
    }
    const result = WorkflowDefinitionSchema.safeParse(invalidWorkflow)
    expect(result.success).toBe(false)
  })

  it.each([
    ['assign', { strategy: 'round_robin' }],
    ['create_task', { title: 'Call {{lead.name}}', dueInMinutes: 30 }],
    ['update_field', { field: 'status', value: 'CONTACTED' }],
    ['send_email', { subject: 'Hello {{lead.name}}' }],
    ['send_telegram', { message: 'New lead: {{lead.name}}' }],
    ['send_slack', { message: 'New lead: {{lead.name}}', channel: '#leads' }],
    ['http_request', { url: 'https://example.com/hook', method: 'POST' }],
    ['delay', { minutes: 5 }],
  ])('parses a %s step', (type, config) => {
    const workflow = {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [{ id: 'step-1', type, config }],
    }
    expect(WorkflowDefinitionSchema.safeParse(workflow).success).toBe(true)
  })

  it('rejects a step whose config is invalid for its type', () => {
    const workflow = {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [
        // delay requires a positive `minutes`, so this must fail
        { id: 'step-1', type: 'delay', config: { minutes: -1 } },
      ],
    }
    expect(WorkflowDefinitionSchema.safeParse(workflow).success).toBe(false)
  })

  it('rejects an unknown step type', () => {
    const workflow = {
      trigger: { type: 'lead.created', config: {} },
      conditions: [],
      steps: [{ id: 'step-1', type: 'send_discord', config: {} }],
    }
    const result = WorkflowDefinitionSchema.safeParse(workflow)
    expect(result.success).toBe(false)
  })
})