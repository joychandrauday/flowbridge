import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadEvent, drainNow } from '@/lib/engine'
import { parseCsv, rowsToRecords } from '@/lib/csv'

const MAX_FILE_BYTES = 500_000
const MAX_ROWS = 2000

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const workspaceId = session.user.workspaceId

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form with a file field' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 500KB)' }, { status: 413 })
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return NextResponse.json({ error: 'Could not read file' }, { status: 400 })
  }

  const records = rowsToRecords(parseCsv(text))
  if (records.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 })
  }
  if (records.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 })
  }

  let imported = 0
  let duplicates = 0
  const errors: string[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const rowNumber = i + 2 // +1 for header, +1 for zero-index

    const name = record.name || null
    const email = record.email || null
    const phone = record.phone || null
    const data = { ...record } // full record (incl. name/email/phone) in `data`

    if (!name && !email && !phone) continue

    // Dedupe by email (Lead.email is globally unique) — pre-check to keep the
    // per-row transaction clean; the P2002 catch covers races.
    if (email && (await prisma.lead.findFirst({ where: { workspaceId, email } }))) {
      duplicates++
      continue
    }

    try {
      const queue = new JobQueue(prisma, `worker-csv-${Date.now()}`)
      await prisma.$transaction(async (tx) => {
        const intakeEvent = await tx.intakeEvent.create({
          data: { workspaceId, source: 'csv', payload: data as Prisma.InputJsonValue },
        })
        const lead = await tx.lead.create({
          data: {
            workspaceId,
            name: name ?? 'Unknown',
            email,
            phone,
            source: 'csv',
            status: 'NEW',
            data: data as Prisma.InputJsonValue,
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        duplicates++
        continue
      }
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

  return NextResponse.json({ success: true, imported, duplicates, errors: errors.slice(0, 20) })
}