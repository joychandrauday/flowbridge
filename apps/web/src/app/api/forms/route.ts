import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createScopedClient } from '@flowbridge/db'
import { validateForm } from '@flowbridge/core'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  return NextResponse.json(forms)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.user.role || !['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Validate form data
    const validation = validateForm({
      ...body,
      workspaceId: session.user.workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const scopedPrisma = createScopedClient(session.user.workspaceId)

    // Check if key is unique within workspace
    const existing = await scopedPrisma.form.findUnique({
      where: { key: validation.key },
    })

    if (existing) {
      return NextResponse.json({ error: 'Form key already exists' }, { status: 400 })
    }

    const form = await scopedPrisma.form.create({
      data: {
        workspaceId: session.user.workspaceId,
        key: validation.key,
        name: validation.name,
        description: validation.description ?? null,
        fields: validation.fields as Prisma.InputJsonValue,
        settings: validation.settings as Prisma.InputJsonValue,
        active: validation.isActive,
      },
    })

    return NextResponse.json(form, { status: 201 })
  } catch (error) {
    console.error('Create form error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', issues: error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}