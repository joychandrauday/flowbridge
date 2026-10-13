'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Edit, Trash2, ExternalLink, Copy, MoreVertical, Code2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'

interface Form {
  id: string
  key: string
  name: string
  description: string | null
  fields: unknown
  settings: unknown
  active: boolean
  createdAt: Date | string
  updatedAt: Date | string
  _count: {
    intakeEvents: number
  }
}

interface FormsTableProps {
  forms: Form[]
}

export default function FormsTable({ forms }: FormsTableProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this form?')) return

    setDeletingId(id)
    try {
      const res = await fetch(`/api/forms/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast({ title: 'Form deleted' })
      router.refresh()
    } catch {
      toast({ title: 'Error', description: 'Failed to delete form', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (form: Form) => {
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, active: !form.active }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast({ title: form.active ? 'Form deactivated' : 'Form activated' })
      router.refresh()
    } catch {
      toast({ title: 'Error', description: 'Failed to update form', variant: 'destructive' })
    }
  }

  const copyPublicUrl = (key: string) => {
    const url = `${window.location.origin}/f/${key}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Public URL copied', description: url })
  }

  const copyEmbedSnippet = (key: string) => {
    const snippet = `<script src="${window.location.origin}/embed.js" data-form="${key}"></script>`
    navigator.clipboard.writeText(snippet)
    toast({ title: 'Embed code copied', description: 'Paste it into your site HTML.' })
  }

  if (forms.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No forms yet</p>
        <Link href="/forms/new">
          <Button>Create your first form</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead>Submissions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forms.map((form) => (
            <TableRow key={form.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{form.name}</p>
                  {form.description && (
                    <p className="text-sm text-muted-foreground">{form.description}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <code className="text-sm">{form.key}</code>
              </TableCell>
              <TableCell>{Array.isArray(form.fields) ? form.fields.length : 0}</TableCell>
              <TableCell>
                <Badge variant="secondary">{form._count.intakeEvents}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={form.active ? 'default' : 'secondary'}>
                  {form.active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/forms/${form.id}/edit`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(form)}>
                      {form.active ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyPublicUrl(form.key)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Copy Public URL
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyEmbedSnippet(form.key)}>
                      <Code2 className="mr-2 h-4 w-4" />
                      Copy Embed Code
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigator.clipboard.writeText(form.key)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Form Key
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(form.id)}
                      disabled={deletingId === form.id}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}