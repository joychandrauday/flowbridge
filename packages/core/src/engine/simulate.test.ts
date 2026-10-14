import { describe, it, expect } from 'vitest'
import { simulateWorkflow, type SimulationContext } from './simulate'
import type { WorkflowDefinition } from '../schema/workflow'

function context(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    lead: {
      id: 'lead_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      source: 'website',
      status: 'NEW',
      data: { company: 'Analytical Engines' },
      url: '/leads/lead_1',
    },
    assignee: { id: 'mem_1', name: 'Grace Hopper', email: 'grace@example.com' },
    workspace: { id: 'ws_1', name: 'Demo Workspace', slug: 'demo' },
    trigger: { type: 'lead.created', config: {} },
    now: '2026-01-01T00:00:00.000Z',
    uuid: '00000000-0000-4000-8000-000000000000',
    ...overrides,
  }
}

/** Fixtures are intentionally partial — the simulator only reads the fields it renders. */
function def(input: {
  trigger?: { type: string; config: Record<string, unknown> }
  conditions?: unknown[]
  steps: { id: string; type: string; config: Record<string, unknown> }[]
}): WorkflowDefinition {
  return {
    trigger: input.trigger ?? { type: 'lead.created', config: {} },
    conditions: input.conditions ?? [],
    steps: input.steps,
  } as unknown as WorkflowDefinition
}

describe('simulateWorkflow', () => {
  it('renders every template in a step config against the sample lead', () => {
    const definition = def({
      steps: [{ id: 's1', type: 'send_email', config: { to: '{{lead.email}}', subject: 'Hi {{lead.name}}' } }],
    })

    const result = simulateWorkflow(definition, context())

    expect(result.conditionsMet).toBe(true)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].config).toMatchObject({
      to: 'ada@example.com',
      subject: 'Hi Ada Lovelace',
    })
  })

  it('reports unmet conditions and adds a warning', () => {
    const definition = def({
      conditions: [{ field: 'lead.status', operator: 'equals', value: 'WON' }],
      steps: [{ id: 's1', type: 'send_email', config: { to: '{{lead.email}}' } }],
    })

    const result = simulateWorkflow(definition, context())
    expect(result.conditionsMet).toBe(false)
    expect(result.warnings.some((w) => w.includes('Conditions are not met'))).toBe(true)
  })

  it('passes conditions when a flat condition matches', () => {
    const definition = def({
      conditions: [{ field: 'lead.status', operator: 'equals', value: 'NEW' }],
      steps: [{ id: 's1', type: 'assign', config: { strategy: 'round_robin' } }],
    })
    expect(simulateWorkflow(definition, context()).conditionsMet).toBe(true)
  })

  it('flags a template that resolves to nothing', () => {
    const definition = def({
      steps: [{ id: 's1', type: 'send_email', config: { to: '{{lead.phone}}' } }],
    })

    const result = simulateWorkflow(definition, {
      ...context(),
      lead: { id: 'lead_1', name: 'No Phone' },
    })
    expect(result.warnings.some((w) => w.includes('lead.phone'))).toBe(true)
  })

  it('describes delay and http steps in plain language', () => {
    const definition = def({
      steps: [
        { id: 'd1', type: 'delay', config: { minutes: 1440 } },
        { id: 'h1', type: 'http_request', config: { method: 'POST', url: 'https://api.example.com' } },
      ],
    })

    const result = simulateWorkflow(definition, context())
    expect(result.steps[0].note).toContain('1440')
    expect(result.steps[1].note).toContain('https://api.example.com')
  })
})
