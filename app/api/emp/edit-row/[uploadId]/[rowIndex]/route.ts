import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { getMongoClient, getDbName } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { requireSession, canManageUpload } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * PUT /api/emp/edit-row/[uploadId]/[rowIndex]
 * Edit a single row in an upload
 * Only Super Owner or Owner (if draft) can edit rows
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ uploadId: string; rowIndex: string }> }
) {
  try {
    const session = await requireSession()

    const { uploadId, rowIndex } = await params
    const idx = parseInt(rowIndex, 10)

    if (!ObjectId.isValid(uploadId) || isNaN(idx) || idx < 0) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const body = await req.json()
    const { updatedRecord } = body

    if (!updatedRecord || typeof updatedRecord !== 'object') {
      return NextResponse.json({ error: 'Invalid record data' }, { status: 400 })
    }

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    const upload = await uploads.findOne({ _id: new ObjectId(uploadId) })
    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!canManageUpload(session, upload)) {
      return NextResponse.json({ error: 'Forbidden: Cannot edit rows in this upload' }, { status: 403 })
    }

    const records = (upload as any).records || []
    if (idx >= records.length) {
      return NextResponse.json({ error: 'Row index out of bounds' }, { status: 400 })
    }

    // Update the record
    await uploads.updateOne(
      { _id: new ObjectId(uploadId) },
      {
        $set: {
          [`records.${idx}`]: updatedRecord,
          // Reset the row status to pending since it's been edited
          [`rows.${idx}.status`]: 'pending',
          [`rows.${idx}.edited`]: true,
          [`rows.${idx}.editedAt`]: new Date(),
        },
      }
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[Edit Row] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Edit failed' },
      { status: 500 }
    )
  }
}

