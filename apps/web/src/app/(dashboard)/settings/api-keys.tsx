'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react'
import { createApiKey, revokeApiKey } from './actions'

const SCOPES = ['read:leads', 'write:workflows', 'trigger:intake'] as const

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
}

interface ApiKeysProps {
  keys: ApiKeyRow[]
  canManage: boolean
}

export function ApiKeys({ keys, canManage }: ApiKeysProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(['read:leads'])
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)

  function toggleScope(scope: string) {
    setSelected((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  async function create() {
    setCreating(true)
    try {
      const result = await createApiKey({ name, scopes: selected })
      if (result.ok && result.key) {
        setNewKey(result.key)
        setName('')
        toast({ title: 'API key created', description: 'Copy it now — it will not be shown again.' })
      } else {
        toast({ title: 'Could not create key', description: result.error, variant: 'destructive' })
      }
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    setRevoking(id)
    try {
      const result = await revokeApiKey(id)
      if (result.ok) toast({ title: 'API key revoked' })
      else toast({ title: 'Could not revoke key', description: result.error, variant: 'destructive' })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Programmatic access for server-to-server calls. Keys are hashed at rest; the plaintext is
          shown only once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                value={name}
                placeholder="CI pipeline"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-3">
                {SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={selected.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={create} disabled={creating || name.trim().length === 0}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Create key
            </Button>
          </div>
        )}

        {newKey && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
            <p className="text-xs text-muted-foreground">
              New key — copy it now, it will not be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all text-xs">{newKey}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy API key"
                onClick={() => {
                  navigator.clipboard.writeText(newKey)
                  toast({ title: 'Copied to clipboard' })
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {key.prefix}… · {key.scopes.join(', ') || 'no scopes'} ·{' '}
                    {key.lastUsedAt
                      ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(key.id)}
                    disabled={revoking === key.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {revoking === key.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
