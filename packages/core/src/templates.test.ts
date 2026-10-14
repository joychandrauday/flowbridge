import { describe, it, expect } from 'vitest'
import { WORKFLOW_TEMPLATES, getWorkflowTemplate } from './templates'
import { WorkflowDefinitionSchema } from './schema/workflow'

describe('workflow templates', () => {
  it('ships exactly three templates with unique ids', () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(3)
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(WORKFLOW_TEMPLATES.map((t) => [t.name, t] as const))(
    'validates "%s" against WorkflowDefinitionSchema',
    (_name, template) => {
      const result = WorkflowDefinitionSchema.safeParse(template.definition)
      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.description.length).toBeGreaterThan(0)
    }
  )

  it('looks templates up by id', () => {
    expect(getWorkflowTemplate('instant-assignment')?.name).toBe('Instant Lead Assignment')
    expect(getWorkflowTemplate('nope')).toBeUndefined()
  })
})
