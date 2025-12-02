import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { parseEmpCsv } from '@/lib/emp'
import { requireSession, canManageUpload } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requireSession()
    const id = new ObjectId(ctx.params.id)

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    const doc = await uploads.findOne({ _id: id })
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!canManageUpload(session, doc)) {
      return NextResponse.json({ error: 'Forbidden: Cannot replace this upload' }, { status: 403 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    const text = await file.text()
    const records = parseEmpCsv(text)
    const headers = records[0] ? Object.keys(records[0]) : []

    await uploads.updateOne({ _id: id }, {
      $set: {
        filename: (file as File).name,
        records,
        headers,
        recordCount: records.length,
        rows: records.map(() => ({ status: 'pending', attempts: 0 })),
        updatedAt: new Date(),
      }
    })
    return NextResponse.json({ ok: true, count: records.length })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


