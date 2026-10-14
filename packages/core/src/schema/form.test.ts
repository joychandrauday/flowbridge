import { describe, expect, it } from 'vitest'
import {
  FormFieldSchema,
  FormSettingsSchema,
  FormSchema,
  createIntakeSchema,
  validateIntakeSubmission,
  type FormField,
} from './form'

/** A form config shaped like the one the builder persists. */
const validFields: FormField[] = [
  { id: 'f1', name: 'name', label: 'Full Name', type: 'text', required: true },
  { id: 'f2', name: 'email', label: 'Email', type: 'email', required: true },
  { id: 'f3', name: 'phone', label: 'Phone', type: 'phone', required: false },
  { id: 'f4', name: 'message', label: 'Message', type: 'textarea', required: false },
]

const form = { fields: validFields, settings: FormSettingsSchema.parse({}) }

describe('FormFieldSchema', () => {
  it('rejects a field with no id', () => {
    const result = FormFieldSchema.safeParse({
      name: 'name',
      label: 'Full Name',
      type: 'text',
      required: true,
    })
    expect(result.success).toBe(false)
  })

  it("rejects the legacy 'tel' type (must be 'phone')", () => {
    const result = FormFieldSchema.safeParse({
      id: 'f1',
      name: 'phone',
      label: 'Phone',
      type: 'tel',
      required: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a field with an empty label', () => {
    const result = FormFieldSchema.safeParse({
      id: 'f1',
      name: 'hp_field',
      label: '',
      type: 'hidden',
      required: false,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed field and defaults required to false', () => {
    const result = FormFieldSchema.safeParse({
      id: 'f1',
      name: 'name',
      label: 'Full Name',
      type: 'text',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.required).toBe(false)
  })
})

describe('FormSettingsSchema', () => {
  it('applies full defaults for an empty object', () => {
    const settings = FormSettingsSchema.parse({})
    expect(settings.honeypotField).toBe('website')
    expect(settings.rateLimit).toEqual({
      enabled: true,
      maxSubmissions: 10,
      windowMinutes: 60,
    })
    expect(settings.successMessage).toMatch(/thank you/i)
  })
})

describe('FormSchema', () => {
  it('requires at least one field', () => {
    const result = FormSchema.safeParse({
      id: 'form_1',
      name: 'Contact',
      key: 'contact-form',
      fields: [],
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(result.success).toBe(false)
  })
})

describe('createIntakeSchema / validateIntakeSubmission', () => {
  const schema = createIntakeSchema(form)

  it('accepts a payload with all required fields', () => {
    const result = schema.safeParse({
      name: 'Jane',
      email: 'jane@example.com',
      message: 'Hi',
      website: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing required field', () => {
    const result = schema.safeParse({ name: 'Jane', message: 'Hi' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed email', () => {
    const result = schema.safeParse({ name: 'Jane', email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('allows optional fields to be omitted', () => {
    const result = validateIntakeSubmission(form, {
      name: 'Jane',
      email: 'jane@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('always treats the honeypot field as optional', () => {
    const result = schema.safeParse({ name: 'Jane', email: 'jane@example.com' })
    expect(result.success).toBe(true)
  })
})
