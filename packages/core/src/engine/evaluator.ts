import {
  Condition,
  ConditionGroup,
  ConditionNode,
  TEMPLATE_ALLOWLIST,
  TemplateVariable,
  normalizeConditionField,
} from '../schema/workflow'

// ============================================
// Condition Evaluator
// ============================================

export function evaluateCondition(condition: Condition, context: Record<string, unknown>): boolean {
  // Defensive normalization: some callers (assign `rule_based`, live previews)
  // pass condition objects that never went through `WorkflowDefinitionSchema`,
  // where a bare `status` would silently resolve to `undefined`.
  const fieldValue = getNestedValue(context, normalizeConditionField(condition.field))
  const conditionValue = condition.value

  switch (condition.operator) {
    case 'equals':
      return fieldValue === conditionValue
    case 'not_equals':
      return fieldValue !== conditionValue
    case 'contains':
      return String(fieldValue).includes(String(conditionValue))
    case 'not_contains':
      return !String(fieldValue).includes(String(conditionValue))
    case 'starts_with':
      return String(fieldValue).startsWith(String(conditionValue))
    case 'ends_with':
      return String(fieldValue).endsWith(String(conditionValue))
    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue)
    case 'not_in':
      return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue)
    case 'gt':
      return Number(fieldValue) > Number(conditionValue)
    case 'gte':
      return Number(fieldValue) >= Number(conditionValue)
    case 'lt':
      return Number(fieldValue) < Number(conditionValue)
    case 'lte':
      return Number(fieldValue) <= Number(conditionValue)
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === ''
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== ''
    case 'regex_match':
      return new RegExp(String(conditionValue)).test(String(fieldValue))
    default:
      return false
  }
}

export function evaluateConditionGroup(group: ConditionGroup, context: Record<string, unknown>): boolean {
  const results = group.conditions.map((cond: Condition | ConditionGroup) => {
    if ('operator' in cond && 'conditions' in cond) {
      // It's a nested ConditionGroup
      return evaluateConditionGroup(cond, context)
    } else {
      // It's a Condition
      return evaluateCondition(cond, context)
    }
  })

  if (group.operator === 'AND') {
    return results.every((r: boolean) => r)
  } else {
    return results.some((r: boolean) => r)
  }
}

export function evaluateConditions(conditions: ConditionNode[], context: Record<string, unknown>): boolean {
  if (conditions.length === 0) return true
  // Entries may be a single comparison or an AND/OR group (see ConditionNodeSchema).
  return conditions.every((node) =>
    'conditions' in node ? evaluateConditionGroup(node, context) : evaluateCondition(node, context)
  )
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current === null || current === undefined) return undefined
    return (current as Record<string, unknown>)[key]
  }, obj)
}

// ============================================
// Template Renderer
// ============================================

interface TemplateContext {
  lead: Record<string, unknown>
  assignee?: Record<string, unknown>
  workspace: Record<string, unknown>
  trigger: { type: string; config: Record<string, unknown> }
  now: string
  uuid: string
}

export function renderTemplate(template: string, context: TemplateContext): string {
  // Build flat context with allowlisted variables
  const flatContext: Record<string, unknown> = {}

  // Lead fields
  for (const key of TEMPLATE_ALLOWLIST) {
    if (key.startsWith('lead.')) {
      const path = key.slice(5) // Remove 'lead.'
      flatContext[key] = getNestedValue(context.lead, path)
    } else if (key.startsWith('assignee.')) {
      const path = key.slice(9) // Remove 'assignee.'
      flatContext[key] = context.assignee ? getNestedValue(context.assignee, path) : undefined
    } else if (key.startsWith('workspace.')) {
      const path = key.slice(10) // Remove 'workspace.'
      flatContext[key] = getNestedValue(context.workspace, path)
    } else if (key.startsWith('trigger.')) {
      const path = key.slice(8) // Remove 'trigger.'
      flatContext[key] = getNestedValue(context.trigger, path)
    } else if (key === 'now') {
      flatContext[key] = context.now
    } else if (key === 'uuid') {
      flatContext[key] = context.uuid
    }
  }

  // Replace {{variable}} patterns
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, variable) => {
    const value = flatContext[variable as TemplateVariable]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

export function renderTemplateValue<T>(value: T, context: TemplateContext): T {
  if (typeof value === 'string') {
    return renderTemplate(value, context) as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => renderTemplateValue(v, context)) as T
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = renderTemplateValue(val, context)
    }
    return result as T
  }
  return value
}

// ============================================
// Validation Helpers
// ============================================

export function validateTemplate(template: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const matches = template.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) || []

  for (const match of matches) {
    const variable = match.slice(2, -2) // Remove {{ }}
    if (!TEMPLATE_ALLOWLIST.includes(variable as TemplateVariable)) {
      errors.push(`Disallowed template variable: ${variable}`)
    }
  }

  return { valid: errors.length === 0, errors }
}