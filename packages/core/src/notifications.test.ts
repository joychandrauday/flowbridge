import { describe, it, expect } from 'vitest'
import { buildRunFailureNotification, runUrl } from './notifications'

describe('runUrl', () => {
  it('returns a relative path without a base URL', () => {
    expect(runUrl('run_1')).toBe('/runs/run_1')
  })

  it('joins and normalizes trailing slashes on the base URL', () => {
    expect(runUrl('run_1', 'https://app.example.com')).toBe('https://app.example.com/runs/run_1')
    expect(runUrl('run_1', 'https://app.example.com/')).toBe('https://app.example.com/runs/run_1')
    expect(runUrl('run_1', 'https://app.example.com///')).toBe('https://app.example.com/runs/run_1')
  })
})

describe('buildRunFailureNotification', () => {
  it('names the workflow in the subject and includes the error and run link', () => {
    const n = buildRunFailureNotification({
      workflowName: 'Instant Lead Assignment',
      error: 'provider returned 500',
      runId: 'run_abc',
      leadName: 'Ada Lovelace',
      baseUrl: 'https://app.example.com',
    })

    expect(n.subject).toBe('Automation failed: Instant Lead Assignment')
    expect(n.body).toContain('Instant Lead Assignment')
    expect(n.body).toContain('Ada Lovelace')
    expect(n.body).toContain('provider returned 500')
    expect(n.body).toContain('https://app.example.com/runs/run_abc')
  })

  it('falls back to the lead email, then to "No lead"', () => {
    expect(
      buildRunFailureNotification({
        workflowName: 'W',
        error: 'e',
        runId: 'r',
        leadEmail: 'someone@example.com',
      }).body,
    ).toContain('Lead: someone@example.com')

    expect(
      buildRunFailureNotification({ workflowName: 'W', error: 'e', runId: 'r' }).body,
    ).toContain('Lead: No lead')
  })

  it('handles a blank error message', () => {
    expect(
      buildRunFailureNotification({ workflowName: 'W', error: '', runId: 'r' }).body,
    ).toContain('Error: Unknown error')
  })
})
