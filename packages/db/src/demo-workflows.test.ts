import { describe, expect, it } from 'vitest'
import { WorkflowDefinitionSchema } from '@flowbridge/core/schema'
import { DEMO_WORKFLOWS } from './demo-workflows'

/**
 * Guard against seed/schema drift. Step configs are `.strict()`, so a renamed
 * or unknown key makes the whole workflow invalid at runtime — the engine marks
 * the run FAILED and the time-trigger sweep silently skips it. This test turns
 * that class of bug into a red pipeline instead.
 */
describe('demo workflows', () => {
  it('defines at least the instant-assignment and follow-up workflows', () => {
    const ids = DEMO_WORKFLOWS.map((workflow) => workflow.id)
    expect(ids).toContain('wf_instant_assignment')
    expect(ids).toContain('wf_followup_escalation')
  })

  it.each(DEMO_WORKFLOWS.map((workflow) => [workflow.name, workflow] as const))(
    'validates "%s" against WorkflowDefinitionSchema',
    (_name, workflow) => {
      const result = WorkflowDefinitionSchema.safeParse(workflow.definition)
      expect(result.success ? null : result.error.message).toBeNull()
    }
  )

  it('uses step ids that are unique within each workflow', () => {
    for (const workflow of DEMO_WORKFLOWS) {
      const steps = (workflow.definition.steps ?? []) as Array<{ id: string }>
      const ids = steps.map((step) => step.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
