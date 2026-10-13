import { createHmac, timingSafeEqual } from 'crypto'

/**
 * HMAC-SHA256 verification for inbound webhooks (SPEC.md §3).
 *
 * The `X-FlowBridge-Signature` header carries either `sha256=<hex>` or a bare
 * `<hex>` digest computed over the RAW request body. Verification must happen
 * before the body is parsed.
 *
 * Pure module — no IO, no env access — so it is trivially unit-testable.
 */

export const SIGNATURE_HEADER = 'x-flowbridge-signature'

/** Hex HMAC-SHA256 of `rawBody` under `secret`. */
export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** Accept `sha256=<hex>` or bare `<hex>`; trim and lowercase. */
export function normalizeSignature(signature: string): string {
  const trimmed = signature.trim()
  const withoutPrefix = trimmed.startsWith('sha256=')
    ? trimmed.slice('sha256='.length)
    : trimmed
  return withoutPrefix.toLowerCase()
}

/**
 * Constant-time comparison. A length mismatch returns false immediately
 * (length is not secret) so `timingSafeEqual` never throws.
 */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Verify a signature header value against the raw body + secret. */
export function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false
  return safeCompare(signPayload(rawBody, secret), normalizeSignature(signature))
}
