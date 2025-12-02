import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSuperOwner, requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_ID = 'field-mapping'

export async function GET() {
  try {
    await requireSuperOwner()

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const settings = db.collection('settings')

    const doc = await settings.findOne({ _id: SETTINGS_ID })

    return NextResponse.json({
      mapping: doc?.mapping || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settings' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await requireWriteAccess()

    const body = await req.json()
    const { mapping } = body

    if (!mapping || typeof mapping !== 'object') {
      return NextResponse.json({ error: 'Invalid mapping' }, { status: 400 })
    }

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const settings = db.collection('settings')

    await settings.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          mapping,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save settings' }, { status: 500 })
  }
}

