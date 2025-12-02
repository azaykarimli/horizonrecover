import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/emp/uploads/reset/[id]
 * 
 * Resets an upload to allow resubmission with fresh transaction IDs
 * Clears baseTransactionId, retryCount, and status from all rows
 * Only Super Owner can reset uploads
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireWriteAccess()
    
    const { id } = ctx.params

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    // Get the upload document
    const doc = await uploads.findOne({ _id: new ObjectId(id) }) as any
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const rows: any[] = doc.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: 'No rows to reset',
      })
    }

    console.log(`[Reset Upload] Resetting ${rows.length} rows for upload ${id}`)

    // Reset each row to pending state, clearing baseTransactionId and retry info
    const resetRows = rows.map(row => ({
      ...row,
      status: 'pending',
      baseTransactionId: undefined, // Clear this so new transaction IDs will be generated
      retryCount: undefined,
      duplicateRetries: undefined,
      lastTransactionId: undefined,
      attempts: 0,
      emp: undefined,
      empStatus: undefined,
      lastAttemptAt: undefined,
      request: undefined,
    }))

    // Update the upload document
    await uploads.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          rows: resetRows,
          approvedCount: 0,
          errorCount: 0,
          updatedAt: new Date(),
        },
      }
    )

    console.log(`[Reset Upload] Successfully reset ${rows.length} rows`)

    return NextResponse.json({
      ok: true,
      message: `Reset ${rows.length} row(s) to pending state`,
      rowsReset: rows.length,
    })
  } catch (err: any) {
    console.error('[Reset Upload] Error:', err)
    return NextResponse.json({ 
      error: err?.message || 'Failed to reset upload' 
    }, { status: 500 })
  }
}



