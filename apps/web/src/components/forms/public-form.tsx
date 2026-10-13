'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Loader2 } from 'lucide-react'

export interface PublicFormField {
  id: string
  name: string
  label: string
  type: string
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
  defaultValue?: unknown
}

interface PublicFormProps {
  formKey: string
  fields: PublicFormField[]
  honeypotField?: string
  successMessage?: string
  showTitle?: string
  showDescription?: string | null
}

/**
 * Public lead-capture form. Renders the fields defined by a `Form` and posts
 * JSON to the public intake endpoint. Used by both the hosted page (`/f/:key`)
 * and the embeddable iframe page (`/embed/:key`).
 */
export function PublicForm({
  formKey,
  fields,
  honeypotField = 'website',
  successMessage = 'Thank you for your submission!',
  showTitle,
  showDescription,
}: PublicFormProps) {
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const setValue = (name: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('submitting')
    setError(null)

    const payload = { ...values, [honeypotField]: honeypot }

    try {
      const response = await fetch(`/api/intake/${formKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok || response.status === 202) {
        setStatus('success')
        return
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      setStatus('error')
      setError(data.error ?? 'Submission failed. Please try again.')
    } catch {
      setStatus('error')
      setError('Network error. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{successMessage}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showTitle && <h1 className="text-xl font-semibold">{showTitle}</h1>}
      {showDescription && <p className="text-sm text-muted-foreground">{showDescription}</p>}

      {fields
        .filter((field) => field.type !== 'hidden')
        .map((field) => (
          <div key={field.id} className="space-y-1.5">
            {field.type !== 'checkbox' && (
              <Label htmlFor={`field-${field.name}`}>
                {field.label}
                {field.required && <span className="ml-0.5 text-destructive">*</span>}
              </Label>
            )}

            {field.type === 'textarea' ? (
              <Textarea
                id={`field-${field.name}`}
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.target.value)}
                rows={4}
              />
            ) : field.type === 'select' ? (
              <select
                id={`field-${field.name}`}
                name={field.name}
                required={field.required}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'checkbox' ? (
              <div className="flex items-center gap-2">
                <input
                  id={`field-${field.name}`}
                  name={field.name}
                  type="checkbox"
                  required={field.required}
                  checked={Boolean(values[field.name])}
                  onChange={(e) => setValue(field.name, e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-destructive">*</span>}
                </span>
              </div>
            ) : (
              <Input
                id={`field-${field.name}`}
                name={field.name}
                type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                placeholder={field.placeholder}
                required={field.required}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.target.value)}
              />
            )}
          </div>
        ))}

      {/* Honeypot — hidden from humans, tempting to bots (SPEC §3). */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`hp-${formKey}`}>Do not fill this out</label>
        <input
          id={`hp-${formKey}`}
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={status === 'submitting'}>
        {status === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Submit
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
