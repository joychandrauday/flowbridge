/**
 * Failure-notification content (SPEC §13.10, AGENTS §10).
 *
 * "Never silently swallow a failed automation." When a run exhausts its retries
 * and is marked `FAILED`, the engine notifies the workspace Owner. This module is
 * pure so the message format is unit-tested; the engine owns the IO.
 */

export interface RunFailureContext {
  workflowName: string
  error: string
  runId: string
  leadName?: string | null
  leadEmail?: string | null
  /** Absolute app origin, e.g. `https://app.example.com`. Optional. */
  baseUrl?: string
}

export interface RunFailureNotification {
  subject: string
  body: string
}

export function runUrl(runId: string, baseUrl?: string): string {
  if (!baseUrl) return `/runs/${runId}`
  return `${baseUrl.replace(/\/+$/, '')}/runs/${runId}`
}

/** Build the subject + plain-text body sent to Owners when a run fails. */
export function buildRunFailureNotification(ctx: RunFailureContext): RunFailureNotification {
  const lead = ctx.leadName?.trim() || ctx.leadEmail?.trim() || 'No lead'
  return {
    subject: `Automation failed: ${ctx.workflowName}`,
    body: [
      'A workflow run failed and needs attention.',
      '',
      `Workflow: ${ctx.workflowName}`,
      `Lead: ${lead}`,
      `Error: ${ctx.error || 'Unknown error'}`,
      '',
      `Open the run: ${runUrl(ctx.runId, ctx.baseUrl)}`,
    ].join('\n'),
  }
}
