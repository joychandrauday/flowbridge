/**
 * Assignment helpers (SPEC §4.3). Pure, no IO — the persistence of the
 * round-robin cursor lives on `Workflow.assignmentPointer`; these functions
 * only turn that cursor + a member list into a choice, so the rotation logic
 * is unit-testable independently of the database.
 */

/**
 * Resolve a round-robin pick from a persisted cursor.
 *
 * `pointer` is the value stored on the workflow *before* this assignment; the
 * caller is responsible for incrementing it. A pointer of 0 selects the first
 * member, so the very first lead is not skipped.
 *
 * Returns `null` when there are no members — callers must surface that as a
 * failed step rather than silently assigning nobody.
 */
export function pickRoundRobinIndex(pointer: number, memberCount: number): number | null {
  if (!Number.isFinite(memberCount) || memberCount <= 0) return null
  const safePointer = Number.isFinite(pointer) && pointer >= 0 ? Math.floor(pointer) : 0
  return ((safePointer % memberCount) + memberCount) % memberCount
}
