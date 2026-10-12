'use client'

import { useState, useCallback } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd'
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Eye,
  Settings,
  ChevronDown,
  ChevronUp,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Field types
const FIELD_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Select Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'hidden', label: 'Hidden Field' },
] as const

// Validation schema for form settings
const FormSettingsSchema = z.object({
  honeypotField: z.string().default('website'),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxSubmissions: z.number().int().positive().default(10),
    windowMinutes: z.number().int().positive().default(60),
  }).default({}),
  successMessage: z.string().default('Thank you for your submission!'),
  redirectUrl: z.string().url().optional().or(z.literal('')),
  notifyOnSubmit: z.boolean().default(false),
  notificationEmails: z.array(z.string().email()).optional(),
})

// Field schema
const FieldSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'hidden']),
  label: z.string().min(1, 'Label is required'),
  name: z.string().min(1, 'Name is required').regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Name must start with letter and contain only letters, numbers, underscores'),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
  defaultValue: z.unknown().optional(),
  validation: z.object({
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
  }).optional(),
})

const FormSchema = z.object({
  name: z.string().min(1, 'Form name is required'),
  key: z.string().min(1, 'Form key is required').regex(/^[a-z0-9-]+$/, 'Key must be lowercase letters, numbers, and hyphens only'),
  description: z.string().optional(),
  fields: z.array(FieldSchema).min(1, 'At least one field is required'),
  settings: FormSettingsSchema,
  isActive: z.boolean().default(true),
})

export type FormData = z.infer<typeof FormSchema>
export type FieldData = z.infer<typeof FieldSchema>
export type FormSettings = z.infer<typeof FormSettingsSchema>

interface FormBuilderProps {
  onSubmit: (data: FormData) => Promise<void>
  isSubmitting: boolean
  initialData?: Partial<FormData>
}

export function FormBuilder({ onSubmit, isSubmitting, initialData }: FormBuilderProps) {
  const [activeTab, setActiveTab] = useState<'fields' | 'settings'>('fields')

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      key: '',
      description: '',
      fields: [
        { id: crypto.randomUUID(), type: 'text', label: 'Name', name: 'name', required: true, placeholder: 'John Doe' },
        { id: crypto.randomUUID(), type: 'email', label: 'Email', name: 'email', required: true, placeholder: 'john@example.com' },
      ],
      settings: {
        honeypotField: 'website',
        rateLimit: { enabled: true, maxSubmissions: 10, windowMinutes: 60 },
        successMessage: 'Thank you for your submission!',
        redirectUrl: '',
        notifyOnSubmit: false,
        notificationEmails: [],
      },
      isActive: true,
      ...initialData,
    },
  })

  const { fields, append, remove, move, swap } = useFieldArray({
    control,
    name: 'fields',
  })

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return
    move(result.source.index, result.destination.index)
  }, [move])

  const addField = (type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'hidden') => {
    const baseName = type
    let name: string = baseName
    let counter = 1
    while (fields.some(f => f.name === name)) {
      name = `${baseName}_${counter}`
      counter++
    }

    append({
      id: crypto.randomUUID(),
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      name,
      required: false,
      placeholder: '',
      options: type === 'select' ? [{ value: '', label: '' }] : undefined,
    })
  }

  const renderFieldEditor = (field: FieldData, index: number) => {
    const fieldErrors = errors.fields?.[index]

    return (
      <Draggable draggableId={field.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={cn(
              'border rounded-lg p-4 bg-background transition-shadow',
              snapshot.isDragging && 'shadow-lg ring-2 ring-primary'
            )}
          >
            <div className="flex items-start gap-4">
              <div
                {...provided.dragHandleProps}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
              >
                <GripVertical className="h-5 w-5" />
              </div>

              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Label</Label>
<Controller
                        name={`fields.${index}.label`}
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder="Field label"
                            className={fieldErrors?.label ? 'border-red-500' : ''}
                          />
                        )}
                      />
                  </div>
                  <div>
                    <Label>Name (machine readable)</Label>
<Controller
                        name={`fields.${index}.name`}
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder="field_name"
                            className={fieldErrors?.name ? 'border-red-500' : ''}
                          />
                        )}
                      />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Controller
                      name={`fields.${index}.type`}
                      control={control}
                      render={({ field }) => (
                        <Select
                          {...field}
                          onValueChange={(value) => {
                            field.onChange(value)
                            // Reset type-specific fields
                            if (value !== 'select') {
                              setValue(`fields.${index}.options`, undefined)
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="flex items-end">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Controller
                        name={`fields.${index}.required`}
                        control={control}
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                      <span>Required</span>
                    </Label>
                  </div>
                </div>

                <div>
                  <Label>Placeholder</Label>
                  <Controller
                    name={`fields.${index}.placeholder`}
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="Placeholder text" />
                    )}
                  />
                </div>

                {field.type === 'select' && (
                  <div className="space-y-2">
                    <Label>Options</Label>
                    <Controller
                      name={`fields.${index}.options`}
                      control={control}
                      render={({ field: optionsField }) => (
                        <div>
                          {optionsField.value?.map((opt: { value: string; label: string }, optIndex: number) => (
                            <div key={optIndex} className="flex gap-2">
                              <Input
                                placeholder="Value"
                                value={opt.value}
                                onChange={(e) => {
                                  const newOpts = [...(optionsField.value || [])]
                                  newOpts[optIndex] = { ...newOpts[optIndex], value: e.target.value }
                                  optionsField.onChange(newOpts)
                                }}
                              />
                              <Input
                                placeholder="Label"
                                value={opt.label}
                                onChange={(e) => {
                                  const newOpts = [...(optionsField.value || [])]
                                  newOpts[optIndex] = { ...newOpts[optIndex], label: e.target.value }
                                  optionsField.onChange(newOpts)
                                }}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newOpts = [...(optionsField.value || [])]
                                  newOpts.splice(optIndex, 1)
                                  optionsField.onChange(newOpts)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newOpts = [...(optionsField.value || []), { value: '', label: '' }]
                              optionsField.onChange(newOpts)
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Option
                          </Button>
                        </div>
                      )}
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Draggable>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'fields' | 'settings')} className="w-full">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="fields">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-3"
                >
                  {fields.map(renderFieldEditor)}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {FIELD_TYPES.map((type) => (
              <Button
                key={type.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addField(type.value as 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'hidden')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add {type.label}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Honeypot Field Name</Label>
                <Controller
                  name="settings.honeypotField"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} placeholder="website" />
                  )}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Hidden field name to catch bots. Leave as default unless you have a field named "website".
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Success Message</Label>
                  <Controller
                    name="settings.successMessage"
                    control={control}
                    render={({ field }) => (
                      <Textarea {...field} rows={2} placeholder="Thank you for your submission!" />
                    )}
                  />
                </div>
                <div>
                  <Label>Redirect URL (optional)</Label>
                  <Controller
                    name="settings.redirectUrl"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="https://example.com/thank-you" />
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Controller
                  name="settings.rateLimit.enabled"
                  control={control}
                  render={({ field }) => (
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                      <span>Enable rate limiting</span>
                    </Label>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Max Submissions</Label>
                  <Controller
                    name="settings.rateLimit.maxSubmissions"
                    control={control}
                    render={({ field }) => (
                      <Input
                        type="number"
                        {...field}
                        min={1}
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    )}
                  />
                </div>
                <div>
                  <Label>Window (minutes)</Label>
                  <Controller
                    name="settings.rateLimit.windowMinutes"
                    control={control}
                    render={({ field }) => (
                      <Input
                        type="number"
                        {...field}
                        min={1}
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Controller
                  name="settings.notifyOnSubmit"
                  control={control}
                  render={({ field }) => (
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                      <span>Send email notification on submit</span>
                    </Label>
                  )}
                />
              </div>

              <Controller
                name="settings.notificationEmails"
                control={control}
                render={({ field }) => (
                  <div>
                    <Label>Notification Emails (comma separated)</Label>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="admin@example.com, manager@example.com"
                      value={field.value?.join(', ') || ''}
                      onChange={(e) => {
                        const emails = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                        field.onChange(emails)
                      }}
                    />
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-4 pt-6 border-t">
        <div className="flex-1">
          <h3 className="font-medium">Form Settings</h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Label className="flex items-center gap-2 cursor-pointer">
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
              Active
            </Label>
          </div>
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {isSubmitting ? 'Saving...' : 'Save Form'}
        </Button>
      </div>
    </form>
  )
}