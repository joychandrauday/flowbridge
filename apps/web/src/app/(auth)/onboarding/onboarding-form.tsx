'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

export default function OnboardingForm({ name, email }: { name?: string; email?: string }) {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = useState(name ? `${name}'s Workspace` : '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceName.trim()) {
      setError('Please give your workspace a name')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceName }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Something went wrong')
        return
      }
      toast({ title: 'Workspace created!', description: 'Your instant-lead-assignment workflow is ready.' })
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Set up your workspace</CardTitle>
        <CardDescription className="text-center">
          {email ? `Logged in as ${email}. ` : ''}Create a workspace to start capturing leads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspaceName">Workspace name</Label>
            <Input
              id="workspaceName"
              type="text"
              placeholder="Acme Inc."
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={isLoading}
              aria-invalid={!!error}
              aria-describedby={error ? 'workspace-error' : undefined}
            />
            {error && (
              <p id="workspace-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              We&apos;ll seed a demo workflow that assigns new leads round-robin so you can see it working immediately.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating workspace…' : 'Create workspace'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}