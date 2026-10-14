import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { createLead } from '../actions'

export const metadata: Metadata = {
  title: 'New lead | FlowBridge',
}

const SOURCES = ['manual', 'website', 'facebook', 'linkedin', 'referral', 'event', 'other']

export default async function NewLeadPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to leads">
          <Link href="/leads">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New lead</h1>
          <p className="text-muted-foreground">
            Add a lead by hand. Your <code className="text-xs">lead.created</code> workflows still run.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Lead details
          </CardTitle>
          <CardDescription>
            Email is used to dedupe against existing leads in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createLead} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required placeholder="Jane Cooper" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="jane@acme.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" placeholder="+1 555 0100" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <select
                  id="source"
                  name="source"
                  defaultValue="manual"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" placeholder="Acme Inc." />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit">Create lead</Button>
              <Button asChild variant="ghost">
                <Link href="/leads">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
