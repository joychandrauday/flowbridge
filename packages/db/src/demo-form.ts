/**
 * Demo form definition for the seed.
 *
 * Kept in a pure module (no Prisma, no IO) so `demo-form.test.ts` can validate
 * it against `FormFieldSchema` / `FormSettingsSchema` without touching the DB.
 *
 * The shape mirrors what the form builder produces and what `POST /api/forms`
 * persists. If this drifts, the public page 404s (`loadPublicForm` fails
 * closed) and the golden-path E2E breaks — so the drift test is the guard.
 */

export type DemoFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'hidden'

export interface DemoFormField {
  id: string
  name: string
  label: string
  type: DemoFormFieldType
  required: boolean
  placeholder?: string
}

export interface DemoForm {
  key: string
  name: string
  description: string
  fields: DemoFormField[]
  settings: {
    honeypotField: string
    rateLimit: {
      enabled: boolean
      maxSubmissions: number
      windowMinutes: number
    }
    successMessage: string
  }
  successMessage: string
  active: boolean
}

/** The message shown after a public submission (asserted by the E2E suite). */
const SUCCESS_MESSAGE =
  "Thanks for reaching out! We'll get back to you within 24 hours."

export const DEMO_FORM: DemoForm = {
  key: 'contact-form',
  name: 'Contact Form',
  description:
    'Questions about our services? Send us a message and we will respond within 24 hours.',
  fields: [
    {
      id: 'field_name',
      name: 'name',
      label: 'Full Name',
      type: 'text',
      required: true,
      placeholder: 'John Doe',
    },
    {
      id: 'field_email',
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      placeholder: 'john@example.com',
    },
    {
      id: 'field_phone',
      name: 'phone',
      label: 'Phone',
      type: 'phone',
      required: false,
      placeholder: '+1 (555) 000-0000',
    },
    {
      id: 'field_company',
      name: 'company',
      label: 'Company',
      type: 'text',
      required: false,
      placeholder: 'Acme Inc.',
    },
    {
      id: 'field_message',
      name: 'message',
      label: 'Message',
      type: 'textarea',
      required: true,
      placeholder: 'How can we help?',
    },
  ],
  settings: {
    // Rendered by `PublicForm` as an off-screen input; the honeypot is not a
    // real field, so it must not collide with one.
    honeypotField: 'website',
    rateLimit: { enabled: true, maxSubmissions: 10, windowMinutes: 60 },
    successMessage: SUCCESS_MESSAGE,
  },
  successMessage: SUCCESS_MESSAGE,
  active: true,
}
