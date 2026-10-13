'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Copy, Loader2, RefreshCw } from 'lucide-react'
import { regenerateWebhookSecret, updateWorkspace } from './actions'

interface WorkspaceSettingsProps {
  name: string
  slug: string
  webhookConfigured: boolean
  origin: string
  canManage: boolean
}

export function WorkspaceSettings({
  name,
  slug,
  webhookConfigured,
  origin,
  canManage,
}: WorkspaceSettingsProps) {
  const [form, setForm] = useState({ name, slug })
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const endpoint = `${origin}/api/webhooks/${form.slug}/:source`

  async function save() {
    setSaving(true)
    try {
      const data = new FormData()
      data.set('name', form.name)
      data.set('slug', form.slug)
      const result = await updateWorkspace(data)
      if (result.ok) {
        toast({ title: 'Workspace updated' })
      } else {
        toast({ title: 'Could not update workspace', description: result.error, variant: 'destructive' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function rotate() {
    setRotating(true)
    try {
      const result = await regenerateWebhookSecret()
      if (result.ok && result.secret) {
        setSecret(result.secret)
        toast({
          title: 'Webhook secret rotated',
          description: 'Copy it now — it will not be shown again.',
        })
      } else {
        toast({ title: 'Could not rotate secret', description: result.error, variant: 'destructive' })
      }
    } finally {
      setRotating(false)
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>The name and public slug for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                value={form.name}
                disabled={!canManage}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-slug">Slug</Label>
              <Input
                id="ws-slug"
                value={form.slug}
                disabled={!canManage}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
              />
            </div>
          </div>
          <Button onClick={save} disabled={!canManage || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save
          </Button>
          {!canManage && (
            <p className="text-xs text-muted-foreground">Only owners and admins can edit these.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound webhook</CardTitle>
          <CardDescription>
            POST JSON here to create leads. Sign requests with <code>X-FlowBridge-Signature</code>{' '}
            when a secret is set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input readOnly value={endpoint} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(endpoint)} aria-label="Copy endpoint">
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Secret: {webhookConfigured || secret ? 'configured' : 'not set (unauthenticated)'}
            </span>
            <Button variant="outline" size="sm" onClick={rotate} disabled={!canManage || rotating}>
              {rotating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {webhookConfigured || secret ? 'Rotate secret' : 'Generate secret'}
            </Button>
          </div>

          {secret && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground">
                New secret — copy it now, it will not be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all text-xs">{secret}</code>
                <Button variant="ghost" size="icon" onClick={() => copy(secret)} aria-label="Copy secret">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
