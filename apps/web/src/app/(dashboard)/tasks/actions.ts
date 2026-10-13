'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'

/** Mark a task done (open → done) — form-action, server-only. */
export async function completeTask(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return

  const taskId = formData.get('taskId')
  if (typeof taskId !== 'string') return

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: session.user.workspaceId },
  })
  if (!task) return

  const actor = await prisma.member.findFirst({
    where: { userId: session.user.id, workspaceId: session.user.workspaceId },
  })

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { status: 'DONE', completedAt: new Date() },
    }),
    ...(task.leadId
      ? [
          prisma.activity.create({
            data: {
              workspaceId: session.user.workspaceId!,
              leadId: task.leadId,
              type: 'task_done',
              body: `Task completed: ${task.title}`,
              actorId: actor?.id ?? null,
            },
          }),
        ]
      : []),
  ])

  revalidatePath('/tasks')
  if (task.leadId) revalidatePath(`/leads/${task.leadId}`)
}