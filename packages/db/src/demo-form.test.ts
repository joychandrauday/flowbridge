import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FormFieldSchema, FormSettingsSchema } from '@flowbridge/core/schema'
import { DEMO_FORM } from './demo-form'

/**
 * Guard against seed/schema drift for the demo form.
 *
 * The seed writes `Form.fields`/`Form.settings` as raw JSON, bypassing the form
 * builder's validation. When that JSON no longer satisfies the core schemas the
 * public page silently 404s (`loadPublicForm` fails closed) and the public
 * intake endpoint 500s — both invisible to typecheck/lint. This test turns that
 * class of bug into a red pipeline instead.
 */
describe('demo form', () => {
  it('has fields that satisfy FormFieldSchema', () => {
    const result = z.array(FormFieldSchema).safeParse(DEMO_FORM.fields)
    expect(result.success ? null : result.error.message).toBeNull()
  })

  it('has settings that satisfy FormSettingsSchema', () => {
    const result = FormSettingsSchema.safeParse(DEMO_FORM.settings)
    expect(result.success ? null : result.error.message).toBeNull()
  })

  it('keeps the labels the golden-path E2E depends on', () => {
    const labels = DEMO_FORM.fields.map((field) => field.label)
    expect(labels).toContain('Full Name')
    expect(labels).toContain('Email')
    expect(labels).toContain('Message')
  })

  it('uses unique field ids and names', () => {
    const ids = DEMO_FORM.fields.map((field) => field.id)
    const names = DEMO_FORM.fields.map((field) => field.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('never names a real field the same as the honeypot', () => {
    const names = DEMO_FORM.fields.map((field) => field.name)
    expect(names).not.toContain(DEMO_FORM.settings.honeypotField)
  })

  it('requires a success message for the public confirmation', () => {
    expect(DEMO_FORM.successMessage).toMatch(/thanks for reaching out/i)
  })
})
