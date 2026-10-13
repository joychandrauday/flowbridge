import { StepExecutor, StepResult, leadTemplate } from './types'
import { renderTemplateValue } from '@flowbridge/core/engine/evaluator'
import { isBlockedAddress, isBlockedHostname } from '@flowbridge/core'

/**
 * Resolves a URL's host and rejects anything that could reach the host's
 * internal network (SSRF guard, SPEC §3). Re-run for every redirect hop.
 */
async function resolveAndValidateHost(url: string): Promise<string> {
  const parsed = new URL(url)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${parsed.protocol}`)
  }

  const hostname = parsed.hostname
  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked host: ${hostname}`)
  }

  const { lookup } = await import('dns/promises')
  const result = await lookup(hostname, { all: true })

  for (const entry of result) {
    if (isBlockedAddress(entry.address)) {
      throw new Error(`Blocked private/reserved address: ${entry.address}`)
    }
  }

  return hostname
}

export const httpRequestExecutor: StepExecutor = {
  type: 'http_request',
  async execute(config, context): Promise<StepResult> {
    const { workspace } = context
    const {
      url,
      method = 'POST',
      headers = {},
      body,
      timeoutMs = 10000,
      followRedirects = true,
      maxRedirects = 5,
      responseSizeLimitBytes = 1048576,
      successCodes = [200, 201, 202, 204],
    } = config as {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: unknown
      timeoutMs?: number
      followRedirects?: boolean
      maxRedirects?: number
      responseSizeLimitBytes?: number
      successCodes?: number[]
    }

    await resolveAndValidateHost(url)

    let renderedBody = body
    if (typeof body === 'string') {
      const templateContext = {
        lead: leadTemplate(context.lead),
        assignee: context.assignee
          ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
          : undefined,
        workspace,
        trigger: { type: 'workflow', config: {} },
        now: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      }
      renderedBody = renderTemplateValue(body, templateContext)
    }

    const renderedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      renderedHeaders[key] = renderTemplateValue(value, {
        lead: leadTemplate(context.lead),
        assignee: context.assignee
          ? { id: context.assignee.id, name: context.assignee.user.name, email: context.assignee.user.email }
          : undefined,
        workspace,
        trigger: { type: 'workflow', config: {} },
        now: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let redirectCount = 0
    let currentUrl = url

    try {
      while (redirectCount <= maxRedirects) {
        await resolveAndValidateHost(currentUrl)

        const response = await fetch(currentUrl, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'FlowBridge/1.0',
            ...renderedHeaders,
          },
          body: renderedBody ? JSON.stringify(renderedBody) : undefined,
          signal: controller.signal,
          redirect: followRedirects ? 'manual' : 'error',
        })

        clearTimeout(timeout)

        const contentLength = response.headers.get('content-length')
        if (contentLength && parseInt(contentLength) > responseSizeLimitBytes) {
          return { success: false, error: `Response size exceeds limit (${responseSizeLimitBytes} bytes)` }
        }

        const reader = response.body?.getReader()
        let responseText = ''
        let totalBytes = 0

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            totalBytes += value.length
            if (totalBytes > responseSizeLimitBytes) {
              return { success: false, error: `Response size exceeds limit (${responseSizeLimitBytes} bytes)` }
            }
            responseText += new TextDecoder().decode(value)
          }
        } else {
          responseText = await response.text()
        }

        if (followRedirects && [301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location')
          if (!location) break
          currentUrl = new URL(location, currentUrl).toString()
          redirectCount++
          continue
        }

        let responseData: unknown
        try {
          responseData = JSON.parse(responseText)
        } catch {
          responseData = responseText
        }

        const success = successCodes.includes(response.status)

        return {
          success,
          output: { status: response.status, data: responseData },
          error: success ? undefined : `HTTP ${response.status}: ${responseText}`,
        }
      }

      return { success: false, error: 'Max redirects exceeded' }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' }
      }
      return { success: false, error: error instanceof Error ? error.message : 'Request failed' }
    }
  },
}