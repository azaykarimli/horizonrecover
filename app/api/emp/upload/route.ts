import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60
import { parseEmpCsv } from '@/lib/emp'
import { getMongoClient, getDbName } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { requireSession } from '@/lib/auth'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_TOTAL_RECORDS = 50000 // Absolute safety limit
const MAX_RECORDS_PER_UPLOAD = 2500

export async function POST(req: Request) {
  try {
    const session = await requireSession()

    // 1. Validate form data
    const formData = await req.formData()
    const file = formData.get('file')

    // Get optional organization IDs from form data
    const formAgencyId = formData.get('agencyId') as string | null
    const formAccountId = formData.get('accountId') as string | null

    let agencyId: string | null = null
    let accountId: string | null = null

    // Auto-assign based on role
    if (session.role === 'superOwner') {
      agencyId = formAgencyId
      accountId = formAccountId
    } else if (session.role === 'agencyAdmin' || session.role === 'agencyViewer') {
      agencyId = session.agencyId || null
      accountId = null // Force null for agency users as requested
    } else if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
      agencyId = session.agencyId || null
      accountId = session.accountId || null
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 2. Validate file type
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      return NextResponse.json({
        error: 'Invalid file type. Please upload a CSV file.'
      }, { status: 400 })
    }

    // 3. Validate file size
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 400 })
    }

    console.log(`[Upload] Processing file: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`)

    // 4. Read file with encoding detection
    const buffer = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(buffer)

    // If UTF-8 decode has issues, try Windows-1252 (common for European CSVs)
    if (text.includes('�') || (!text.includes(';') && !text.includes(','))) {
      try {
        text = new TextDecoder('windows-1252').decode(buffer)
        console.log('[Upload] Using Windows-1252 encoding')
      } catch {
        text = new TextDecoder('utf-8').decode(buffer)
      }
    }

    // 5. Basic text validation
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'File contains no readable text' }, { status: 400 })
    }

    // Check for delimiter
    if (!text.includes(';') && !text.includes(',')) {
      return NextResponse.json({
        error: 'Invalid CSV format: no semicolons or commas found'
      }, { status: 400 })
    }

    // 6. Parse CSV with error handling
    let records: Record<string, string>[]
    try {
      records = parseEmpCsv(text)
    } catch (parseError: any) {
      console.error('[Upload] Parse error:', parseError)
      return NextResponse.json({
        error: `CSV parsing failed: ${parseError?.message || 'Invalid format'}`
      }, { status: 400 })
    }

    // 7. Validate parsed data
    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Failed to parse CSV records' }, { status: 500 })
    }

    if (records.length === 0) {
      return NextResponse.json({
        error: 'No records found in CSV (file may only contain headers)'
      }, { status: 400 })
    }

    if (records.length > MAX_TOTAL_RECORDS) {
      return NextResponse.json({
        error: `Too many records. Maximum supported per file is ${MAX_TOTAL_RECORDS}, found ${records.length}`
      }, { status: 400 })
    }

    // Extract actual headers from the parsed records and ensure no _empty_ columns slip through
    const headers = records[0]
      ? Object.keys(records[0]).filter(h => !h.startsWith('_empty_'))
      : []

    if (headers.length === 0) {
      return NextResponse.json({ error: 'No valid columns found in CSV' }, { status: 400 })
    }

    const totalRecords = records.length
    console.log(`[Upload] Parsed ${totalRecords} records with ${headers.length} columns`)

    const chunkSize = MAX_RECORDS_PER_UPLOAD
    const totalParts = Math.ceil(totalRecords / chunkSize)

    // 8. Store in MongoDB with retry logic (split into multiple uploads if needed)
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    const now = new Date()
    const splitGroupId = totalParts > 1 ? new ObjectId() : null

    const docs = Array.from({ length: totalParts }).map((_, idx) => {
      const start = idx * chunkSize
      const chunkRecords = records.slice(start, start + chunkSize)
      const recordCount = chunkRecords.length
      const partNumber = idx + 1

      return {
        filename: totalParts > 1 ? `${file.name} (Part ${partNumber}/${totalParts})` : file.name,
        originalFilename: file.name,
        fileSize: file.size,
        createdAt: now,
        updatedAt: now,
        uploadedBy: session.email,
        agencyId: agencyId || null,
        accountId: accountId || null,
        recordCount,
        headers,
        records: chunkRecords,
        rows: chunkRecords.map((_, rowIdx) => ({
          status: 'pending',
          attempts: 0,
          originalRowNumber: start + rowIdx + 1,
        })),
        approvedCount: 0,
        errorCount: 0,
        partNumber,
        partTotal: totalParts,
        recordStartIndex: start,
        recordEndIndex: start + recordCount - 1,
        splitGroupId,
        totalRecords,
      }
    })

    let insertResult: { insertedIds: Record<string, ObjectId> }
    try {
      if (docs.length === 1) {
        const singleResult = await uploads.insertOne(docs[0] as any)
        insertResult = { insertedIds: { '0': singleResult.insertedId } }
      } else {
        const manyResult = await uploads.insertMany(docs as any[])
        insertResult = { insertedIds: manyResult.insertedIds as Record<string, ObjectId> }
      }
    } catch (dbError: any) {
      console.error('[Upload] Database error:', dbError)

      // Check for specific MongoDB errors
      if (dbError.code === 11000) {
        return NextResponse.json({
          error: 'Duplicate upload detected'
        }, { status: 409 })
      }

      return NextResponse.json({
        error: 'Failed to save upload to database'
      }, { status: 500 })
    }

    const insertedIds = Object.entries(insertResult.insertedIds)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => value.toString())

    console.log(`[Upload] Saved ${docs.length} document(s) for file ${file.name}`)

    return NextResponse.json({
      ok: true,
      totalRecords,
      parts: docs.length,
      uploads: docs.map((chunk, idx) => ({
        id: insertedIds[idx],
        filename: chunk.filename,
        recordCount: chunk.recordCount,
        partNumber: chunk.partNumber,
        partTotal: chunk.partTotal,
        recordRange: [chunk.recordStartIndex + 1, chunk.recordEndIndex + 1],
      })),
      headers: headers.length,
      filename: file.name,
    })
  } catch (err: any) {
    console.error('[Upload] Unexpected error:', err)

    // Provide helpful error messages
    let errorMessage = 'Upload failed'
    if (err?.message) {
      if (err.message.includes('memory')) {
        errorMessage = 'File too large to process. Please split into smaller files.'
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Upload timed out. Please try a smaller file.'
      } else {
        errorMessage = err.message
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}


