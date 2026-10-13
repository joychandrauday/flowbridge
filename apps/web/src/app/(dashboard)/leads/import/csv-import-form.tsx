'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import {
  parseCsv,
  normalizeHeader,
  rowsToRecords,
  guessMapping,
  type LeadFieldMapping,
} from '@/lib/csv'
import { Loader2, UploadCloud } from 'lucide-react'

const MAX_FILE_BYTES = 500_000
const PREVIEW_ROWS = 10
/** Radix Select forbids empty string values, so "not mapped" needs a sentinel. */
const NONE = '__none__'

interface ImportResult {
  success?: boolean
  total?: number
  imported?: number
  duplicates?: number
  skipped?: number
  errors?: string[]
  error?: string
}

interface Column {
  key: string
  label: string
}

const MAPPING_FIELDS: { field: keyof LeadFieldMapping; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
]

export function CsvImportForm() {
  const router = useRouter()
  const [csvText, setCsvText] = useState('')
  const [columns, setColumns] = useState<Column[]>([])
  const [records, setRecords] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<LeadFieldMapping>({})
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setCsvText('')
    setColumns([])
    setRecords([])
    setMapping({})
    setResult(null)
  }

  const handleFile = async (file: File | undefined) => {
    reset()
    if (!file) return

    if (file.size > MAX_FILE_BYTES) {
      toast({
        title: 'File too large',
        description: 'Maximum size is 500KB.',
        variant: 'destructive',
      })
      return
    }

    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      toast({
        title: 'No data rows',
        description: 'The CSV has a header but no data rows.',
        variant: 'destructive',
      })
      return
    }

    const seen = new Set<string>()
    const cols: Column[] = []
    for (const raw of rows[0]) {
      const key = normalizeHeader(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      cols.push({ key, label: raw.trim() || raw })
    }

    setCsvText(text)
    setColumns(cols)
    setRecords(rowsToRecords(rows))
    setMapping(guessMapping(rows[0]))
  }

  const setField = (field: keyof LeadFieldMapping, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value === NONE ? undefined : value }))
  }

  const hasMapping = Boolean(mapping.name || mapping.email || mapping.phone)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!csvText) {
      toast({ title: 'No file selected', description: 'Choose a CSV to import.', variant: 'destructive' })
      return
    }
    if (!hasMapping) {
      toast({
        title: 'No columns mapped',
        description: 'Map at least one of name, email or phone.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csvText, mapping }),
      })
      const data = (await response.json().catch(() => ({}))) as ImportResult
      setResult(data)
      if (!response.ok) {
        toast({
          title: 'Import failed',
          description: data.error ?? 'Something went wrong',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Import finished',
          description: `${data.imported ?? 0} imported, ${data.duplicates ?? 0} duplicate(s) skipped.`,
        })
        router.refresh()
      }
    } catch {
      toast({ title: 'Import failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV file</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
          }}
          disabled={isLoading}
        />
      </div>

      {columns.length > 0 && (
        <>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Map columns</p>
              <p className="text-sm text-muted-foreground">
                Choose which column supplies each built-in field. Unmapped columns are kept in the
                lead&apos;s custom data.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {MAPPING_FIELDS.map(({ field, label }) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`map-${field}`}>{label}</Label>
                  <Select
                    value={mapping[field] ?? NONE}
                    onValueChange={(value) => setField(field, value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id={`map-${field}`}>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not mapped</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.key} value={column.key}>
                          {column.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Preview · first {Math.min(PREVIEW_ROWS, records.length)} of {records.length} rows
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column.key} className="whitespace-nowrap">
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.slice(0, PREVIEW_ROWS).map((record, index) => (
                    <TableRow key={index}>
                      {columns.map((column) => (
                        <TableCell key={column.key} className="whitespace-nowrap">
                          {record[column.key] ?? '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      <Button type="submit" disabled={isLoading || !csvText || !hasMapping}>
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

      {result && (result.success || result.error) && (
        <div
          className={
            result.success
              ? 'rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm'
              : 'rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm'
          }
        >
          {result.success ? (
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              {result.imported} lead{result.imported === 1 ? '' : 's'} imported
              {result.duplicates
                ? ` · ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped`
                : ''}
              {result.skipped
                ? ` · ${result.skipped} empty row${result.skipped === 1 ? '' : 's'} skipped`
                : ''}
              {typeof result.total === 'number' ? ` · ${result.total} total` : ''}
            </p>
          ) : (
            <p className="font-medium text-destructive">{result.error}</p>
          )}
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
