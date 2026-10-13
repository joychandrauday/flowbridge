/**
 * SSRF address guard for the HTTP-request action (SPEC §3, AGENTS §3).
 *
 * Blocks loopback, link-local, private, CGNAT, multicast, reserved and
 * cloud-metadata addresses so a workflow step cannot be used to probe the
 * host's internal network. Pure module — the caller performs DNS resolution
 * and re-validates after every redirect hop.
 */

/** True for IPv4 addresses that must not be reachable from a workflow step. */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return false
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false

  const [a, b] = nums
  if (a === 0) return true // 0.0.0.0/8 — "this network" (routes to localhost on some hosts)
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a >= 224) return true // multicast (224/4) + reserved (240/4)
  return false
}

/** True for IPv6 addresses that must not be reachable from a workflow step. */
export function isPrivateIpv6(ip: string): boolean {
  const addr = ip
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split('%')[0] // strip zone id
  if (!addr.includes(':')) return false

  if (addr === '::' || addr === '::1') return true // unspecified + loopback
  // fe80::/10 link-local
  if (/^fe[89ab]/.test(addr)) return true
  // fc00::/7 unique-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true
  // ::ffff:0:0/96 IPv4-mapped
  if (addr.startsWith('::ffff:')) return isPrivateIpv4(addr.slice('::ffff:'.length))
  if (addr.startsWith('64:ff9b:')) return true // NAT64
  if (addr.startsWith('2002:')) return true // 6to4
  return false
}

/** True when an IP literal (v4 or v6, with or without brackets) is blocked. */
export function isBlockedAddress(ip: string): boolean {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip)
}

/**
 * True when a URL hostname must be rejected outright — loopback names, common
 * internal suffixes, or an IP literal in a blocked range.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (host === '') return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  return isBlockedAddress(host)
}
