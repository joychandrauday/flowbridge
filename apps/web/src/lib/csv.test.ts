import { describe, expect, it } from 'vitest'
import { parseCsv, normalizeHeader, rowsToRecords } from './csv'

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('name,email\nJane,jane@acme.com\n')).toEqual([
      ['name', 'email'],
      ['Jane', 'jane@acme.com'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const csv = 'name,note\n"Smith, Jane","said ""hi"""\n'
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['Smith, Jane', 'said "hi"'],
    ])
  })

  it('skips fully blank rows', () => {
    expect(parseCsv('a,b\n1,2\n\n\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('normalizeHeader', () => {
  it('lowercases and converts spaces to underscores', () => {
    expect(normalizeHeader('Company Name')).toBe('company_name')
    expect(normalizeHeader('  Email Address ')).toBe('email_address')
  })
})

describe('rowsToRecords', () => {
  it('maps headers to keys, trims values, drops blanks', () => {
    const rows = [
      ['Name', 'Email', 'Company'],
      ['Jane', 'jane@acme.com', 'Acme'],
      ['Bob', '', ''],
    ]
    expect(rowsToRecords(rows)).toEqual([
      { name: 'Jane', email: 'jane@acme.com', company: 'Acme' },
      { name: 'Bob' },
    ])
  })

  it('returns [] for a header-only file', () => {
    expect(rowsToRecords([['name', 'email']])).toEqual([])
  })
})