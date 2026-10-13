import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createScopedClient } from '@flowbridge/db'
import { validateForm, type Form } from '@flowbridge/core'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

async function getScopedPrisma() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    throw new Error('Unauthorized')
  }
  return createScopedClient(session.user.workspaceId!)
}

async function requireAuth(allowedRoles?: string[]) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    throw new Error('Unauthorized')
  }
  if (allowedRoles && (!session.user.role || !allowedRoles.includes(session.user.role))) {
    throw new Error('Forbidden')
  }
  return session
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scopedPrisma = await getScopedPrisma()
    const { id: formId } = await params
    if (!formId) return NextResponse.json({ error: 'Form ID required' }, { status: 400 })

    const form = await scopedPrisma.form.findUnique({
      where: { id: formId },
    })

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    return NextResponse.json(form)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Get form error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(['OWNER', 'ADMIN'])
    const scopedPrisma = createScopedClient(session.user.workspaceId!)
    const { id: formId } = await params
    if (!formId) return NextResponse.json({ error: 'Form ID required' }, { status: 400 })
    const body = await request.json()

    // Check form exists and belongs to workspace
    const existing = await scopedPrisma.form.findUnique({
      where: { id: formId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Validate form data
    const validation = validateForm({
      ...body,
      id: formId,
      workspaceId: session.user.workspaceId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    })

    // Check key uniqueness if changed
    if (validation.key !== existing.key) {
      const keyConflict = await scopedPrisma.form.findUnique({
        where: { key: validation.key },
      })
      if (keyConflict) {
        return NextResponse.json({ error: 'Form key already exists' }, { status: 400 })
      }
    }

    const form = await scopedPrisma.form.update({
      where: { id: formId },
      data: {
        key: validation.key,
        name: validation.name,
        description: validation.description ?? null,
        fields: validation.fields as Prisma.InputJsonValue,
        settings: validation.settings as Prisma.InputJsonValue,
        active: validation.isActive,
      },
    })

    return NextResponse.json(form)
  } catch (error) {
    console.error('Update form error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', issues: error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(['OWNER', 'ADMIN'])
    const scopedPrisma = createScopedClient(session.user.workspaceId!)
    const { id: formId } = await params
    if (!formId) return NextResponse.json({ error: 'Form ID required' }, { status: 400 })

    const existing = await scopedPrisma.form.findUnique({
      where: { id: formId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    await scopedPrisma.form.delete({
      where: { id: formId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete form error:', error)
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}