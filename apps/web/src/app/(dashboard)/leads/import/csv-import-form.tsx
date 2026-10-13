'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Loader2, UploadCloud } from 'lucide-react'

interface ImportResult {
  success?: boolean
  imported?: number
  duplicates?: number
  errors?: string[]
  error?: string
}

export function CsvImportForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast({ title: 'No file selected', description: 'Choose a CSV to import.', variant: 'destructive' })
      return
    }

    setIsLoading(true)
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/leads/import', { method: 'POST', body })
      const data = (await response.json().catch(() => ({}))) as ImportResult
      if (!response.ok) {
        toast({ title: 'Import failed', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        setResult(data)
      } else {
        toast({ title: 'Import finished', description: `${data.imported ?? 0} imported, ${data.duplicates ?? 0} skipped.` })
        setResult(data)
        router.refresh()
      }
    } catch {
      toast({ title: 'Import failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV file</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={isLoading}
        />
      </div>
      <Button type="submit" disabled={isLoading || !file}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Importing…
          </>
        ) : (
          <>
            <UploadCloud className="mr-2 h-4 w-4" aria-hidden="true" /> Import CSV
          </>
        )}
      </Button>

      {result?.success && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-emerald-700">
            {result.imported} lead{result.imported === 1 ? '' : 's'} imported
            {result.duplicates ? ` · ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped` : ''}
          </p>
          {result.errors && result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-muted-foreground">
              {result.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  )
}