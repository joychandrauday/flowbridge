import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { createScopedClient } from '@flowbridge/db'
import { redirect } from 'next/navigation'
import FormsTable from './FormsTable'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Forms | FlowBridge',
}

export default async function FormsPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    redirect('/login')
  }

  const scopedPrisma = createScopedClient(session.user.workspaceId)
  const forms = await scopedPrisma.form.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { intakeEvents: true },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forms</h1>
          <p className="text-muted-foreground">Manage your lead capture forms</p>
        </div>
        <Link href="/forms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Form
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Forms</CardTitle>
        </CardHeader>
        <CardContent>
          <FormsTable forms={forms} />
        </CardContent>
      </Card>
    </div>
  )
}