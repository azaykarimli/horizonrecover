import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { getMongoClient, getDbName } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { requireSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireSession()
    
    const { id } = ctx.params
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const doc = await uploads.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const item = {
      _id: doc._id?.toString?.(),
      filename: doc.filename,
      createdAt: doc.createdAt,
      recordCount: doc.recordCount,
      headers: doc.headers || [],
      records: doc.records || [],
      rows: doc.rows || [],
      approvedCount: doc.approvedCount || 0,
      errorCount: doc.errorCount || 0,
      pendingCount: (doc.rows || []).filter((r: any) => r?.status === 'pending').length,
      updatedAt: doc.updatedAt,
    }
    return NextResponse.json(item)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


