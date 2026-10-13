import { prisma } from '@flowbridge/db'
import { z } from 'zod'
import { FormFieldSchema, FormSettingsSchema } from '@flowbridge/core/schema'

export interface PublicFormData {
  key: string
  name: string
  description: string | null
  fields: z.infer<typeof FormFieldSchema>[]
  honeypotField: string
  successMessage: string
}

/**
 * Load an active form for public rendering (`/f/:key`, `/embed/:key`).
 * Returns null when the form is missing/inactive or its field config is invalid.
 * Form field/settings JSON is validated here so a malformed row fails closed.
 */
export async function loadPublicForm(formKey: string): Promise<PublicFormData | null> {
  const form = await prisma.form.findUnique({ where: { key: formKey } })
  if (!form || !form.active) return null

  const fields = z.array(FormFieldSchema).safeParse(form.fields)
  if (!fields.success || fields.data.length === 0) return null

  const parsedSettings = FormSettingsSchema.safeParse(form.settings ?? {})
  const settings = parsedSettings.success ? parsedSettings.data : FormSettingsSchema.parse({})

  return {
    key: form.key,
    name: form.name,
    description: form.description,
    fields: fields.data,
    honeypotField: settings.honeypotField,
    successMessage: form.successMessage ?? settings.successMessage,
  }
}
