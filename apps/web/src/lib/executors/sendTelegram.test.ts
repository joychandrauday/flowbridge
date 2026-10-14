import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendTelegramExecutor } from './sendTelegram'
import type { ExecutorContext } from './types'

function makeContext(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    prisma: {
      activity: { create: vi.fn().mockResolvedValue({}) },
      member: { findUnique: vi.fn(), findFirst: vi.fn() },
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
    integrations: [
      {
        id: 'int_1',
        type: 'telegram',
        name: 'Demo Bot',
        config: { botToken: 'log-only-demo-mode', defaultChatId: '' },
      },
    ],
    ...overrides,
  }
}

describe('sendTelegramExecutor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fails when no Telegram integration is configured', async () => {
    const result = await sendTelegramExecutor.execute({ message: 'hi' }, makeContext({ integrations: [] }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No Telegram integration/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('runs in log-only demo mode for the seeded placeholder token (no network, succeeds)', async () => {
    const context = makeContext()
    const result = await sendTelegramExecutor.execute(
      { message: 'New lead: {{lead.name}}' },
      context
    )

    expect(result.success).toBe(true)
    expect(result.output).toMatchObject({ logOnly: true })
    // Never calls the real Telegram API in demo mode.
    expect(fetch).not.toHaveBeenCalled()
    expect(context.prisma.activity.create).toHaveBeenCalledOnce()
  })

  it('fails when a real token is set but no chat id resolves', async () => {
    const context = makeContext({
      integrations: [
        { id: 'int_1', type: 'telegram', name: 'Real Bot', config: { botToken: '123:real', defaultChatId: '' } },
      ],
    })
    const result = await sendTelegramExecutor.execute({ message: 'hi' }, context)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No Telegram chat ID/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the rendered message and logs an activity on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { message_id: 42 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeContext({
      integrations: [
        {
          id: 'int_1',
          type: 'telegram',
          name: 'Real Bot',
          config: { botToken: '123:real', defaultChatId: '-100123' },
        },
      ],
    })
    const result = await sendTelegramExecutor.execute(
      { message: 'New lead: {{lead.name}}', parseMode: 'Markdown' },
      context
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/bot123:real/sendMessage')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ chat_id: '-100123', text: 'New lead: Ada Lovelace', parse_mode: 'Markdown' })
    expect(context.prisma.activity.create).toHaveBeenCalledOnce()
  })

  it('returns the Telegram error detail when the API rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ description: 'chat not found' }) })
    )

    const result = await sendTelegramExecutor.execute(
      { message: 'hi' },
      makeContext({
        integrations: [
          { id: 'int_1', type: 'telegram', name: 'Real Bot', config: { botToken: '123:real', defaultChatId: '-100123' } },
        ],
      })
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('chat not found')
  })
})
