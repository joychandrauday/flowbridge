import type { WorkflowDefinition } from '../schema/workflow'
import { evaluateConditions, renderTemplateValue } from './evaluator'

/**
 * Dry-run simulator (SPEC §10 — the workflow editor's "Test" button).
 *
 * Pure: it renders each step's config with a sample template context and
 * evaluates the conditions, **without side effects** (no email, no Telegram, no
 * database writes). The editor shows the result so a user can confirm what a
 * workflow would do before it ever touches a real lead.
 */

export interface SimulatedStep {
  id: string
  type: string
  /** Step config with every `{{template}}` resolved against the sample lead. */
  config: Record<string, unknown>
  /** A plain-language note for steps whose effect is not obvious from config. */
  note?: string
}

export interface SimulationResult {
  conditionsMet: boolean
  steps: SimulatedStep[]
  warnings: string[]
}

export interface SimulationContext {
  lead: Record<string, unknown>
  assignee?: Record<string, unknown>
  workspace: Record<string, unknown>
  trigger: { type: string; config: Record<string, unknown> }
  now: string
  uuid: string
  [key: string]: unknown
}

export function simulateWorkflow(
  definition: WorkflowDefinition,
  context: SimulationContext
): SimulationResult {
  const conditionsMet = evaluateConditions(definition.conditions, context)
  const warnings: string[] = []

  const steps: SimulatedStep[] = definition.steps.map((step) => {
    const config = renderTemplateValue(step.config, context) as Record<string, unknown>
    let note: string | undefined

    switch (step.type) {
      case 'assign': {
        note = `Assigns using strategy "${String(config.strategy ?? 'round_robin')}"`
        break
      }
      case 'create_task': {
        note = `Creates task "${String(config.title ?? '')}"`
        break
      }
      case 'update_field': {
        note = `Sets ${String(config.field ?? '')} = ${String(config.value ?? '')}`
        break
      }
      case 'send_email': {
        if (!config.subject) warnings.push(`${step.id}: send_email has no subject`)
        note = `Emails ${String(config.to ?? '{{lead.email}}')}`
        break
      }
      case 'send_telegram':
      case 'send_slack':
      case 'send_discord': {
        note = 'Sends a notification'
        break
      }
      case 'http_request': {
        note = `${String(config.method ?? 'POST')} ${String(config.url ?? '(no url)')}`
        if (!config.url) warnings.push(`${step.id}: http_request has no URL`)
        break
      }
      case 'delay': {
        note = `Waits ~${String(config.minutes ?? 0)} minute(s)`
        break
      }
    }

    // Warn about any template variable that did not resolve to a value.
    const unresolved = findUnresolvedTemplates(step.config, config)
    for (const variable of unresolved) {
      warnings.push(`${step.id}: {{${variable}}} resolved to nothing for this lead`)
    }

    return { id: step.id, type: step.type, config, note }
  })

  if (!conditionsMet) {
    warnings.push('Conditions are not met for this lead — the run would stop before any step.')
  }

  return { conditionsMet, steps, warnings }
}

/**
 * Compare the raw config with the rendered one to spot `{{vars}}` that expanded
 * to an empty string (usually a missing field on the sample lead).
 */
function findUnresolvedTemplates(
  raw: Record<string, unknown>,
  rendered: Record<string, unknown>
): string[] {
  const missing: string[] = []
  const pattern = /\{\{(\w+(?:\.\w+)*)\}\}/g

  const visit = (rawValue: unknown, renderedValue: unknown) => {
    if (typeof rawValue === 'string') {
      for (const match of rawValue.matchAll(pattern)) {
        const variable = match[1]
        const placeholder = `{{${variable}}}`
        const replacement = String(renderedValue ?? '')
        if (replacement === '' || replacement.includes(placeholder)) missing.push(variable)
      }
      return
    }
    if (Array.isArray(rawValue)) {
      rawValue.forEach((item, i) => visit(item, Array.isArray(renderedValue) ? renderedValue[i] : undefined))
      return
    }
    if (rawValue && typeof rawValue === 'object') {
      const renderedObject =
        renderedValue && typeof renderedValue === 'object'
          ? (renderedValue as Record<string, unknown>)
          : {}
      for (const [key, value] of Object.entries(rawValue as Record<string, unknown>)) {
        visit(value, renderedObject[key])
      }
    }
  }

  visit(raw, rendered)
  return missing
}
