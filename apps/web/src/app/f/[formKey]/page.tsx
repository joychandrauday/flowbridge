import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicForm } from '@/lib/public-form'
import { PublicForm } from '@/components/forms/public-form'

export async function generateMetadata({
  params,
}: {
  params: { formKey: string }
}): Promise<Metadata> {
  const form = await loadPublicForm(params.formKey)
  return { title: form ? `${form.name} | FlowBridge` : 'Form | FlowBridge' }
}

/** Public hosted lead-capture page (SPEC §2 — public form URL). */
export default async function HostedFormPage({ params }: { params: { formKey: string } }) {
  const form = await loadPublicForm(params.formKey)
  if (!form) notFound()

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-sm">
        <PublicForm
          formKey={form.key}
          fields={form.fields}
          honeypotField={form.honeypotField}
          successMessage={form.successMessage}
          showTitle={form.name}
          showDescription={form.description}
        />
        <p className="mt-6 text-center text-xs text-muted-foreground">Powered by FlowBridge</p>
      </div>
    </main>
  )
}
