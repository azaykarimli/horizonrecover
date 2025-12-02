import { NextRequest, NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { fetchChargebacksByDateRange } from '@/app/api/emp/analytics/chargebacks/route'
import { fetchReconcileTransactions } from '@/app/api/emp/analytics/transactions/route'
import { requireSession, requireWriteAccess } from '@/lib/auth'
import { buildChargebackFilter, requiresOrganizationFilter } from '@/lib/analytics-helpers'

// GET: read cached chargebacks for a date range
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const coll = db.collection('emp_chargebacks')

    // Default to a wide range if not provided
    const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date('2020-01-01T00:00:00Z')
    const end = endDate ? new Date(`${endDate}T23:59:59Z`) : new Date()

    if (!endDate) {
      end.setHours(23, 59, 59, 999)
    }

    // Build base date filter
    const baseFilter: any = { postDateObj: { $gte: start, $lte: end } }

    // Add organization filter for non-Super Owner users
    const orgFilter = await buildChargebackFilter(session)
    const filter = orgFilter ? { $and: [baseFilter, orgFilter] } : baseFilter

    const items = await coll
      .find(filter)
      .project({ _id: 0 })
      .toArray()

    console.log(`[Chargeback Cache] ${session.role} fetched ${items.length} chargebacks (org-filtered: ${requiresOrganizationFilter(session)})`)

    return NextResponse.json({ success: true, chargebacks: items, count: items.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read cache' }, { status: 500 })
  }
}

// POST: resync (fetch remote via chargebacks/by_date for date range) and cache
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

    console.log(`[Chargeback Cache] Resyncing from ${startDate} to ${endDate}, clear_cache=${clearCache}`)

    // Fetch from chargebacks API
    const items = await fetchChargebacksByDateRange(startDate, endDate)

    console.log(`[Chargeback Cache] Fetched ${items.length} chargebacks from API`)

    // Cache in MongoDB
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const coll = db.collection('emp_chargebacks')

    // Count before clear
    const beforeCount = await coll.countDocuments()
    console.log(`[Chargeback Cache] Database had ${beforeCount} chargebacks before sync`)

    // Clear existing cache if requested (default behavior)
    if (clearCache) {
      const deleteResult = await coll.deleteMany({})
      console.log(`[Chargeback Cache] Cleared ${deleteResult.deletedCount} old chargebacks`)
    }

    // Insert new data
    if (items.length > 0) {
      // Debug: Check first few items
      console.log(`[Chargeback Cache] Sample chargebacks to insert:`, items.slice(0, 3).map(cb => ({
        uniqueId: cb.uniqueId,
        arn: cb.arn,
        amount: cb.amount,
        postDate: cb.postDate,
      })))

      const docs = items.map(cb => {
        const postDateObj = cb.postDate ? new Date(`${cb.postDate}T00:00:00Z`) : null
        return {
          ...cb,
          postDateObj,
          cachedAt: new Date(),
          rangeStart: startDate,
          rangeEnd: endDate,
        }
      })

      await coll.insertMany(docs, { ordered: false })
    }

    // Count after insert
    const afterCount = await coll.countDocuments()
    console.log(`[Chargeback Cache] Database now has ${afterCount} chargebacks`)
    console.log(`[Chargeback Cache] Net change: ${afterCount - beforeCount}`)

    return NextResponse.json({
      success: true,
      fetched: items.length,
      beforeCount,
      afterCount,
      cleared: clearCache,
    })
  } catch (error: any) {
    console.error('[Chargeback Cache] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to cache' }, { status: 500 })
  }
}


