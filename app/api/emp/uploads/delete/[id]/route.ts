import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession, canManageUpload } from '@/lib/auth'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const id = new ObjectId(ctx.params.id)

    const doc = await uploads.findOne({ _id: id })
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!canManageUpload(session, doc)) {
      return NextResponse.json({ error: 'Forbidden: Cannot delete this upload' }, { status: 403 })
    }

    await uploads.deleteOne({ _id: id })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


