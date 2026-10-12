import { z } from 'zod'

// ============================================
// Form Field Definitions
// ============================================

export const FormFieldTypeSchema = z.enum([
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
  'hidden',
])

export const FormFieldSchema = z.object({
  id: z.string().min(1),
  type: FormFieldTypeSchema,
  label: z.string().min(1),
  name: z.string().min(1), // Must match field name in submission
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(), // For select type
  defaultValue: z.unknown().optional(),
  validation: z.object({
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(), // Regex pattern
  }).optional(),
})

export type FormField = z.infer<typeof FormFieldSchema>

// ============================================
// Form Configuration
// ============================================

export const FormSettingsSchema = z.object({
  // Honeypot field name (hidden field to catch bots)
  honeypotField: z.string().default('website'),
  // Rate limiting
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxSubmissions: z.number().int().positive().default(10),
    windowMinutes: z.number().int().positive().default(60),
  }).default({}),
  // Success behavior
  successMessage: z.string().default('Thank you for your submission!'),
  redirectUrl: z.string().url().optional(),
  // Notification
  notifyOnSubmit: z.boolean().default(false),
  notificationEmails: z.array(z.string().email()).optional(),
})

export const FormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  key: z.string().min(1).regex(/^[a-z0-9-]+$/), // URL-safe key for public endpoint
  description: z.string().optional(),
  fields: z.array(FormFieldSchema).min(1),
  settings: FormSettingsSchema.default({}),
  workflowId: z.string().optional(), // Optional workflow to trigger on submit
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Form = z.infer<typeof FormSchema>
export type FormSettings = z.infer<typeof FormSettingsSchema>

// ============================================
// Public Intake Submission Schema
// ============================================

// Dynamic schema generated from Form.fields
export function createIntakeSchema(form: Form) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of form.fields) {
    let fieldSchema: z.ZodTypeAny

    switch (field.type) {
      case 'email':
        fieldSchema = z.string().email()
        break
      case 'phone':
        fieldSchema = z.string().regex(/^[\d\s+\-()]+$/, 'Invalid phone number')
        break
      case 'select':
        if (field.options?.length) {
          fieldSchema = z.enum(field.options.map(o => o.value) as [string, ...string[]])
        } else {
          fieldSchema = z.string()
        }
        break
      case 'checkbox':
        fieldSchema = z.boolean()
        break
      case 'textarea':
        fieldSchema = z.string()
        break
      case 'hidden':
        fieldSchema = z.string()
        break
      default:
        fieldSchema = z.string()
    }

    if (field.validation?.minLength) {
      fieldSchema = fieldSchema.refine(
        (val) => !val || val.length >= field.validation!.minLength!,
        `Must be at least ${field.validation!.minLength} characters`
      )
    }
    if (field.validation?.maxLength) {
      fieldSchema = fieldSchema.refine(
        (val) => !val || val.length <= field.validation!.maxLength!,
        `Must be at most ${field.validation!.maxLength} characters`
      )
    }
    if (field.validation?.pattern) {
      fieldSchema = fieldSchema.refine(
        (val) => !val || new RegExp(field.validation!.pattern!).test(val),
        'Invalid format'
      )
    }

    if (!field.required) {
      fieldSchema = fieldSchema.optional().nullable()
    }

    shape[field.name] = fieldSchema
  }

  // Add honeypot field
  shape[form.settings.honeypotField] = z.string().optional()

  return z.object(shape)
}

// ============================================
// Validation Helpers
// ============================================

export function validateForm(form: unknown): Form {
  return FormSchema.parse(form)
}

export function validateIntakeSubmission(form: Form, data: unknown) {
  const schema = createIntakeSchema(form)
  return schema.safeParse(data)
}