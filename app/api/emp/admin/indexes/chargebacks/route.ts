import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const session = await requireSession()
        if (session.role !== 'superOwner') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const client = await getMongoClient()
        const db = client.db(getDbName())

        const results = []

        // 1. Index for emp_chargebacks lookups
        const chargebacks = db.collection('emp_chargebacks')
        const cbIndex = await chargebacks.createIndex(
            { originalTransactionUniqueId: 1 },
            { background: true }
        )
        results.push(`Created index on emp_chargebacks.originalTransactionUniqueId: ${cbIndex}`)

        // 2. Index for emp_reconcile_transactions lookups (snake_case variant)
        const reconcile = db.collection('emp_reconcile_transactions')
        const recIndex = await reconcile.createIndex(
            { transaction_id: 1 },
            { background: true }
        )
        results.push(`Created index on emp_reconcile_transactions.transaction_id: ${recIndex}`)

        // 3. Index for emp_reconcile_transactions unique_id (snake_case variant)
        const recUniqueIndex = await reconcile.createIndex(
            { unique_id: 1 },
            { background: true }
        )
        results.push(`Created index on emp_reconcile_transactions.unique_id: ${recUniqueIndex}`)

        return NextResponse.json({ success: true, results })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
