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
})