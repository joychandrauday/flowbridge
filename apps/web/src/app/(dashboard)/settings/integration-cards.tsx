'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { saveIntegration, deleteIntegration, sendTestEmail } from './actions'
import { Loader2, Plug, PlugZap } from 'lucide-react'

interface PublicIntegration {
  id: string
  type: string
  name: string
  configured: boolean
}

interface FieldDef {
  name: string
  label: string
  type: 'text' | 'password' | 'number' | 'checkbox' | 'select'
  placeholder?: string
  options?: string[]
  smtpOnly?: boolean
  resendOnly?: boolean
}

interface TypeDef {
  title: string
  description: string
  defaultName: string
  fields: FieldDef[]
}

const INTEGRATION_TYPES: Record<string, TypeDef> = {
  email: {
    title: 'Email',
    description: 'Send notifications, confirmations, and follow-ups via SMTP or Resend.',
    defaultName: 'email',
    fields: [
      { name: 'provider', label: 'Provider', type: 'select', options: ['smtp', 'resend', 'log'] },
      { name: 'apiKey', label: 'Resend API key', type: 'password', resendOnly: true },
      { name: 'host', label: 'SMTP host', type: 'text', placeholder: 'smtp.example.com', smtpOnly: true },
      { name: 'port', label: 'SMTP port', type: 'number', placeholder: '587', smtpOnly: true },
      { name: 'secure', label: 'Use SSL/TLS (465)', type: 'checkbox', smtpOnly: true },
      { name: 'user', label: 'SMTP username', type: 'text', smtpOnly: true },
      { name: 'password', label: 'SMTP password', type: 'password', smtpOnly: true },
      { name: 'from', label: 'From address', type: 'text', placeholder: 'Leads <leads@acme.com>' },
    ],
  },
  telegram: {
    title: 'Telegram',
    description: 'Push instant lead notifications to a chat.',
    defaultName: 'telegram',
    fields: [
      { name: 'botToken', label: 'Bot token', type: 'password', placeholder: '123456:ABC-DEF…' },
      { name: 'chatId', label: 'Default chat ID', type: 'text', placeholder: '-1001234567890' },
    ],
  },
  slack: {
    title: 'Slack',
    description: 'Post new-lead alerts to a channel via webhook.',
    defaultName: 'slack',
    fields: [
      { name: 'webhookUrl', label: 'Incoming webhook URL', type: 'password', placeholder: 'https://hooks.slack.com/services/…' },
    ],
  },
  discord: {
    title: 'Discord',
    description: 'Post new-lead alerts to a Discord channel via webhook.',
    defaultName: 'discord',
    fields: [
      { name: 'webhookUrl', label: 'Webhook URL', type: 'password', placeholder: 'https://discord.com/api/webhooks/…' },
    ],
  },
  http: {
    title: 'HTTP / Webhooks out',
    description: 'Call your own APIs when workflows run.',
    defaultName: 'http',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.acme.com' },
      { name: 'authToken', label: 'Auth token (optional)', type: 'password' },
    ],
  },
}

function emptyForm(type: TypeDef): Record<string, string | boolean> {
  const form: Record<string, string | boolean> = {}
  for (const field of type.fields) {
    if (field.type === 'checkbox') form[field.name] = false
    else if (field.type === 'select') form[field.name] = field.options?.[0] ?? ''
    else form[field.name] = ''
  }
  return form
}

function toConfig(type: TypeDef, form: Record<string, string | boolean>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const field of type.fields) {
    const value = form[field.name]
    if (field.type === 'number') {
      if (value === '' || value === undefined) continue
      config[field.name] = Number(value)
    } else if (field.type === 'checkbox') {
      config[field.name] = Boolean(value)
    } else {
      if (typeof value === 'string' && value.trim() !== '') config[field.name] = value.trim()
    }
  }
  return config
}

export function IntegrationCards({ integrations }: { integrations: PublicIntegration[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [forms, setForms] = useState<Record<string, Record<string, string | boolean>>>(() => {
    const initial: Record<string, Record<string, string | boolean>> = {}
    for (const type of Object.keys(INTEGRATION_TYPES)) initial[type] = emptyForm(INTEGRATION_TYPES[type])
    return initial
  })

  const configuredByType = (type: string) => integrations.some((i) => i.type === type && i.configured)

  const setField = (type: string, field: string, value: string | boolean) => {
    setForms((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  const handleSave = (type: string) => {
    const def = INTEGRATION_TYPES[type]
    startTransition(async () => {
      const result = await saveIntegration(type, def.defaultName, toConfig(def, forms[type]))
      if (result?.ok) {
        toast({ title: 'Saved', description: `${def.title} integration updated.` })
        router.refresh()
      } else {
        toast({ title: 'Save failed', description: result?.error ?? 'Try again', variant: 'destructive' })
      }
    })
  }

  const handleDelete = (type: string) => {
    const integration = integrations.find((i) => i.type === type)
    if (!integration) return
    startTransition(async () => {
      const result = await deleteIntegration(integration.id)
      if (result?.ok) {
        toast({ title: 'Disconnected', description: `${INTEGRATION_TYPES[type].title} removed.` })
        router.refresh()
      } else {
        toast({ title: 'Failed', description: result?.error ?? 'Try again', variant: 'destructive' })
      }
    })
  }

  const handleTest = (type: string) => {
    if (type !== 'email') return
    startTransition(async () => {
      const result = await sendTestEmail()
      if (result?.ok) {
        toast({ title: 'Test email sent', description: 'Check your inbox.' })
      } else {
        toast({ title: 'Test email failed', description: result?.error ?? 'Try again', variant: 'destructive' })
      }
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(INTEGRATION_TYPES).map(([type, def]) => {
        const configured = configuredByType(type)
        return (
          <Card key={type}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{def.title}</CardTitle>
                {configured ? (
                  <Badge variant="success" className="gap-1">
                    <PlugZap className="h-3 w-3" aria-hidden="true" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <Plug className="h-3 w-3" aria-hidden="true" /> Not configured
                  </Badge>
                )}
              </div>
              <CardDescription>{def.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {def.fields.map((field) => {
                const provider = forms[type].provider
                const isProviderConditional =
                  (field.smtpOnly && provider !== 'smtp') || (field.resendOnly && provider !== 'resend')
                if (isProviderConditional) return null
                return (
                  <div key={field.name} className="space-y-1.5">
                    <Label htmlFor={`${type}-${field.name}`}>{field.label}</Label>
                    {field.type === 'checkbox' ? (
                      <div className="flex items-center gap-2">
                        <input
                          id={`${type}-${field.name}`}
                          type="checkbox"
                          checked={Boolean(forms[type][field.name])}
                          onChange={(e) => setField(type, field.name, e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm text-muted-foreground">Use a secure connection</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select
                        id={`${type}-${field.name}`}
                        value={String(forms[type][field.name] ?? '')}
                        onChange={(e) => setField(type, field.name, e.target.value)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        {field.options?.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`${type}-${field.name}`}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={String(forms[type][field.name] ?? '')}
                        onChange={(e) => setField(type, field.name, e.target.value)}
                        disabled={isPending}
                      />
                    )}
                  </div>
                )
              })}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" size="sm" onClick={() => handleSave(type)} disabled={isPending}>
                  {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {configured ? 'Update' : 'Connect'}
                </Button>
                {type === 'email' && configured && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => handleTest(type)} disabled={isPending}>
                    Send test email
                  </Button>
                )}
                {configured && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleDelete(type)} disabled={isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}