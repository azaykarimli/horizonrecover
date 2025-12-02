import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession, canManageUpload } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * DELETE /api/emp/uploads/delete-row/[uploadId]/[rowIndex]
 * 
 * Deletes a specific row from an upload
 * Only Super Owner or Owner (if draft) can delete rows
 */
export async function DELETE(_req: Request, ctx: { params: { uploadId: string; rowIndex: string } }) {
  try {
    const session = await requireSession()

    const uploadId = ctx.params.uploadId
    const rowIndex = parseInt(ctx.params.rowIndex, 10)

    if (Number.isNaN(rowIndex)) {
      return NextResponse.json({ error: 'Invalid row index' }, { status: 400 })
    }

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    const doc = await uploads.findOne({ _id: new ObjectId(uploadId) }) as any
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!canManageUpload(session, doc)) {
      return NextResponse.json({ error: 'Forbidden: Cannot delete rows from this upload' }, { status: 403 })
    }

    const records: Record<string, string>[] = doc.records || []
    const rows: any[] = doc.rows || []

    if (rowIndex < 0 || rowIndex >= records.length) {
      return NextResponse.json({ error: 'Row index out of range' }, { status: 400 })
    }

    console.log(`[Delete Row] Deleting row ${rowIndex} from upload ${uploadId}`)

    // Remove the row at the specified index
    const newRecords = records.filter((_, i) => i !== rowIndex)
    const newRows = rows.filter((_, i) => i !== rowIndex)

    // Recalculate counts
    const approvedCount = newRows.filter((r: any) => r.status === 'approved').length
    const errorCount = newRows.filter((r: any) => r.status === 'error').length

    // Update the upload document
    await uploads.updateOne(
      { _id: new ObjectId(uploadId) },
      {
        $set: {
          records: newRecords,
          rows: newRows,
          recordCount: newRecords.length,
          approvedCount,
          errorCount,
          updatedAt: new Date(),
        },
      }
    )

    console.log(`[Delete Row] Successfully deleted row ${rowIndex}. New count: ${newRecords.length}`)

    return NextResponse.json({
      ok: true,
      message: 'Row deleted successfully',
      newRecordCount: newRecords.length,
      deletedIndex: rowIndex,
    })
  } catch (err: any) {
    console.error('[Delete Row] Error:', err)
    return NextResponse.json({
      error: err?.message || 'Failed to delete row'
    }, { status: 500 })
  }
}



