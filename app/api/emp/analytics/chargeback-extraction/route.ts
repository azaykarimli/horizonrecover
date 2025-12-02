import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { requiresOrganizationFilter } from '@/lib/analytics-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
      console.warn(`[Chargeback Extraction] Agency role without agencyId - returning empty filter`)
      return { _id: { $exists: false } }
    }
    // STRICT: Only show uploads explicitly assigned to this agency
    return { agencyId: session.agencyId }
  }

  if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
    if (!session.accountId) {
      console.warn(`[Chargeback Extraction] Account role without accountId - returning empty filter`)
      return { _id: { $exists: false } }
    }
    // STRICT: Only show uploads explicitly assigned to this account
    return { accountId: session.accountId }
  }

  // Default: match nothing for unknown roles
  return { _id: { $exists: false } }
}

/**
 * GET /api/emp/analytics/chargeback-extraction
 * 
 * Extracts chargebacks grouped by upload file/batch
 * Purpose: Send to clients for correction of affected transactions
 * Uses SAME logic as batch-chargebacks route
 * Filtered by organization for non-Super Owner users
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession()

    const client = await getMongoClient()
    const db = client.db(getDbName())

    // Build organization filter for uploads
    const orgFilter = buildUploadsOrgFilter(session)

    const uploadsCollection = db.collection('uploads')

    // Fetch uploads filtered by organization with their rows (we need baseTransactionId)
    const uploads = await uploadsCollection
      .find(orgFilter, {
        projection: {
          _id: 1,
          filename: 1,
          originalFilename: 1,
          createdAt: 1,
          recordCount: 1,
          approvedCount: 1,
          rows: 1, // Need rows to get baseTransactionId
          partNumber: 1
        }
      })
      .sort({ createdAt: -1, partNumber: 1 })
      .toArray()

    console.log(`[Chargeback Extraction] ${session.role} - Found ${uploads.length} uploads (Full Extraction)`)

    // Step 1: Extract all unique IDs and transaction IDs from org's uploads
    const orgUniqueIds = new Set<string>()
    const orgTransactionIds = new Set<string>()
    for (const upload of uploads) {
      if (!upload.rows || !Array.isArray(upload.rows)) continue
      for (const row of upload.rows) {
        if (row.emp?.uniqueId) {
          orgUniqueIds.add(row.emp.uniqueId)
        }
        if (row.baseTransactionId) {
          orgTransactionIds.add(row.baseTransactionId)
        }
        if (row.lastTransactionId) {
          orgTransactionIds.add(row.lastTransactionId)
        }
      }
    }

    console.log(`[Chargeback Extraction] Org has ${orgUniqueIds.size} direct unique IDs, ${orgTransactionIds.size} transaction IDs`)

    // Step 2: Look up transaction IDs in emp_reconcile_transactions to get gateway uniqueIds
    const reconcileCollection = db.collection('emp_reconcile_transactions')

    if (session.role !== 'superOwner' && orgTransactionIds.size > 0) {
      // Query both transactionId and transaction_id fields (both may be used)
      const transactionIdArray = Array.from(orgTransactionIds)
      const orgTransactionsInReconcile = await reconcileCollection
        .find({
          $or: [
            { transactionId: { $in: transactionIdArray } },
            { transaction_id: { $in: transactionIdArray } }
          ]
        }, { projection: { uniqueId: 1, unique_id: 1 } })
        .toArray()

      for (const tx of orgTransactionsInReconcile) {
        const uniqueId = tx.uniqueId || tx.unique_id
        if (uniqueId) {
          orgUniqueIds.add(uniqueId)
        }
      }
      console.log(`[Chargeback Extraction] Found ${orgTransactionsInReconcile.length} transactions in reconcile, extracted ${orgUniqueIds.size} unique IDs`)
    }

    // Step 3: Fetch only chargebacks that reference our org's transactions (SECURITY: prevents data leakage)
    const chargebacksCollection = db.collection('emp_chargebacks')
    let chargebackFilter: any = {}

    if (session.role !== 'superOwner') {
      if (orgUniqueIds.size === 0 && orgTransactionIds.size === 0) {
        console.log(`[Chargeback Extraction] No org transactions - returning empty results`)
        return NextResponse.json({
          success: true,
          batches: [],
          totalBatches: 0,
          totalChargebacks: 0,
        })
      }
      chargebackFilter = { originalTransactionUniqueId: { $in: Array.from(orgUniqueIds) } }
    } else {
      // For Super Owner, we still want to filter chargebacks to only those relevant to the FETCHED uploads
      // Otherwise we fetch ALL chargebacks in the DB which is slow
      // We need to find all uniqueIds associated with the fetched uploads first

      // Get all transaction IDs from the fetched uploads
      const allUploadTransactionIds = new Set<string>()
      for (const upload of uploads) {
        if (!upload.rows) continue
        for (const row of upload.rows) {
          if (row.baseTransactionId) allUploadTransactionIds.add(row.baseTransactionId)
        }
      }

      // Find uniqueIds for these transaction IDs
      const relevantTransactions = await reconcileCollection.find({
        $or: [
          { transactionId: { $in: Array.from(allUploadTransactionIds) } },
          { transaction_id: { $in: Array.from(allUploadTransactionIds) } }
        ]
      }, { projection: { uniqueId: 1, unique_id: 1 } }).toArray()

      const relevantUniqueIds = relevantTransactions.map(t => t.uniqueId || t.unique_id).filter(Boolean)

      if (relevantUniqueIds.length > 0) {
        chargebackFilter = { originalTransactionUniqueId: { $in: relevantUniqueIds } }
      } else {
        // No transactions found for these uploads? Then no chargebacks.
        chargebackFilter = { _id: { $exists: false } }
      }
    }

    const allChargebacks = await chargebacksCollection.find(chargebackFilter).toArray()

    console.log(`[Chargeback Extraction] Found ${allChargebacks.length} chargebacks (filtered by org: ${session.role !== 'superOwner'})`)

    if (allChargebacks.length > 0) {
      console.log(`[Chargeback Extraction] Sample chargeback:`, JSON.stringify(allChargebacks[0], null, 2))
    }

    // Step 4: Get originalTransactionUniqueId from chargebacks for reconcile lookup
    const originalTransactionUniqueIds = new Set(
      allChargebacks
        .map(cb => cb.originalTransactionUniqueId || cb.original_transaction_unique_id)
        .filter(Boolean)
    )

    console.log(`[Chargeback Extraction] Looking up ${originalTransactionUniqueIds.size} original transaction IDs in reconcile`)

    // Step 5: Look up original transactions in reconcile by uniqueId
    const originalTransactions = await reconcileCollection
      .find({ uniqueId: { $in: Array.from(originalTransactionUniqueIds) } })
      .toArray()

    console.log(`[Chargeback Extraction] Found ${originalTransactions.length} matching original transactions in reconcile`)

    // Step 5: Create map of originalTransactionUniqueId -> transactionId + customer info
    const originalUniqueIdToTransactionData = new Map<string, any>()
    for (const tx of originalTransactions) {
      const transactionId = tx.transactionId || tx.transaction_id
      if (transactionId && tx.uniqueId) {
        originalUniqueIdToTransactionData.set(tx.uniqueId, {
          transactionId,
          customerName: tx.customerName || tx.customer_name,
          iban: tx.bankAccountNumber || tx.bank_account_number,
        })
      }
    }

    console.log(`[Chargeback Extraction] Mapped ${originalUniqueIdToTransactionData.size} original transactions to transaction IDs`)
    if (originalUniqueIdToTransactionData.size > 0) {
      const firstEntry = Array.from(originalUniqueIdToTransactionData.entries())[0]
      console.log(`[Chargeback Extraction] Sample mapping: ${firstEntry[0]} -> ${firstEntry[1].transactionId}`)
    }

    // Step 6: Create transactionId -> chargeback data map with customer info
    const transactionIdToChargeback = new Map<string, any>()
    for (const cb of allChargebacks) {
      const originalTxUniqueId = cb.originalTransactionUniqueId || cb.original_transaction_unique_id
      if (!originalTxUniqueId) continue

      const txData = originalUniqueIdToTransactionData.get(originalTxUniqueId)
      if (!txData) continue

      const chargebackData = {
        uniqueId: cb.uniqueId || cb.unique_id,
        originalTransactionUniqueId: originalTxUniqueId,
        transactionId: txData.transactionId,
        reasonCode: cb.reasonCode || cb.reason_code || 'UNKNOWN',
        reasonDescription: cb.reasonDescription || cb.reason_description || '',
        amount: cb.amount || 0,
        postDate: cb.postDate || cb.post_date || '',
        arn: cb.arn || '',
        customerName: txData.customerName,
        iban: txData.iban,
      }

      transactionIdToChargeback.set(txData.transactionId, chargebackData)
    }

    console.log(`[Chargeback Extraction] Mapped ${transactionIdToChargeback.size} chargebacks by transaction ID`)
    if (transactionIdToChargeback.size > 0) {
      const firstEntry = Array.from(transactionIdToChargeback.entries())[0]
      console.log(`[Chargeback Extraction] Sample chargeback mapping:`, firstEntry)
    }

    // Process each upload batch
    const results = []
    let totalChargebacks = 0

    for (const upload of uploads) {
      const rows = upload.rows || []

      // Extract all baseTransactionIds from this upload's rows
      const uploadTransactionIds = new Set<string>()
      for (const row of rows) {
        const baseTransactionId = row.baseTransactionId
        if (baseTransactionId) {
          uploadTransactionIds.add(baseTransactionId)
        }
      }

      // Debug: log first upload's transaction IDs
      if (uploadTransactionIds.size > 0 && results.length === 0) {
        console.log(`[Chargeback Extraction] Sample upload ${upload.filename} has ${uploadTransactionIds.size} transaction IDs`)
        console.log(`[Chargeback Extraction] First 3 transaction IDs:`, Array.from(uploadTransactionIds).slice(0, 3))
        console.log(`[Chargeback Extraction] First 3 chargeback transaction IDs:`, Array.from(transactionIdToChargeback.keys()).slice(0, 3))
      }

      // Find chargebacks matching this upload's transaction IDs
      const batchChargebacks: any[] = []
      for (const transactionId of Array.from(uploadTransactionIds)) {
        const cb = transactionIdToChargeback.get(transactionId)
        if (cb) {
          batchChargebacks.push(cb)
          totalChargebacks++
        }
      }

      // Debug: log match results for first upload
      if (results.length === 0) {
        console.log(`[Chargeback Extraction] Upload ${upload.filename}: ${batchChargebacks.length} chargebacks matched via transaction ID`)
      }

      // Only include batches that have chargebacks
      if (batchChargebacks.length > 0) {
        results.push({
          filename: upload.originalFilename || upload.filename || 'Unknown',
          uploadDate: upload.createdAt?.toISOString() || new Date().toISOString(),
          totalTransactions: rows.length,
          chargebacks: batchChargebacks,
        })
      }
    }

    console.log(`[Chargeback Extraction] Returning ${results.length} batches with ${totalChargebacks} total chargebacks`)

    const response = NextResponse.json({
      success: true,
      batches: results,
      totalBatches: results.length,
      totalChargebacks,
    })

    // Prevent any caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error: any) {
    console.error('[Chargeback Extraction] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to extract chargebacks'
      },
      { status: 500 }
    )
  }
}


