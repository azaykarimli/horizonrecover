import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/emp/uploads/filter-chargebacks/[id]
 * 
 * Removes rows from upload that have IBANs matching chargebacks in cache
 * Only Super Owner can filter uploads
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireWriteAccess()

    const { id } = ctx.params

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const chargebacksCollection = db.collection('emp_chargebacks')
    const reconcileCollection = db.collection('emp_reconcile_transactions')

    // Get the upload document
    const doc = await uploads.findOne({ _id: new ObjectId(id) }) as any
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const records: Record<string, string>[] = doc.records || []
    const rows: any[] = doc.rows || []

    if (records.length === 0) {
      return NextResponse.json({ error: 'No records in upload' }, { status: 400 })
    }

    console.log(`[Filter Chargebacks] Processing upload ${id} with ${records.length} records`)

    // Step 1: Get all chargebacks from cache
    const allChargebacks = await chargebacksCollection.find({}).toArray()
    console.log(`[Filter Chargebacks] Found ${allChargebacks.length} chargebacks in cache`)

    if (allChargebacks.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No chargebacks in cache to filter',
        removedCount: 0,
        remainingCount: records.length,
      })
    }

    // Step 2: Get originalTransactionUniqueIds from chargebacks
    const originalTransactionUniqueIds = new Set(
      allChargebacks
        .map(cb => cb.originalTransactionUniqueId || cb.original_transaction_unique_id)
        .filter(Boolean)
    )

    console.log(`[Filter Chargebacks] Looking up ${originalTransactionUniqueIds.size} original transaction IDs`)

    // Step 3: Look up original transactions to get bankAccountNumber/cardNumber
    const originalTransactions = await reconcileCollection
      .find({ uniqueId: { $in: Array.from(originalTransactionUniqueIds) } })
      .toArray()

    console.log(`[Filter Chargebacks] Found ${originalTransactions.length} original transactions`)

    // Step 4: Extract bankAccountNumber or cardNumber from original transactions
    const chargebackAccounts = new Set<string>()

    for (const tx of originalTransactions) {
      // Get bankAccountNumber (this is the IBAN for SEPA transactions)
      const account = tx.bankAccountNumber || tx.bank_account_number || tx.cardNumber || tx.card_number

      if (account && typeof account === 'string') {
        // Normalize (remove spaces, uppercase)
        const normalized = account.replace(/\s+/g, '').toUpperCase()
        if (normalized.length > 0) {
          chargebackAccounts.add(normalized)
        }
      }
    }

    console.log(`[Filter Chargebacks] Extracted ${chargebackAccounts.size} unique account numbers with chargebacks`)

    // Debug: Show sample accounts
    if (chargebackAccounts.size > 0) {
      const sampleAccounts = Array.from(chargebackAccounts).slice(0, 3).map(acc =>
        acc.length > 8 ? `${acc.substring(0, 4)}****${acc.substring(acc.length - 4)}` : `${acc.substring(0, 2)}****`
      )
      console.log(`[Filter Chargebacks] Sample account numbers:`, sampleAccounts)
    }

    if (chargebackAccounts.size === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No account numbers found in chargeback data',
        removedCount: 0,
        remainingCount: records.length,
      })
    }

    // Step 5: Find IBAN field in CSV records (case-insensitive)
    const possibleCsvIbanFields = [
      'iban', 'Iban', 'IBAN',
      'customer_iban', 'customeriban', 'CustomerIban',
      'billing_iban', 'billingiban',
      'account', 'Account', 'ACCOUNT'
    ]
    let ibanFieldName = ''

    // Check first record for IBAN field (case-insensitive)
    if (records.length > 0) {
      const firstRecord = records[0]
      const keys = Object.keys(firstRecord)

      console.log(`[Filter Chargebacks] CSV has fields:`, keys)

      // Try to find IBAN field (case-insensitive)
      for (const field of possibleCsvIbanFields) {
        const foundKey = keys.find(k => k.toLowerCase() === field.toLowerCase())
        if (foundKey) {
          ibanFieldName = foundKey
          break
        }
      }

      // If still not found, look for any field containing 'iban'
      if (!ibanFieldName) {
        const ibanKey = keys.find(k => k.toLowerCase().includes('iban'))
        if (ibanKey) {
          ibanFieldName = ibanKey
        }
      }
    }

    if (!ibanFieldName) {
      return NextResponse.json({
        error: `No IBAN field found in CSV. Available fields: ${Object.keys(records[0] || {}).join(', ')}`
      }, { status: 400 })
    }

    console.log(`[Filter Chargebacks] Using IBAN field: ${ibanFieldName}`)

    // Step 6: Filter out rows with matching IBANs
    const remainingRecords: Record<string, string>[] = []
    const remainingRows: any[] = []
    const removedRecords: Record<string, string>[] = []
    let removedCount = 0

    console.log(`[Filter Chargebacks] Starting to filter ${records.length} records...`)

    // Sample first 3 CSV IBANs for debugging
    if (records.length > 0) {
      const sampleCsvIbans = records.slice(0, 3).map(r => {
        const iban = r[ibanFieldName] || ''
        const normalized = iban.replace(/\s+/g, '').toUpperCase()
        return normalized.length > 8 ? `${normalized.substring(0, 4)}****${normalized.substring(normalized.length - 4)}` : normalized
      })
      console.log(`[Filter Chargebacks] Sample CSV IBANs:`, sampleCsvIbans)
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const iban = record[ibanFieldName] || ''
      const normalizedIban = iban.replace(/\s+/g, '').toUpperCase()

      if (normalizedIban && chargebackAccounts.has(normalizedIban)) {
        // This IBAN has chargebacks - remove it
        removedRecords.push(record)
        removedCount++
        if (removedCount <= 5) {
          // Log first 5 removals
          console.log(`[Filter Chargebacks] Removing row ${i} with IBAN ${normalizedIban.substring(0, 4)}****`)
        }
      } else {
        // Keep this row
        remainingRecords.push(record)
        if (rows[i]) {
          remainingRows.push(rows[i])
        }
      }
    }

    console.log(`[Filter Chargebacks] Removed ${removedCount} rows, ${remainingRecords.length} remaining`)

    // Step 7: Update the upload document
    await uploads.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          records: remainingRecords,
          rows: remainingRows,
          recordCount: remainingRecords.length,
          filteredRecords: removedRecords, // Save filtered records
          filteredRows: removedRecords.map((_, idx) => rows.find(r => r === removedRecords[idx]) || {}), // Best effort to map back to rows if needed, or just save removedRecords if rows structure matches
          updatedAt: new Date(),
          chargebackFilteredAt: new Date(),
          chargebackFilterStats: {
            originalCount: records.length,
            removedCount,
            remainingCount: remainingRecords.length,
            chargebackAccountsChecked: chargebackAccounts.size,
          },
        },
      }
    )

    return NextResponse.json({
      ok: true,
      message: `Removed ${removedCount} row(s) with chargebacks`,
      removedCount,
      remainingCount: remainingRecords.length,
      originalCount: records.length,
      chargebackAccountsChecked: chargebackAccounts.size,
    })
  } catch (err: any) {
    console.error('[Filter Chargebacks] Error:', err)
    return NextResponse.json({
      error: err?.message || 'Failed to filter chargebacks'
    }, { status: 500 })
  }
}

