import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadEvent, drainNow } from '@/lib/engine'
import { parseCsv, rowsToRecords, applyMapping } from '@/lib/csv'

const MAX_CSV_CHARS = 500_000
const MAX_ROWS = 2000

/**
 * CSV import (SPEC §4.1): the client parses the file, shows a column-mapping UI
 * and a preview, then posts the raw text plus the chosen mapping. Each row
 * reuses the intake pipeline (IntakeEvent + Lead + runs in one transaction), so
 * an imported lead can never be lost. Rows are deduped by email/phone and the
 * response is an import report.
 */
const ImportRequestSchema = z.object({
  csvText: z.string().min(1).max(MAX_CSV_CHARS),
  mapping: z.object({
    name: z.string().max(120).optional(),
    email: z.string().max(120).optional(),
    phone: z.string().max(120).optional(),
  }),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const workspaceId = session.user.workspaceId

  const body = await request.json().catch(() => null)
  const parsed = ImportRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected JSON { csvText, mapping }' }, { status: 400 })
  }
  const { csvText, mapping } = parsed.data

  if (!mapping.name && !mapping.email && !mapping.phone) {
    return NextResponse.json({ error: 'Map at least one column (name, email or phone)' }, { status: 400 })
  }

  const rows = applyMapping(rowsToRecords(parseCsv(csvText)), mapping)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 })
  }

  let imported = 0
  let duplicates = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNumber = i + 2 // +1 for header, +1 for zero-index

    if (!row.name && !row.email && !row.phone) {
      skipped++
      continue
    }

    // Dedupe by email (Lead.email is globally unique) and, when absent, by
    // phone. Pre-check keeps the per-row transaction clean; the P2002 catch
    // below covers races and duplicate emails within the same file.
    try {
      if (row.email && (await prisma.lead.findFirst({ where: { workspaceId, email: row.email } }))) {
        duplicates++
        continue
      }
      if (row.phone && (await prisma.lead.findFirst({ where: { workspaceId, phone: row.phone } }))) {
        duplicates++
        continue
      }
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'unknown error'}`)
      continue
    }

    try {
      const queue = new JobQueue(prisma, `worker-csv-${Date.now()}`)
      await prisma.$transaction(async (tx) => {
        const intakeEvent = await tx.intakeEvent.create({
          data: { workspaceId, source: 'csv', payload: row.data as Prisma.InputJsonValue },
        })
        const lead = await tx.lead.create({
          data: {
            workspaceId,
            name: row.name ?? 'Unknown',
            email: row.email,
            phone: row.phone,
            source: 'csv',
            status: 'NEW',
            data: row.data as Prisma.InputJsonValue,
          },
        })
        await tx.intakeEvent.update({ where: { id: intakeEvent.id }, data: { leadId: lead.id } })
        await createRunsForLeadEvent(tx, queue, {
          workspaceId,
          leadId: lead.id,
          eventId: intakeEvent.id,
        })
      })
      imported++
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        duplicates++
        continue
      }
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

  return NextResponse.json({
    success: true,
    total: rows.length,
    imported,
    duplicates,
    skipped,
    errors: errors.slice(0, 20),
  })
}
