'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'

/** Toggle a workflow's enabled flag — form-action, server-only. */
export async function toggleWorkflow(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return

  const workflowId = formData.get('workflowId')
  if (typeof workflowId !== 'string') return

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId: session.user.workspaceId },
  })
  if (!workflow) return

  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { enabled: !workflow.enabled },
  })

  revalidatePath('/workflows')
}