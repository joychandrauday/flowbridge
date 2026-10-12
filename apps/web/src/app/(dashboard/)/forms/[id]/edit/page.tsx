import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { createScopedClient } from '@flowbridge/db'
import { redirect, notFound } from 'next/navigation'
import { FormBuilder } from '@/components/forms/FormBuilder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import type { FormData } from '@/components/forms/FormBuilder'

export const metadata: Metadata = {
  title: 'Edit Form | FlowBridge',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditFormPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    redirect('/login')
  }

  const { id } = await params
  const scopedPrisma = createScopedClient(session.user.workspaceId)

  const form = await scopedPrisma.form.findUnique({
    where: { id },
  })

  if (!form) {
    notFound()
  }

  const initialData: Partial<FormData> = {
    name: form.name,
    key: form.key,
    description: form.description ?? undefined,
    fields: form.fields as unknown as FormData['fields'],
    settings: form.settings as unknown as FormData['settings'],
    isActive: form.active,
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/forms">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Form</h1>
          <p className="text-muted-foreground">Update your lead capture form</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <FormBuilder
            onSubmit={async (data) => {
              const res = await fetch(`/api/forms/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              })
              if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || 'Failed to update form')
              }
            }}
            isSubmitting={false}
            initialData={initialData}
          />
        </CardContent>
      </Card>
    </div>
  )
}