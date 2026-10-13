/**
 * Secret redaction for run-history snapshots (SPEC.md §3: "Redact secrets in
 * run history"). Pure string/object transformation — safe for packages/core.
 *
 * Masks any value whose object key matches a sensitive-name pattern and any
 * object that looks like an Authorization header map. Used when persisting
 * step input/output so agents never see credentials.
 */

const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy-authorization|api[-_]?key|apikey|secret|token|password|passwd|pwd|configenc|config_enc|private[-_]?key|refresh[-_]?token|access[-_]?token|client[-_]?secret|bot[-_]?token)/i

const HEADER_AUTH_KEYS = new Set(['authorization', 'proxy-authorization'])

/** Masked placeholder value for a sensitive field. */
export function maskSecretValue(): string {
  return '[REDACTED]'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

/**
 * Recursively clones `input`, masking sensitive values.
 * - Keys matching SENSITIVE_KEY_PATTERN are replaced with a marker.
 * - Map/header-style objects containing an `authorization` key have it masked.
 * - All other data passes through unchanged (JSON-safe values survive).
 */
export function redactSecrets<T>(input: T): T {
  return redactNode(input) as T
}

function redactNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item))
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      if (HEADER_AUTH_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = maskSecretValue()
      } else {
        result[key] = redactNode(val)
      }
    }
    return result
  }

  // Dates, numbers, booleans, strings, null survive as-is.
  return value
}

/** Convenience: redact then serialize (guarantees a plain JSON value). */
export function redactToJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(redactSecrets(value)))
}