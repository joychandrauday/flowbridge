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