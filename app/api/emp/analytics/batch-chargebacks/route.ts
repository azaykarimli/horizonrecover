import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { requiresOrganizationFilter } from '@/lib/analytics-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface BatchChargebackAnalysis {
  uploadId: string
  filename: string
  createdAt: string
  totalRecords: number
  approvedCount: number
  chargebackCount: number
  chargebackRate: string
  chargebackAmount: number
  chargebacks: Array<{
    uniqueId?: string
    originalTransactionUniqueId: string
    transactionId: string
    reasonCode: string
    reasonDescription: string
    amount: number
    postDate: string
    arn?: string
  }>
}

/**
 * Build organization filter for uploads based on user role
 * STRICT: Only show uploads explicitly assigned to the user's organization
 */
function buildUploadsOrgFilter(session: any): any {
  if (session.role === 'superOwner') {
    return {} // No filter for Super Owner
  }

  if (session.role === 'agencyAdmin' || session.role === 'agencyViewer') {
    if (!session.agencyId) {
      console.warn(`[Batch Chargebacks] Agency role without agencyId - returning empty filter`)
      return { _id: { $exists: false } }
    }
    // STRICT: Only show uploads explicitly assigned to this agency
    return { agencyId: session.agencyId }
  }

  if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
    if (!session.accountId) {
      console.warn(`[Batch Chargebacks] Account role without accountId - returning empty filter`)
      return { _id: { $exists: false } }
    }
    // STRICT: Only show uploads explicitly assigned to this account
    return { accountId: session.accountId }
  }

  // Default: match nothing for unknown roles
  return { _id: { $exists: false } }
}

/**
 * GET /api/emp/analytics/batch-chargebacks
 * 
 * Analyzes chargebacks by batch upload
 * Links chargebacks (from emp_chargebacks collection) to uploads (via uniqueId)
 * Filtered by organization for non-Super Owner users
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const startTime = Date.now()

    const client = await getMongoClient()
    const db = client.db(getDbName())

    // Build organization filter for uploads
    const orgFilter = buildUploadsOrgFilter(session)

    console.log(`[Batch Chargebacks HYBRID] Starting for ${session.role}`)

    const uploadsCollection = db.collection('uploads')

    // Step 1: Fetch uploads with minimal projection (FAST - no unwinding)
    const uploads = await uploadsCollection
      .find(orgFilter, {
        projection: {
          _id: 1,
          filename: 1,
          originalFilename: 1,
          createdAt: 1,
          recordCount: 1,
          approvedCount: 1,
          'rows.baseTransactionId': 1,
          partNumber: 1
        }
      })
      .sort({ createdAt: -1, partNumber: 1 })
      .toArray()

    const fetchTime = Date.now() - startTime
    console.log(`[Batch Chargebacks HYBRID] Fetched ${uploads.length} uploads in ${fetchTime}ms`)

    // Step 2: Extract transaction IDs (FAST - simple loop)
    const allTransactionIds = new Set<string>()
    const uploadTransactionMap = new Map<string, Set<string>>()

    for (const upload of uploads) {
      const uploadId = upload._id.toString()
      const txIds = new Set<string>()

      if (upload.rows && Array.isArray(upload.rows)) {
        for (const row of upload.rows) {
          if (row.baseTransactionId) {
            allTransactionIds.add(row.baseTransactionId)
            txIds.add(row.baseTransactionId)
          }
        }
      }

      uploadTransactionMap.set(uploadId, txIds)
    }

    const extractTime = Date.now() - startTime - fetchTime
    console.log(`[Batch Chargebacks HYBRID] Extracted ${allTransactionIds.size} transaction IDs in ${extractTime}ms`)

    if (allTransactionIds.size === 0) {
      console.log(`[Batch Chargebacks HYBRID] No transactions - returning empty results`)
      return NextResponse.json({
        success: true,
        batches: [],
        totalBatches: 0,
        totalChargebacks: 0,
        totalChargebacksInDb: 0,
        unmatchedChargebacks: 0,
        timestamp: new Date().toISOString(),
        _debug: { executionTimeMs: Date.now() - startTime }
      })
    }

    // Step 3: Fetch reconcile transactions using indexed query (FAST)
    const reconcileCollection = db.collection('emp_reconcile_transactions')
    const transactionIdArray = Array.from(allTransactionIds)

    const reconcileTransactions = await reconcileCollection
      .find({
        $or: [
          { transactionId: { $in: transactionIdArray } },
          { transaction_id: { $in: transactionIdArray } }
        ]
      }, {
        projection: {
          transactionId: 1,
          transaction_id: 1,
          uniqueId: 1,
          unique_id: 1
        }
      })
      .toArray()

    const reconcileTime = Date.now() - startTime - fetchTime - extractTime
    console.log(`[Batch Chargebacks HYBRID] Fetched ${reconcileTransactions.length} reconcile txns in ${reconcileTime}ms`)

    // Step 4: Build transactionId -> uniqueId map
    const transactionToUniqueId = new Map<string, string>()
    const allUniqueIds = new Set<string>()

    for (const tx of reconcileTransactions) {
      const transactionId = tx.transactionId || tx.transaction_id
      const uniqueId = tx.uniqueId || tx.unique_id

      if (transactionId && uniqueId) {
        transactionToUniqueId.set(transactionId, uniqueId)
        allUniqueIds.add(uniqueId)
      }
    }

    const mapTime1 = Date.now() - startTime - fetchTime - extractTime - reconcileTime
    console.log(`[Batch Chargebacks HYBRID] Mapped ${transactionToUniqueId.size} txns to uniqueIds in ${mapTime1}ms`)

    if (allUniqueIds.size === 0) {
      console.log(`[Batch Chargebacks HYBRID] No unique IDs found - returning empty results`)
      return NextResponse.json({
        success: true,
        batches: [],
        totalBatches: 0,
        totalChargebacks: 0,
        totalChargebacksInDb: 0,
        unmatchedChargebacks: 0,
        timestamp: new Date().toISOString(),
        _debug: { executionTimeMs: Date.now() - startTime }
      })
    }

    // Step 5: Fetch chargebacks using indexed query (FAST)
    const chargebacksCollection = db.collection('emp_chargebacks')
    const uniqueIdArray = Array.from(allUniqueIds)

    const chargebacks = await chargebacksCollection
      .find({
        $or: [
          { originalTransactionUniqueId: { $in: uniqueIdArray } },
          { original_transaction_unique_id: { $in: uniqueIdArray } }
        ]
      }, {
        projection: {
          uniqueId: 1,
          unique_id: 1,
          originalTransactionUniqueId: 1,
          original_transaction_unique_id: 1,
          reasonCode: 1,
          reason_code: 1,
          reasonDescription: 1,
          reason_description: 1,
          amount: 1,
          postDate: 1,
          post_date: 1,
          arn: 1
        }
      })
      .toArray()

    const chargebackTime = Date.now() - startTime - fetchTime - extractTime - reconcileTime - mapTime1
    console.log(`[Batch Chargebacks HYBRID] Fetched ${chargebacks.length} chargebacks in ${chargebackTime}ms`)

    // Step 6: Build uniqueId -> chargeback map
    const uniqueIdToChargeback = new Map<string, any>()

    for (const cb of chargebacks) {
      const uniqueId = cb.originalTransactionUniqueId || cb.original_transaction_unique_id
      if (!uniqueId) continue

      uniqueIdToChargeback.set(uniqueId, {
        uniqueId: cb.uniqueId || cb.unique_id || '',
        originalTransactionUniqueId: uniqueId,
        reasonCode: cb.reasonCode || cb.reason_code || 'UNKNOWN',
        reasonDescription: cb.reasonDescription || cb.reason_description || '',
        amount: cb.amount || 0,
        postDate: cb.postDate || cb.post_date || '',
        arn: cb.arn || ''
      })
    }

    const mapTime2 = Date.now() - startTime - fetchTime - extractTime - reconcileTime - mapTime1 - chargebackTime
    console.log(`[Batch Chargebacks HYBRID] Built chargeback map in ${mapTime2}ms`)

    // Step 7: Build final transactionId -> chargeback map
    const transactionToChargeback = new Map<string, any>()

    for (const [transactionId, uniqueId] of transactionToUniqueId) {
      const chargeback = uniqueIdToChargeback.get(uniqueId)
      if (chargeback) {
        transactionToChargeback.set(transactionId, {
          ...chargeback,
          transactionId
        })
      }
    }

    const joinTime = Date.now() - startTime - fetchTime - extractTime - reconcileTime - mapTime1 - chargebackTime - mapTime2
    console.log(`[Batch Chargebacks HYBRID] Joined maps in ${joinTime}ms`)

    // Step 8: Group chargebacks by upload (FAST - simple iteration)
    const results: BatchChargebackAnalysis[] = []
    const uniqueChargebackIds = new Set<string>()

    for (const upload of uploads) {
      const uploadId = upload._id.toString()
      const txIds = uploadTransactionMap.get(uploadId) || new Set()

      const uploadChargebacks: any[] = []
      let totalChargebackAmount = 0

      for (const transactionId of txIds) {
        const chargeback = transactionToChargeback.get(transactionId)
        if (chargeback && chargeback.originalTransactionUniqueId) {
          uploadChargebacks.push(chargeback)
          totalChargebackAmount += chargeback.amount || 0
          uniqueChargebackIds.add(chargeback.originalTransactionUniqueId)
        }
      }

      const approvedCount = upload.approvedCount || 0
      const chargebackCount = uploadChargebacks.length
      const chargebackRate = approvedCount > 0
        ? ((chargebackCount / approvedCount) * 100).toFixed(2) + '%'
        : '0%'

      results.push({
        uploadId,
        filename: upload.originalFilename || upload.filename || 'Unknown',
        createdAt: upload.createdAt ? new Date(upload.createdAt).toISOString() : '',
        totalRecords: upload.recordCount || 0,
        approvedCount,
        chargebackCount,
        chargebackRate,
        chargebackAmount: totalChargebackAmount,
        chargebacks: uploadChargebacks,
      })
    }

    // Sort by chargeback count descending
    results.sort((a, b) => b.chargebackCount - a.chargebackCount)

    const groupTime = Date.now() - startTime - fetchTime - extractTime - reconcileTime - mapTime1 - chargebackTime - mapTime2 - joinTime
    const totalTime = Date.now() - startTime

    console.log(`[Batch Chargebacks HYBRID] Grouped in ${groupTime}ms`)
    console.log(`[Batch Chargebacks HYBRID] Total execution: ${totalTime}ms`)
    console.log(`[Batch Chargebacks HYBRID] Breakdown: fetch=${fetchTime}ms, extract=${extractTime}ms, reconcile=${reconcileTime}ms, map1=${mapTime1}ms, chargebacks=${chargebackTime}ms, map2=${mapTime2}ms, join=${joinTime}ms, group=${groupTime}ms`)
    console.log(`[Batch Chargebacks HYBRID] Found ${uniqueChargebackIds.size} unique chargebacks`)

    const response = NextResponse.json({
      success: true,
      batches: results,
      totalBatches: results.length,
      totalChargebacks: uniqueChargebackIds.size,
      totalChargebacksInDb: uniqueChargebackIds.size,
      unmatchedChargebacks: 0,
      timestamp: new Date().toISOString(),
      _debug: {
        executionTimeMs: totalTime,
        breakdown: {
          fetchMs: fetchTime,
          extractMs: extractTime,
          reconcileMs: reconcileTime,
          map1Ms: mapTime1,
          chargebacksMs: chargebackTime,
          map2Ms: mapTime2,
          joinMs: joinTime,
          groupMs: groupTime
        }
      }
    })

    // Prevent any caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error: any) {
    console.error('[Batch Chargebacks HYBRID] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to analyze batch chargebacks'
      },
      { status: 500 }
    )
  }
}

