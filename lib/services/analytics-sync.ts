import { getMongoClient, getDbName } from '@/lib/db'
import { fetchReconcileTransactions } from '@/app/api/emp/analytics/transactions/route'
import { fetchChargebacksByDateRange } from '@/app/api/emp/analytics/chargebacks/route'

// Calculate date range (same as frontend)
export function getDateRange() {
    const now = new Date()

    // Start: 30 days ago
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)

    // End: 30 days in the future
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + 30)

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
    }
}

export type SyncResults = {
    transactions: { success: boolean; fetched: number; error: string | null }
    chargebacks: { success: boolean; fetched: number; error: string | null }
}

export async function refreshAnalytics() {
    const startTime = Date.now()
    const { startDate, endDate } = getDateRange()

    console.log(`[Analytics Sync] Date range: ${startDate} to ${endDate}`)

    const results: SyncResults = {
        transactions: { success: false, fetched: 0, error: null },
        chargebacks: { success: false, fetched: 0, error: null },
    }

    try {
        // Connect to MongoDB
        const client = await getMongoClient()
        const db = client.db(getDbName())

        // 1. Sync Transactions
        console.log('[Analytics Sync] Syncing transactions...')
        try {
            const transactions = await fetchReconcileTransactions(startDate, endDate)
            console.log(`[Analytics Sync] Fetched ${transactions.length} transactions from API`)

            const txColl = db.collection('emp_reconcile_transactions')

            // Clear and refresh
            await txColl.deleteMany({})

            if (transactions.length > 0) {
                const docs = transactions.map(t => {
                    const transactionDateObj = t.transactionDate ? new Date(t.transactionDate) : null
                    return {
                        ...t,
                        transactionDateObj,
                        cachedAt: new Date(),
                        rangeStart: startDate,
                        rangeEnd: endDate,
                        syncedByCron: true,
                    }
                })

                await txColl.insertMany(docs, { ordered: false })
            }

            results.transactions = { success: true, fetched: transactions.length, error: null }
            console.log(`[Analytics Sync] Transactions sync complete: ${transactions.length} cached`)
        } catch (err: any) {
            results.transactions.error = err.message || 'Unknown error'
            console.error('[Analytics Sync] Transaction sync error:', err)
        }

        // 2. Sync Chargebacks
        console.log('[Analytics Sync] Syncing chargebacks...')
        try {
            const chargebacks = await fetchChargebacksByDateRange(startDate, endDate)
            console.log(`[Analytics Sync] Fetched ${chargebacks.length} chargebacks from API`)

            const cbColl = db.collection('emp_chargebacks')

            // Clear and refresh
            await cbColl.deleteMany({})

            if (chargebacks.length > 0) {
                const docs = chargebacks.map(cb => {
                    const postDateObj = cb.postDate ? new Date(`${cb.postDate}T00:00:00Z`) : null
                    return {
                        ...cb,
                        postDateObj,
                        cachedAt: new Date(),
                        rangeStart: startDate,
                        rangeEnd: endDate,
                        syncedByCron: true,
                    }
                })

                await cbColl.insertMany(docs, { ordered: false })
            }

            results.chargebacks = { success: true, fetched: chargebacks.length, error: null }
            console.log(`[Analytics Sync] Chargebacks sync complete: ${chargebacks.length} cached`)
        } catch (err: any) {
            results.chargebacks.error = err.message || 'Unknown error'
            console.error('[Analytics Sync] Chargeback sync error:', err)
        }

        const duration = Date.now() - startTime
        console.log(`[Analytics Sync] Refresh completed in ${duration}ms`)

        return {
            success: results.transactions.success && results.chargebacks.success,
            results,
            duration,
            dateRange: { startDate, endDate }
        }

    } catch (error: any) {
        const duration = Date.now() - startTime
        console.error('[Analytics Sync] Fatal error:', error)
        throw error
    }
}
