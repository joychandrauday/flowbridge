/**
 * Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF/LF).
 * Pure — no IO — unit-tested in csv.test.ts.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 0 && row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

/** Normalize a CSV header into a field key (lowercase, spaces → underscores). */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, '_')
}

/** Turn parsed rows into header-keyed objects, skipping blank rows. */
export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const headers = rows[0].map(normalizeHeader)
  const records: Record<string, string>[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    // Pad short rows, ignore extra cells
    const record: Record<string, string> = {}
    for (let col = 0; col < headers.length; col++) {
      const value = (cells[col] ?? '').trim()
      if (value) record[headers[col]] = value
    }
    if (Object.keys(record).length > 0) records.push(record)
  }
  return records
}

/** Which CSV column supplies each built-in lead field (SPEC §4.1 mapping). */
export interface LeadFieldMapping {
  name?: string
  email?: string
  phone?: string
}

export interface MappedLeadRow {
  name: string | null
  email: string | null
  phone: string | null
  /** Full source row (normalized keys → values) stored on the lead's custom data. */
  data: Record<string, string>
}

function pick(record: Record<string, string>, key?: string): string | null {
  if (!key) return null
  return record[key] ?? null
}

/** Apply a column mapping to parsed records. Pure. */
export function applyMapping(
  records: Record<string, string>[],
  mapping: LeadFieldMapping
): MappedLeadRow[] {
  return records.map((record) => ({
    name: pick(record, mapping.name),
    email: pick(record, mapping.email),
    phone: pick(record, mapping.phone),
    data: { ...record },
  }))
}

const NAME_HEADERS = ['name', 'full_name', 'fullname', 'first_name', 'contact_name', 'lead_name']
const EMAIL_HEADERS = ['email', 'email_address', 'e-mail', 'e_mail', 'mail']
const PHONE_HEADERS = ['phone', 'phone_number', 'mobile', 'mobile_number', 'telephone', 'cell']

function firstMatchingHeader(headers: string[], candidates: string[]): string | undefined {
  for (const header of headers) {
    if (candidates.includes(header)) return header
  }
  return undefined
}

/**
 * Best-effort auto-mapping from normalized header keys, used to pre-fill the
 * column mapping UI. Pure.
 */
export function guessMapping(headers: string[]): LeadFieldMapping {
  const normalized = headers.map(normalizeHeader)
  return {
    name: firstMatchingHeader(normalized, NAME_HEADERS),
    email: firstMatchingHeader(normalized, EMAIL_HEADERS),
    phone: firstMatchingHeader(normalized, PHONE_HEADERS),
  }
}