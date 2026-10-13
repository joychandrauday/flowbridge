import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const OnboardingSchema = z.object({
  workspaceName: z.string().trim().min(1).max(80),
})

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace'
  )
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
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = OnboardingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'A workspace name is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Idempotent: if the user already belongs to a workspace, return it as-is.
  const existing = await prisma.member.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  })
  if (existing) {
    return NextResponse.json({
      success: true,
      workspaceId: existing.workspaceId,
      slug: existing.workspace.slug,
    })
  }

  const workspaceSlug = await uniqueSlug(parsed.data.workspaceName)

  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: { name: parsed.data.workspaceName, slug: workspaceSlug },
    })
    await tx.member.create({
      data: { workspaceId: created.id, userId: user.id, role: 'OWNER' },
    })
    await tx.workflow.create({
      data: {
        workspaceId: created.id,
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

  return NextResponse.json({ success: true, workspaceId: workspace.id, slug: workspace.slug }, { status: 201 })
}