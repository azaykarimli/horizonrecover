import { NextResponse } from 'next/server'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/emp/analytics/chargeback-extraction/csv?filename=xxx&type=chargebacks|clean
 * 
 * Exports chargebacks OR clean transactions for a specific batch in original CSV format
 * - type=chargebacks: Only rows with chargebacks (default)
 * - type=clean: Only rows WITHOUT chargebacks
 */
export async function GET(req: Request) {
  try {
    await requireSession()
    
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get('filename')
    const type = searchParams.get('type') || 'chargebacks' // 'chargebacks' or 'clean'

    if (!filename) {
      return NextResponse.json(
        { error: 'filename parameter is required', success: false },
        { status: 400 }
      )
    }

    if (type !== 'chargebacks' && type !== 'clean') {
      return NextResponse.json(
        { error: 'type parameter must be "chargebacks" or "clean"', success: false },
        { status: 400 }
      )
    }

    const client = await getMongoClient()
    const db = client.db(getDbName())
    
    // Find the upload by filename (include records and headers in projection)
    const uploadsCollection = db.collection('uploads')
    const upload = await uploadsCollection.findOne({
      $or: [
        { filename },
        { originalFilename: filename }
      ]
    }, {
      projection: {
        filename: 1,
        originalFilename: 1,
        headers: 1,
        records: 1,
        rows: 1,
      }
    })

    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found', success: false },
        { status: 404 }
      )
    }

    console.log(`[Chargeback CSV Export] Found upload: ${filename}`)

    // Get chargebacks for this batch (same logic as main extraction)
    const chargebacksCollection = db.collection('emp_chargebacks')
    const allChargebacks = await chargebacksCollection.find({}).toArray()

    // Get originalTransactionUniqueIds
    const originalTransactionUniqueIds = new Set(
      allChargebacks
        .map(cb => cb.originalTransactionUniqueId || cb.original_transaction_unique_id)
        .filter(Boolean)
    )

    // Look up in reconcile
    const reconcileCollection = db.collection('emp_reconcile_transactions')
    const originalTransactions = await reconcileCollection
      .find({ uniqueId: { $in: Array.from(originalTransactionUniqueIds) } })
      .toArray()

    // Create map
    const originalUniqueIdToTransactionId = new Map<string, string>()
    for (const tx of originalTransactions) {
      const transactionId = tx.transactionId || tx.transaction_id
      if (transactionId && tx.uniqueId) {
        originalUniqueIdToTransactionId.set(tx.uniqueId, transactionId)
      }
    }

    // Create transactionId -> chargeback map
    const transactionIdToChargeback = new Map<string, any>()
    for (const cb of allChargebacks) {
      const originalTxUniqueId = cb.originalTransactionUniqueId || cb.original_transaction_unique_id
      if (!originalTxUniqueId) continue
      
      const transactionId = originalUniqueIdToTransactionId.get(originalTxUniqueId)
      if (!transactionId) continue
      
      transactionIdToChargeback.set(transactionId, cb)
    }

    // Get transaction IDs from rows (rows track status, records have data)
    const rows = upload.rows || []
    const records: Record<string, string>[] = upload.records || []
    const headers: string[] = upload.headers || []
    
    console.log(`[Chargeback CSV Export] Upload has ${rows.length} rows and ${records.length} records`)
    console.log(`[Chargeback CSV Export] Headers:`, headers)

    // Build set of chargebacked transaction IDs
    const chargebackedTransactionIds = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const transactionId = row.baseTransactionId
      if (transactionId && transactionIdToChargeback.has(transactionId)) {
        chargebackedTransactionIds.add(transactionId)
      }
    }

    console.log(`[Chargeback CSV Export] Found ${chargebackedTransactionIds.size} chargebacked transaction IDs`)

    // Filter records based on type
    const filteredRecords: Record<string, string>[] = []
    
    if (type === 'chargebacks') {
      // Include ONLY rows with chargebacks
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const transactionId = row.baseTransactionId
      if (transactionId && chargebackedTransactionIds.has(transactionId)) {
          // This row was chargebacked, include it
          if (records[i]) {
            filteredRecords.push(records[i])
          }
        }
      }
      console.log(`[Chargeback CSV Export] Exporting ${filteredRecords.length} chargebacked records for ${filename}`)
    } else {
      // type === 'clean' - Include ONLY rows WITHOUT chargebacks
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const transactionId = row.baseTransactionId
        // Include if no transactionId OR transactionId is NOT in chargeback set
        if (!transactionId || !chargebackedTransactionIds.has(transactionId)) {
        if (records[i]) {
            filteredRecords.push(records[i])
        }
      }
    }
      console.log(`[Chargeback CSV Export] Exporting ${filteredRecords.length} clean (non-chargeback) records for ${filename}`)
    }

    if (filteredRecords.length === 0) {
      const errorMsg = type === 'chargebacks' 
        ? 'No chargebacks found for this file'
        : 'No clean transactions found for this file'
      return NextResponse.json(
        { error: errorMsg, success: false },
        { status: 404 }
      )
    }

    // Build CSV content from filtered records
    let csvContent = headers.join(',') + '\n'
    
    for (const record of filteredRecords) {
      const values = headers.map((header: string) => {
        const value = record[header] || ''
        // Escape values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      csvContent += values.join(',') + '\n'
    }
    
    console.log(`[Chargeback CSV Export] CSV generated with ${filteredRecords.length} rows`)

    // Create response with CSV
    const filenameSuffix = type === 'chargebacks' ? '_chargebacks' : '_clean'
    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}${filenameSuffix}.csv"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    return response

  } catch (error: any) {
    console.error('[Chargeback CSV Export] Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to export CSV'
      },
      { status: 500 }
    )
  }
}

