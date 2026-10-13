import { notFound } from 'next/navigation'
import { loadPublicForm } from '@/lib/public-form'
import { PublicForm } from '@/components/forms/public-form'

/** Embeddable form body, rendered inside the iframe created by /embed.js. */
export default async function EmbedFormPage({ params }: { params: { formKey: string } }) {
  const form = await loadPublicForm(params.formKey)
  if (!form) notFound()

  return (
    <main className="min-h-screen bg-transparent p-4">
      <PublicForm
        formKey={form.key}
        fields={form.fields}
        honeypotField={form.honeypotField}
        successMessage={form.successMessage}
      />
    </main>
  )
}
