import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CsvImportForm } from './csv-import-form'

export const metadata: Metadata = {
  title: 'Import Leads | FlowBridge',
}

export default async function ImportLeadsPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import leads from CSV</h1>
        <p className="text-muted-foreground">
          Each row becomes a lead, runs your workflow, and lands in the CRM — no lead is lost.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a CSV</CardTitle>
          <CardDescription>
            First row is the header. Pick which column supplies <code className="rounded bg-muted px-1">name</code>,{' '}
            <code className="rounded bg-muted px-1">email</code> and{' '}
            <code className="rounded bg-muted px-1">phone</code>; every other column is kept in the
            lead&apos;s custom data. You&apos;ll see a preview of the first 10 rows before importing,
            and existing leads (matching email or phone) are skipped as duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImportForm />
        </CardContent>
      </Card>
    </div>
  )
}