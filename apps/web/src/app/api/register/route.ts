import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  workspaceName: z.string().trim().min(1).max(80).optional(),
})

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let attempt = 2
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${attempt++}`
  }
  return slug
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { name, email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const hashedPassword = await hash(password, 12)
  const workspaceSlug = await uniqueSlug(parsed.data.workspaceName || name)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email: normalizedEmail, password: hashedPassword },
    })
    const workspace = await tx.workspace.create({
      data: { name: parsed.data.workspaceName || `${name}'s Workspace`, slug: workspaceSlug },
    })
    await tx.member.create({
      data: { workspaceId: workspace.id, userId: created.id, role: 'OWNER' },
    })
    await tx.workflow.create({
      data: {
        workspaceId: workspace.id,
        name: 'Instant Lead Assignment',
        description: 'Assign new leads round-robin and notify the assignee',
        enabled: true,
        version: 1,
        definition: {
          trigger: { type: 'lead.created', config: {} },
          conditions: [],
          steps: [
            {
              id: 'step-assign',
              type: 'assign',
              config: { strategy: 'round_robin' },
              retry: { maxAttempts: 3, backoff: 'exponential' },
              onFailure: 'stop',
            },
          ],
        },
      },
    })
    return created
  })

  return NextResponse.json({ success: true, userId: user.id, workspaceSlug }, { status: 201 })
}