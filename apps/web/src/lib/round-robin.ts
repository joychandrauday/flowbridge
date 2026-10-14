import type { PrismaClient } from '@prisma/client'
import { pickRoundRobinIndex } from '@flowbridge/core/assignment'

/**
 * Shared round-robin picker (SPEC §4.3). Used by both the `assign` step and the
 * `create_task` step so a single persisted `Workflow.assignmentPointer` keeps
 * the rotation consistent across every step that distributes work.
 *
 * The pointer is incremented atomically; because `update` returns the *new*
 * value, the slot used for this pick is `newPointer - 1`.
 */
export async function nextRoundRobinMember<T extends { id: string }>(
  prisma: PrismaClient,
  workflowId: string,
  members: T[]
): Promise<T | null> {
  if (members.length === 0) return null
  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: { assignmentPointer: { increment: 1 } },
    select: { assignmentPointer: true },
  })
  const index = pickRoundRobinIndex(updated.assignmentPointer - 1, members.length)
  return index === null ? null : members[index]
}
