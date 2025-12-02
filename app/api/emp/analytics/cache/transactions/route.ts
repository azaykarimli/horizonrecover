import { NextRequest, NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { fetchReconcileTransactions } from '@/app/api/emp/analytics/transactions/route'
import { requireSession, requireWriteAccess } from '@/lib/auth'
import { buildTransactionFilter, requiresOrganizationFilter } from '@/lib/analytics-helpers'

// GET: read cached reconcile transactions for a date range
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = parseInt(searchParams.get('perPage') || '25')
    const skip = (page - 1) * perPage

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const coll = db.collection('emp_reconcile_transactions')

    // Default to a wide range if not provided
    const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date('2020-01-01T00:00:00Z')
    const end = endDate ? new Date(`${endDate}T23:59:59Z`) : new Date()

    if (!endDate) {
      end.setHours(23, 59, 59, 999)
    }

    // Build base date filter
    const baseFilter: any = { transactionDateObj: { $gte: start, $lte: end } }

    // Add organization filter for non-Super Owner users
    const orgFilter = await buildTransactionFilter(session)
    const filter = orgFilter ? { $and: [baseFilter, orgFilter] } : baseFilter

    // Get total count for pagination
    const totalCount = await coll.countDocuments(filter)

    const items = await coll
      .find(filter)
      .sort({ transactionDateObj: -1 }) // Sort by date desc
      .skip(skip)
      .limit(perPage)
      .project({ _id: 0 })
      .toArray()

    console.log(`[Analytics Cache] ${session.role} fetched page ${page} (${items.length} items) of ${totalCount} total`)

    return NextResponse.json({
      success: true,
      transactions: items,
      count: items.length,
      pagination: {
        page,
        perPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read cache' }, { status: 500 })
  }
}

// POST: resync (fetch remote via reconcile and cache) for a date range
export async function POST(request: NextRequest) {
  try {
    await requireWriteAccess()

    const body = await request.json().catch(() => ({}))
    const clearCache = body.clear_cache !== false // Default to true

    // Default to last 2 years if not provided
    const defaultStart = new Date()
    defaultStart.setFullYear(defaultStart.getFullYear() - 2)
    const startDate = body.start_date || defaultStart.toISOString().split('T')[0]
    const endDate = body.end_date || new Date().toISOString().split('T')[0]

    console.log(`[Transaction Cache] Resyncing from ${startDate} to ${endDate}, clear_cache=${clearCache}`)

    // Call the core logic directly instead of HTTP fetch
    const items = await fetchReconcileTransactions(startDate, endDate)

    console.log(`[Transaction Cache] Fetched ${items.length} transactions from API`)

    // Cache in MongoDB
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const coll = db.collection('emp_reconcile_transactions')

    // Count before clear
    const beforeCount = await coll.countDocuments()
    console.log(`[Transaction Cache] Database had ${beforeCount} transactions before sync`)

    // Clear existing cache if requested (default behavior)
    if (clearCache) {
      const deleteResult = await coll.deleteMany({})
      console.log(`[Transaction Cache] Cleared ${deleteResult.deletedCount} old transactions`)
    }

    // Insert new data
    if (items.length > 0) {
      const docs = items.map(t => {
        const transactionDateObj = t.transactionDate ? new Date(t.transactionDate) : null
        return {
          ...t,
          transactionDateObj,
          cachedAt: new Date(),
          rangeStart: startDate,
          rangeEnd: endDate,
        }
      })

      await coll.insertMany(docs, { ordered: false })
    }

    // Count after insert
    const afterCount = await coll.countDocuments()
    console.log(`[Transaction Cache] Database now has ${afterCount} transactions`)
    console.log(`[Transaction Cache] Net change: ${afterCount - beforeCount}`)

    return NextResponse.json({
      success: true,
      fetched: items.length,
      beforeCount,
      afterCount,
      cleared: clearCache,
    })
  } catch (error: any) {
    console.error('[Transaction Cache] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to cache' }, { status: 500 })
  }
}


