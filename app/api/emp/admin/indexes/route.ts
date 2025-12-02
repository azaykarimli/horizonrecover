import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSuperOwner } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function createIndexes() {
    await requireSuperOwner()

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const coll = db.collection('emp_reconcile_transactions')

    console.log('[Indexes] Creating indexes for emp_reconcile_transactions...')

    // 1. Date range filtering (most critical)
    const idx1 = await coll.createIndex({ transactionDateObj: -1 })
    console.log('[Indexes] Created index:', idx1)

    // 2. Transaction ID lookup (for org filtering)
    const idx2 = await coll.createIndex({ transactionId: 1 })
    console.log('[Indexes] Created index:', idx2)

    // 3. Unique ID lookup (for chargeback filtering)
    const idx3 = await coll.createIndex({ uniqueId: 1 })
    console.log('[Indexes] Created index:', idx3)

    // 4. Also index transaction_id (snake_case) just in case
    const idx4 = await coll.createIndex({ transaction_id: 1 })
    console.log('[Indexes] Created index:', idx4)

    return {
        ok: true,
        indexes: [idx1, idx2, idx3, idx4],
        message: 'Indexes created successfully'
    }
}

export async function GET() {
    try {
        const result = await createIndexes()
        return NextResponse.json(result)
    } catch (err: any) {
        console.error('[Indexes] Error:', err)
        return NextResponse.json({ error: err?.message || 'Failed to create indexes' }, { status: 500 })
    }
}

export async function POST() {
    try {
        const result = await createIndexes()
        return NextResponse.json(result)
    } catch (err: any) {
        console.error('[Indexes] Error:', err)
        return NextResponse.json({ error: err?.message || 'Failed to create indexes' }, { status: 500 })
    }
}
