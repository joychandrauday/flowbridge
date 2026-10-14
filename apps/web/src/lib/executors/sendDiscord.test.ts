import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendDiscordExecutor } from './sendDiscord'
import type { ExecutorContext } from './types'

function makeContext(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    prisma: {
      activity: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as ExecutorContext['prisma'],
    lead: {
      id: 'lead_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      data: {},
      assigneeId: null,
    } as unknown as ExecutorContext['lead'],
    workflowRun: {} as unknown as ExecutorContext['workflowRun'],
    workspace: { id: 'ws_1', name: 'Demo', slug: 'demo' } as unknown as ExecutorContext['workspace'],
    integrations: [{ id: 'int_1', type: 'discord', name: 'discord', config: { webhookUrl: 'https://discord.com/api/webhooks/1/abc' } }],
    ...overrides,
  }
}

describe('sendDiscordExecutor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fails when no Discord integration is configured', async () => {
    const result = await sendDiscordExecutor.execute(
      { message: 'hi' },
      makeContext({ integrations: [] })
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No Discord integration/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a webhook URL that is not on discord.com (SSRF guard)', async () => {
    const context = makeContext({
      integrations: [
        { id: 'int_1', type: 'discord', name: 'discord', config: { webhookUrl: 'https://169.254.169.254/latest/meta-data' } },
      ],
    })
    const result = await sendDiscordExecutor.execute({ message: 'hi' }, context)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/discord\.com/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the rendered message and logs an activity on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeContext()
    const result = await sendDiscordExecutor.execute(
      { message: 'New lead: {{lead.name}}', username: 'FlowBridge' },
      context
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/webhooks/1/abc')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ content: 'New lead: Ada Lovelace', username: 'FlowBridge' })
    expect(context.prisma.activity.create).toHaveBeenCalledOnce()
  })

  it('returns the Discord error detail when the webhook rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Unknown Webhook' })
    )

    const result = await sendDiscordExecutor.execute({ message: 'hi' }, makeContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('404')
    expect(result.error).toContain('Unknown Webhook')
  })
})
