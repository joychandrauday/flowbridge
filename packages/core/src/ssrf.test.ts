import { describe, expect, it } from 'vitest'
import { isBlockedAddress, isBlockedHostname, isPrivateIpv4, isPrivateIpv6 } from './ssrf'

describe('isPrivateIpv4', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1', // CGNAT
    '192.0.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('blocks %s', (ip) => {
    expect(isPrivateIpv4(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.1.1', '203.0.113.5', '93.184.216.34'])(
    'allows public %s',
    (ip) => {
      expect(isPrivateIpv4(ip)).toBe(false)
    }
  )

  it('rejects non-IPv4 strings', () => {
    expect(isPrivateIpv4('not-an-ip')).toBe(false)
    expect(isPrivateIpv4('999.1.1.1')).toBe(false)
    expect(isPrivateIpv4('10.0.0')).toBe(false)
  })
})

describe('isPrivateIpv6', () => {
  it.each([
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    'fd00:ec2::254', // AWS metadata
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    '2002::1', // 6to4
    '64:ff9b::1', // NAT64
    '[::1]', // bracketed hostname form
    'fe80::1%eth0', // zone id
  ])('blocks %s', (ip) => {
    expect(isPrivateIpv6(ip)).toBe(true)
  })

  it.each(['2001:4860:4860::8888', '2606:4700:4700::1111'])('allows public %s', (ip) => {
    expect(isPrivateIpv6(ip)).toBe(false)
  })

  it('rejects non-IPv6 strings', () => {
    expect(isPrivateIpv6('example.com')).toBe(false)
  })
})

describe('isBlockedAddress', () => {
  it('covers both families', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true)
    expect(isBlockedAddress('::1')).toBe(true)
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
  })
})

describe('isBlockedHostname', () => {
  it.each(['localhost', 'api.localhost', 'db.internal', 'printer.local', '', '127.0.0.1', '[::1]'])(
    'blocks %s',
    (host) => {
      expect(isBlockedHostname(host)).toBe(true)
    }
  )

  it.each(['example.com', 'api.stripe.com', 'hooks.slack.com'])('allows %s', (host) => {
    expect(isBlockedHostname(host)).toBe(false)
  })
})
