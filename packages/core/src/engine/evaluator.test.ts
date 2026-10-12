import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  evaluateConditionGroup,
  evaluateConditions,
  renderTemplate,
  renderTemplateValue,
  validateTemplate,
} from './evaluator'
import { ConditionGroup } from '../schema/workflow'

describe('Condition Evaluator', () => {
  const context = {
    lead: {
      name: 'John Doe',
      email: 'john@example.com',
      status: 'NEW',
      data: { source: 'website', score: 85 },
    },
  }

  describe('evaluateCondition', () => {
    it('evaluates equals operator', () => {
      expect(evaluateCondition({ field: 'lead.status', operator: 'equals', value: 'NEW' }, context)).toBe(true)
      expect(evaluateCondition({ field: 'lead.status', operator: 'equals', value: 'CONTACTED' }, context)).toBe(false)
    })

    it('evaluates not_equals operator', () => {
      expect(evaluateCondition({ field: 'lead.status', operator: 'not_equals', value: 'CONTACTED' }, context)).toBe(true)
    })

    it('evaluates contains operator', () => {
      expect(evaluateCondition({ field: 'lead.email', operator: 'contains', value: 'example' }, context)).toBe(true)
      expect(evaluateCondition({ field: 'lead.email', operator: 'contains', value: 'gmail' }, context)).toBe(false)
    })

    it('evaluates in operator', () => {
      expect(evaluateCondition({ field: 'lead.status', operator: 'in', value: ['NEW', 'CONTACTED'] }, context)).toBe(true)
      expect(evaluateCondition({ field: 'lead.status', operator: 'in', value: ['WON', 'LOST'] }, context)).toBe(false)
    })

    it('evaluates numeric operators', () => {
      expect(evaluateCondition({ field: 'lead.data.score', operator: 'gt', value: 80 }, context)).toBe(true)
      expect(evaluateCondition({ field: 'lead.data.score', operator: 'lte', value: 85 }, context)).toBe(true)
    })

    it('evaluates is_empty and is_not_empty', () => {
      expect(evaluateCondition({ field: 'lead.phone', operator: 'is_empty', value: undefined }, context)).toBe(true)
      expect(evaluateCondition({ field: 'lead.name', operator: 'is_not_empty', value: undefined }, context)).toBe(true)
    })
  })

  describe('evaluateConditionGroup', () => {
    it('evaluates AND group', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { field: 'lead.status', operator: 'equals', value: 'NEW' },
          { field: 'lead.data.score', operator: 'gt', value: 50 },
        ],
      }
      expect(evaluateConditionGroup(group, context)).toBe(true)
    })

    it('evaluates OR group', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { field: 'lead.status', operator: 'equals', value: 'WON' },
          { field: 'lead.data.score', operator: 'gt', value: 80 },
        ],
      }
      expect(evaluateConditionGroup(group, context)).toBe(true)
    })

    it('evaluates nested groups', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { field: 'lead.status', operator: 'equals', value: 'NEW' },
          {
            operator: 'OR',
            conditions: [
              { field: 'lead.data.score', operator: 'gt', value: 90 },
              { field: 'lead.email', operator: 'contains', value: 'example' },
            ],
          },
        ],
      }
      expect(evaluateConditionGroup(group, context)).toBe(true)
    })
  })

  describe('evaluateConditions', () => {
    it('returns true for empty conditions', () => {
      expect(evaluateConditions([], context)).toBe(true)
    })

    it('evaluates multiple groups with AND', () => {
      const groups: ConditionGroup[] = [
        { operator: 'AND', conditions: [{ field: 'lead.status', operator: 'equals', value: 'NEW' }] },
        { operator: 'AND', conditions: [{ field: 'lead.data.score', operator: 'gt', value: 50 }] },
      ]
      expect(evaluateConditions(groups, context)).toBe(true)
    })
  })
})

describe('Template Renderer', () => {
  const context = {
    lead: {
      id: 'lead-123',
      name: 'John Doe',
      email: 'john@example.com',
      status: 'NEW',
      data: { source: 'website' },
    },
    assignee: {
      id: 'user-456',
      name: 'Jane Agent',
      email: 'jane@agency.com',
    },
    workspace: {
      id: 'ws-789',
      name: 'Demo Agency',
      slug: 'demo-agency',
    },
    trigger: {
      type: 'lead.created',
      config: {},
    },
    now: '2024-01-15T10:30:00Z',
    uuid: 'test-uuid-123',
  }

  it('renders simple lead variables', () => {
    expect(renderTemplate('Hello {{lead.name}}!', context)).toBe('Hello John Doe!')
    expect(renderTemplate('Email: {{lead.email}}', context)).toBe('Email: john@example.com')
  })

  it('renders assignee variables', () => {
    expect(renderTemplate('Assigned to: {{assignee.name}}', context)).toBe('Assigned to: Jane Agent')
  })

  it('renders workspace variables', () => {
    expect(renderTemplate('Workspace: {{workspace.name}}', context)).toBe('Workspace: Demo Agency')
  })

  it('renders system variables', () => {
    expect(renderTemplate('Time: {{now}}', context)).toBe('Time: 2024-01-15T10:30:00Z')
    expect(renderTemplate('ID: {{uuid}}', context)).toBe('ID: test-uuid-123')
  })

  it('renders nested objects', () => {
    const result = renderTemplateValue(
      { subject: 'Welcome {{lead.name}}', body: 'Hi {{lead.name}}, your ID is {{lead.id}}' },
      context
    )
    expect(result.subject).toBe('Welcome John Doe')
    expect(result.body).toBe('Hi John Doe, your ID is lead-123')
  })

  it('handles missing variables gracefully', () => {
    expect(renderTemplate('Phone: {{lead.phone}}', context)).toBe('Phone: ')
  })

  it('validates templates', () => {
    const valid = validateTemplate('Hello {{lead.name}}!')
    expect(valid.valid).toBe(true)
    expect(valid.errors).toEqual([])

    const invalid = validateTemplate('Hello {{lead.secret}}!')
    expect(invalid.valid).toBe(false)
    expect(invalid.errors).toContain('Disallowed template variable: lead.secret')
  })
})