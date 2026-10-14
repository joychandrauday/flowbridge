import { WORKFLOW_TEMPLATES } from '@flowbridge/core/templates'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Plus } from 'lucide-react'
import { createWorkflowFromTemplate } from './actions'

/**
 * "Start from a template" gallery (SPEC §10.8 / §13 Week 4). Creating a
 * workflow here uses `createWorkflowFromTemplate`, which validates the
 * template definition server-side before writing it.
 */
export function TemplateGallery() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Start from a template
        </CardTitle>
        <CardDescription>Pre-built automations you can use and tweak in the editor.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {WORKFLOW_TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="flex flex-col justify-between gap-3 rounded-md border p-4"
            >
              <div className="space-y-1">
                <p className="font-medium">{template.name}</p>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </div>
              <form action={createWorkflowFromTemplate}>
                <input type="hidden" name="templateId" value={template.id} />
                <Button type="submit" size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Use template
                </Button>
              </form>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
