'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { saveWorkflow, runWorkflowManually, testWorkflow } from './actions'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Code2,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

interface SimulationView {
  conditionsMet: boolean
  steps: { id: string; type: string; config: Record<string, unknown>; note?: string }[]
  warnings: string[]
}

type TriggerType = 'lead.created' | 'lead.status_changed' | 'lead.no_activity_for' | 'schedule' | 'manual'
type StepType =
  | 'assign'
  | 'create_task'
  | 'update_field'
  | 'send_email'
  | 'send_telegram'
  | 'send_slack'
  | 'send_discord'
  | 'http_request'
  | 'delay'

interface FieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'member'
  options?: string[]
  placeholder?: string
}

interface StepDraft {
  id: string
  type: StepType
  config: Record<string, unknown>
}

interface ConditionDraft {
  field: string
  operator: string
  value: string
}

interface DraftDefinition {
  trigger: { type: TriggerType; config: Record<string, unknown> }
  conditions: ConditionDraft[]
  steps: StepDraft[]
}

export interface WorkflowEditorProps {
  workflowId?: string
  initialName?: string
  initialDescription?: string | null
  initialDefinition?: unknown
  leads: { id: string; name: string | null; email: string | null }[]
  members: { id: string; user: { name: string | null } }[]
}

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: 'lead.created', label: 'When a lead is captured' },
  { value: 'lead.status_changed', label: 'When a lead status changes' },
  { value: 'lead.no_activity_for', label: 'When a lead goes quiet' },
  { value: 'schedule', label: 'On a schedule' },
  { value: 'manual', label: 'Run manually' },
]

const STEP_TYPES: { value: StepType; label: string }[] = [
  { value: 'assign', label: 'Assign lead' },
  { value: 'create_task', label: 'Create task' },
  { value: 'update_field', label: 'Update field' },
  { value: 'send_email', label: 'Send email' },
  { value: 'send_telegram', label: 'Send Telegram' },
  { value: 'send_slack', label: 'Send Slack' },
  { value: 'send_discord', label: 'Send Discord' },
  { value: 'http_request', label: 'HTTP request' },
  { value: 'delay', label: 'Wait', },
]

const OPERATORS = [
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
  'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty', 'regex_match',
]

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

const TRIGGER_FIELD_DEFS: Record<TriggerType, FieldDef[]> = {
  'lead.created': [],
  'lead.status_changed': [
    { name: 'from', label: 'From status', type: 'select', options: STATUSES },
    { name: 'to', label: 'To status', type: 'select', options: STATUSES },
  ],
  'lead.no_activity_for': [{ name: 'minutes', label: 'No activity for (minutes)', type: 'number', placeholder: '1440' }],
  schedule: [
    { name: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5' },
    { name: 'timezone', label: 'Timezone', type: 'text', placeholder: 'UTC' },
  ],
  manual: [],
}

const STEP_FIELD_DEFS: Record<StepType, FieldDef[]> = {
  assign: [
    { name: 'strategy', label: 'Strategy', type: 'select', options: ['round_robin', 'least_open_leads', 'rule_based', 'fixed', 'role'] },
    { name: 'assigneeId', label: 'Assignee', type: 'member' },
    { name: 'role', label: 'Role', type: 'select', options: ['OWNER', 'ADMIN', 'AGENT'] },
  ],
  create_task: [
    { name: 'title', label: 'Title (template)', type: 'text', placeholder: 'Follow up with {{lead.name}}' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'dueInMinutes', label: 'Due in (minutes)', type: 'number' },
    { name: 'assigneeStrategy', label: 'Assignee', type: 'select', options: ['lead_assignee', 'round_robin', 'least_open_leads', 'fixed', 'role'] },
    { name: 'assigneeId', label: 'Assignee (fixed)', type: 'member' },
    { name: 'role', label: 'Role', type: 'select', options: ['OWNER', 'ADMIN', 'AGENT'] },
  ],
  update_field: [
    { name: 'field', label: 'Field', type: 'text', placeholder: 'status, assigneeId, data.customField' },
    { name: 'value', label: 'Value (template)', type: 'text', placeholder: 'CONTACTED or {{lead.name}}' },
  ],
  send_email: [
    { name: 'to', label: 'To (default: lead.email)', type: 'text', placeholder: '{{lead.email}}' },
    { name: 'subject', label: 'Subject', type: 'text', placeholder: 'Thanks {{lead.name}}' },
    { name: 'text', label: 'Plain text', type: 'textarea' },
    { name: 'html', label: 'HTML', type: 'textarea' },
    { name: 'integrationName', label: 'Integration name', type: 'text', placeholder: 'email' },
  ],
  send_telegram: [
    { name: 'message', label: 'Message', type: 'textarea', placeholder: 'New lead: {{lead.name}}' },
    { name: 'chatId', label: 'Chat ID (default: integration)', type: 'text' },
    { name: 'parseMode', label: 'Parse mode', type: 'select', options: ['Markdown', 'HTML', 'MarkdownV2'] },
  ],
  send_slack: [
    { name: 'message', label: 'Message', type: 'textarea', placeholder: 'New lead: {{lead.name}}' },
    { name: 'channel', label: 'Channel (default: integration)', type: 'text' },
  ],
  send_discord: [
    { name: 'message', label: 'Message', type: 'textarea', placeholder: 'New lead: {{lead.name}}' },
    { name: 'username', label: 'Display name (optional)', type: 'text', placeholder: 'FlowBridge' },
  ],
  http_request: [
    { name: 'url', label: 'URL', type: 'text', placeholder: 'https://api.acme.com/hook' },
    { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    { name: 'body', label: 'Body (JSON or template)', type: 'textarea' },
  ],
  delay: [{ name: 'minutes', label: 'Wait minutes', type: 'number', placeholder: '60' }],
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `step-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function defaultTriggerConfig(type: TriggerType): Record<string, unknown> {
  switch (type) {
    case 'lead.no_activity_for':
      return { minutes: 1440 }
    case 'schedule':
      return { cron: '0 9 * * 1-5', timezone: 'UTC' }
    default:
      return {}
  }
}

function defaultStepConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case 'assign':
      return { strategy: 'round_robin' }
    case 'create_task':
      return { title: 'Follow up with {{lead.name}}', assigneeStrategy: 'lead_assignee' }
    case 'update_field':
      return { field: 'status', value: 'CONTACTED' }
    case 'send_email':
      return { subject: 'Thanks {{lead.name}}' }
    case 'send_telegram':
      return { message: 'New lead: {{lead.name}}', parseMode: 'Markdown' }
    case 'send_slack':
      return { message: 'New lead: {{lead.name}}' }
    case 'send_discord':
      return { message: 'New lead: {{lead.name}}' }
    case 'http_request':
      return { url: '', method: 'POST' }
    case 'delay':
      return { minutes: 60 }
  }
}

function coerceDefinition(raw: unknown): DraftDefinition {
  const def = (raw ?? {}) as Record<string, unknown>
  const trigger = (def.trigger ?? {}) as Record<string, unknown>
  const triggerType = (TRIGGER_TYPES.some((t) => t.value === trigger.type) ? trigger.type : 'lead.created') as TriggerType
  const triggerConfig = (trigger.config ?? {}) as Record<string, unknown>
  const conditions = Array.isArray(def.conditions) ? (def.conditions as Record<string, unknown>[]) : []
  const steps = Array.isArray(def.steps) ? (def.steps as Record<string, unknown>[]) : []

  return {
    trigger: { type: triggerType, config: { ...defaultTriggerConfig(triggerType), ...triggerConfig } },
    conditions: conditions.map((condition) => ({
      field: String(condition.field ?? 'status'),
      operator: String(condition.operator ?? 'equals'),
      value: condition.value === undefined || condition.value === null ? '' : String(condition.value),
    })),
    steps: steps.map((step) => ({
      id: String(step.id ?? newId()),
      type: (STEP_TYPES.some((s) => s.value === step.type) ? step.type : 'create_task') as StepType,
      config: (step.config ?? {}) as Record<string, unknown>,
    })),
  }
}

export function WorkflowEditor({ workflowId, initialName, initialDescription, initialDefinition, leads, members }: WorkflowEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(initialName ?? '')
  const [description, setDescription] = useState(initialDescription ?? '')
  const [def, setDef] = useState<DraftDefinition>(() => coerceDefinition(initialDefinition))
  const [showPreview, setShowPreview] = useState(false)
  const [runLeadId, setRunLeadId] = useState(leads[0]?.id ?? '')
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(workflowId ?? null)
  const [simLeadId, setSimLeadId] = useState(leads[0]?.id ?? '')
  const [simulation, setSimulation] = useState<SimulationView | null>(null)
  const [simDialogOpen, setSimDialogOpen] = useState(false)

  const previewJson = useMemo(
    () =>
      JSON.stringify(
        { trigger: { type: def.trigger.type, config: def.trigger.config }, conditions: def.conditions, steps: def.steps },
        null,
        2
      ),
    [def]
  )

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setDef((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }))
  }

  const updateStepConfig = (index: number, key: string, value: string) => {
    const step = def.steps[index]
    const isNumber = step.type === 'delay' || key === 'dueInMinutes'
    setDef((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) =>
        i === index
          ? {
              ...s,
              config: {
                ...s.config,
                [key]: isNumber && value === '' ? undefined : isNumber ? Number(value) : value,
              },
            }
          : s
      ),
    }))
  }

  const addStep = (afterIndex?: number) => {
    const step: StepDraft = { id: newId(), type: 'create_task', config: defaultStepConfig('create_task') }
    setDef((prev) => {
      const steps = [...prev.steps]
      const at = afterIndex === undefined ? steps.length : afterIndex + 1
      steps.splice(at, 0, step)
      return { ...prev, steps }
    })
  }

  const removeStep = (index: number) => {
    setDef((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    setDef((prev) => {
      const steps = [...prev.steps]
      const target = index + direction
      if (target < 0 || target >= steps.length) return prev
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...prev, steps }
    })
  }

  const addCondition = () => {
    setDef((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'lead.status', operator: 'equals', value: 'NEW' }],
    }))
  }

  const updateCondition = (index: number, patch: Partial<ConditionDraft>) => {
    setDef((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))
  }

  const removeCondition = (index: number) => {
    setDef((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }))
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give the workflow a name before saving.', variant: 'destructive' })
      return
    }
    if (def.steps.length === 0) {
      toast({ title: 'No steps', description: 'Add at least one action step.', variant: 'destructive' })
      return
    }
    startTransition(async () => {
      const result = await saveWorkflow({
        id: savedId,
        name: name.trim(),
        description: description.trim() || undefined,
        definition: {
          trigger: { type: def.trigger.type, config: def.trigger.config },
          conditions: def.conditions,
          steps: def.steps,
        },
      })
      if (result?.ok) {
        toast({ title: 'Saved', description: `Version v${result.version} is live for new runs.` })
        setSavedId(result.id ?? null)
        router.push(`/workflows/${result.id}/edit`)
        router.refresh()
      } else {
        toast({ title: 'Save failed', description: result?.error ?? 'Try again', variant: 'destructive' })
      }
    })
  }

  const handleRun = () => {
    if (!savedId || !runLeadId) return
    startTransition(async () => {
      const result = await runWorkflowManually(savedId, runLeadId)
      setRunDialogOpen(false)
      if (result?.ok) {
        toast({ title: 'Run started', description: 'The run is queued and will process on the next tick.' })
        router.refresh()
      } else {
        toast({ title: 'Run failed', description: result?.error ?? 'Try again', variant: 'destructive' })
      }
    })
  }

  const handleDryRun = () => {
    startTransition(async () => {
      const result = await testWorkflow({
        definition: {
          trigger: { type: def.trigger.type, config: def.trigger.config },
          conditions: def.conditions,
          steps: def.steps,
        },
        leadId: simLeadId || null,
      })
      if (result.ok) {
        setSimulation(result.result)
        setSimDialogOpen(true)
      } else {
        toast({ title: 'Dry run failed', description: result.error, variant: 'destructive' })
      }
    })
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.user.name ?? null

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{workflowId ? 'Edit workflow' : 'New workflow'}</h1>
          <p className="text-muted-foreground">Trigger → conditions → actions. Changes apply to new runs only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setShowPreview((v) => !v)}>
            <Code2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {showPreview ? 'Hide JSON' : 'JSON preview'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!savedId) {
                toast({ title: 'Save first', description: 'Save the workflow before running it.', variant: 'destructive' })
                return
              }
              setRunDialogOpen(true)
            }}
          >
            <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Run on lead…
          </Button>
          <Button type="button" variant="outline" onClick={handleDryRun} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Dry run
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      {/* JSON preview drawer */}
      {showPreview && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg border-l bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-medium">Definition preview</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview(false)} aria-label="Close preview">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <pre className="h-[calc(100vh-57px)] overflow-auto p-4 text-xs leading-relaxed">{previewJson}</pre>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workflow-name">Name</Label>
            <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Instant lead assignment" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workflow-description">Description</Label>
            <Input id="workflow-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — what does this automate?" />
          </div>
        </CardContent>
      </Card>

      {/* Trigger */}
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <CardTitle>Trigger</CardTitle>
          </div>
          <CardDescription>What starts this workflow?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="trigger-type">Event</Label>
            <select
              id="trigger-type"
              value={def.trigger.type}
              onChange={(e) => {
                const type = e.target.value as TriggerType
                setDef((prev) => ({ ...prev, trigger: { type, config: defaultTriggerConfig(type) } }))
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-80"
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {TRIGGER_FIELD_DEFS[def.trigger.type].map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`trigger-${field.name}`}>{field.label}</Label>
              <Input
                id={`trigger-${field.name}`}
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={String(def.trigger.config[field.name] ?? '')}
                onChange={(e) =>
                  setDef((prev) => ({
                    ...prev,
                    trigger: {
                      ...prev.trigger,
                      config: {
                        ...prev.trigger.config,
                        [field.name]: field.type === 'number' && e.target.value === '' ? undefined : field.type === 'number' ? Number(e.target.value) : e.target.value,
                      },
                    },
                  }))
                }
                className="md:w-80"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
            <CardTitle>Conditions</CardTitle>
          </div>
          <CardDescription>Optional — only run the actions when these all match (AND).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Suggest the allowlisted field paths so a condition can never be
              authored against a name the evaluator cannot resolve (which would
              silently disable the workflow). */}
          <datalist id="condition-field-suggestions">
            <option value="lead.status" />
            <option value="lead.source" />
            <option value="lead.email" />
            <option value="lead.phone" />
            <option value="lead.name" />
            <option value="lead.data.company" />
            <option value="assignee.name" />
            <option value="workspace.name" />
          </datalist>
          {def.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conditions — the actions run for every matching lead.</p>
          ) : (
            def.conditions.map((condition, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Field</Label>
                  <Input
                    list="condition-field-suggestions"
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value })}
                    className="w-44"
                    placeholder="lead.status"
                    aria-label="Condition field"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Operator</Label>
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, { operator: e.target.value })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    className="w-40"
                    placeholder="NEW"
                  />
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeCondition(index)} aria-label="Remove condition">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
          <Button type="button" size="sm" variant="outline" onClick={addCondition}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add condition
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            <CardTitle>Actions</CardTitle>
          </div>
          <CardDescription>Steps run top to bottom. Delay steps pause for ~N minutes (tick cadence).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {def.steps.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Start with: Instant lead assignment.</p>
            </div>
          ) : (
            def.steps.map((step, index) => (
              <div key={step.id} className="space-y-3">
                {index > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    + then
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="rounded-md border px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">Step {index + 1}</p>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="ghost" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label="Move up">
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={index === def.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label="Move down">
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(index)} aria-label="Remove step">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <select
                        value={step.type}
                        onChange={(e) => {
                          const type = e.target.value as StepType
                          updateStep(index, { type, config: defaultStepConfig(type) })
                        }}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-80"
                      >
                        {STEP_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    {STEP_FIELD_DEFS[step.type]
                      .filter((field) => {
                        if (field.name === 'assigneeId') return step.config.strategy === 'fixed'
                        if (field.name === 'role') return step.config.strategy === 'role' || step.config.assigneeStrategy === 'role'
                        return true
                      })
                      .map((field) => (
                        <div key={field.name} className="space-y-1.5">
                          <Label htmlFor={`${step.id}-${field.name}`}>{field.label}</Label>
                          {field.type === 'select' ? (
                            <select
                              id={`${step.id}-${field.name}`}
                              value={String(step.config[field.name] ?? '')}
                              onChange={(e) => updateStepConfig(index, field.name, e.target.value)}
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-80"
                            >
                              <option value="">—</option>
                              {field.options?.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : field.type === 'member' ? (
                            <select
                              id={`${step.id}-${field.name}`}
                              value={String(step.config[field.name] ?? '')}
                              onChange={(e) => updateStepConfig(index, field.name, e.target.value)}
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-80"
                            >
                              <option value="">—</option>
                              {members.map((member) => (
                                <option key={member.id} value={member.id}>{member.user.name ?? 'Unnamed'}</option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <Textarea
                              id={`${step.id}-${field.name}`}
                              rows={2}
                              placeholder={field.placeholder}
                              value={String(step.config[field.name] ?? '')}
                              onChange={(e) => updateStepConfig(index, field.name, e.target.value)}
                              className="md:w-96"
                            />
                          ) : (
                            <Input
                              id={`${step.id}-${field.name}`}
                              type={field.type === 'number' ? 'number' : 'text'}
                              placeholder={field.placeholder}
                              value={String(step.config[field.name] ?? '')}
                              onChange={(e) => updateStepConfig(index, field.name, e.target.value)}
                              className="md:w-80"
                            />
                          )}
                        </div>
                      ))}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">retry: max 3 · exponential</Badge>
                      <Badge variant="outline" className="text-xs">on failure: stop</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => addStep()}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add step
          </Button>
        </CardContent>
      </Card>

      {/* Run-on-lead dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run on a lead</DialogTitle>
            <DialogDescription>
              Executes the workflow now for this lead and records it in run history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="run-lead">Lead</Label>
            <select
              id="run-lead"
              value={runLeadId}
              onChange={(e) => setRunLeadId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {leads.length === 0 && <option value="">No leads yet — create one first</option>}
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.name || lead.email || 'Unnamed lead'}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRunDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleRun} disabled={isPending || !savedId || !runLeadId || leads.length === 0}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Run now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dry-run dialog */}
      <Dialog open={simDialogOpen} onOpenChange={setSimDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dry run</DialogTitle>
            <DialogDescription>
              What this workflow would do for the selected lead. No emails, messages, or writes happen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sim-lead">Run against</Label>
              <select
                id="sim-lead"
                value={simLeadId}
                onChange={(e) => setSimLeadId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {leads.length === 0 && <option value="">Sample lead (no leads yet)</option>}
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                    {lead.email ? ` · ${lead.email}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {simulation && (
              <div className="space-y-2">
                <div
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    simulation.conditionsMet
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-amber-500/40 bg-amber-500/10'
                  }`}
                >
                  {simulation.conditionsMet ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  )}
                  {simulation.conditionsMet
                    ? 'Conditions pass — every step below would run.'
                    : 'Conditions do not pass — the run would stop before any step.'}
                </div>

                <ol className="space-y-2">
                  {simulation.steps.map((step, index) => (
                    <li key={step.id} className="rounded-md border px-3 py-2">
                      <p className="text-sm font-medium">
                        {index + 1}. {step.type.replace(/_/g, ' ')}
                      </p>
                      {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">
                        {JSON.stringify(step.config, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ol>

                {simulation.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs font-medium">Warnings</p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                      {simulation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSimDialogOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleDryRun} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Run again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Template variables: <code className="rounded bg-muted px-1">{"{{lead.name}}"}</code>,{' '}
        <code className="rounded bg-muted px-1">{"{{lead.email}}"}</code>,{' '}
        <code className="rounded bg-muted px-1">{"{{assignee.name}}"}</code>,{' '}
        <code className="rounded bg-muted px-1">{"{{workspace.name}}"}</code> · member names:
        {memberName(members[0]?.id ?? '') ? ` ${members.map((m) => m.user.name).join(', ')}` : ' none yet'}
      </p>
    </div>
  )
}