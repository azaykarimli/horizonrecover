import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 800 // 800 seconds for bulk processing
import { getMongoClient, getDbName } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { mapRecordToSddSale, type FieldMapping, stripRetrySuffix, buildRetryTransactionId, type CompanyConfig } from '@/lib/emp'
import { submitSddSale, maskIban, type SddSaleResponse } from '@/lib/emerchantpay'
import { reconcileTransaction } from '@/lib/emerchantpay-reconcile'
import { requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'

const APPROVED_STATUSES = new Set(['approved', 'success', 'successful'])
const PENDING_STATUSES = new Set(['pending', 'in_progress', 'processing', 'pending_async', 'created'])

function isDuplicateTransactionError(res?: SddSaleResponse | null, err?: any): boolean {
  const messages: string[] = []
  if (res?.message) messages.push(res.message)
  if (res?.technicalMessage) messages.push(res.technicalMessage)
  if (err?.message) messages.push(err.message)

  return messages.some((raw) => {
    const msg = (raw || '').toLowerCase()
    if (!msg) return false
    if (msg.includes('transaction id') && msg.includes('already')) return true
    if (msg.includes('transaction_id') && msg.includes('already')) return true
    if (msg.includes('duplicate transaction')) return true
    if (msg.includes('duplicate') && msg.includes('transactionid')) return true
    return false
  })
}

/**
 * POST /api/emp/submit-batch/[id]
 * Bulk submission - processes ALL records in one go
 * - High concurrency (20 parallel requests)
 * - Progress tracking via periodic DB updates
 * - 800s timeout limit
 * Only Super Owner can submit to gateway
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()

  try {
    await requireWriteAccess()

    const { id } = await ctx.params

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const settings = db.collection('settings')
    const accounts = db.collection('accounts')

    const doc = await uploads.findOne({ _id: new ObjectId(id) }) as any
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!doc.records || !Array.isArray(doc.records)) {
      return NextResponse.json({ error: 'Invalid upload: no records found' }, { status: 400 })
    }

    // Load field mapping
    const settingsDoc = await settings.findOne({ _id: 'field-mapping' as any })
    const customMapping = settingsDoc?.mapping as FieldMapping | null

    // Fetch account settings if assigned
    let companyConfig: CompanyConfig | null = null
    if (doc.accountId) {
      const account = await accounts.findOne({ _id: new ObjectId(doc.accountId) }) as any
      if (account) {
        companyConfig = {
          name: account.name,
          contactEmail: account.contactEmail,
          returnUrls: account.returnUrls,
          dynamicDescriptor: account.dynamicDescriptor,
          fallbackDescription: account.fallbackDescription,
        }
      }
    }

    const records: Record<string, string>[] = doc.records || []
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records to submit' }, { status: 400 })
    }

    // Ensure rows[] exists
    const rows = (doc.rows && Array.isArray(doc.rows) && doc.rows.length === records.length)
      ? doc.rows
      : records.map(() => ({ status: 'pending', attempts: 0 }))

    // Get all rows that need processing (skip already approved)
    const rowsToProcess = records
      .map((_, i) => i)
      .filter(i => rows[i]?.status !== 'approved')

    if (rowsToProcess.length === 0) {
      const approvedCount = rows.filter((r: any) => r.status === 'approved').length
      const errorCount = rows.filter((r: any) => r.status === 'error').length

      return NextResponse.json({
        ok: true,
        message: 'All records already processed',
        processed: 0,
        total: records.length,
        approved: approvedCount,
        errors: errorCount,
        pending: 0,
      })
    }

    console.log(`[Bulk] Starting bulk submission: ${rowsToProcess.length} records to process`)

    // High concurrency bulk processing (20 parallel requests)
    const CONCURRENCY = 20
    const errors: Array<{ rowIndex: number; message: string }> = []
    let processed = 0
    let lastDbUpdate = Date.now()
    const DB_UPDATE_INTERVAL = 5000 // Update DB every 5 seconds

    const processRow = async (rowIndex: number): Promise<void> => {
      const record = records[rowIndex]

      let request
      try {
        request = mapRecordToSddSale(record, rowIndex, customMapping, doc.originalFilename || doc.filename, companyConfig)
      } catch (validationError: any) {
        const rowState = rows[rowIndex]
        rowState.status = 'error'
        rowState.emp = { message: validationError?.message || 'Validation failed' }
        rowState.attempts = (rowState.attempts || 0) + 1
        rowState.lastAttemptAt = new Date()
        errors.push({ rowIndex, message: validationError?.message || 'Validation failed' })
        return
      }

      const rowState = rows[rowIndex]
      const baseTransactionId = rowState.baseTransactionId || stripRetrySuffix(request.transactionId)
      rowState.baseTransactionId = baseTransactionId

      const maxDuplicateRetries = 3
      let retryCount = typeof rowState.retryCount === 'number' && rowState.retryCount > 0 ? rowState.retryCount : 0
      let duplicateAttempts = 0
      let finalResponse: SddSaleResponse | null = null
      let finalError: any = null
      let currentRequest = request
      let resolvedViaExisting = false

      while (true) {
        const transactionIdForAttempt = buildRetryTransactionId(baseTransactionId, retryCount)
        if (transactionIdForAttempt !== currentRequest.transactionId) {
          currentRequest = { ...currentRequest, transactionId: transactionIdForAttempt }
        }

        rowState.retryCount = retryCount
        rowState.attempts = (rowState.attempts || 0) + 1
        rowState.lastAttemptAt = new Date()
        rowState.request = { ...currentRequest, iban: maskIban(currentRequest.iban) }
        rowState.status = 'submitted'

        try {
          finalResponse = await submitSddSale(currentRequest)
          finalError = null
        } catch (err: any) {
          finalError = err
          finalResponse = null
        }

        if (finalResponse?.ok) {
          rowState.emp = {
            uniqueId: finalResponse.uniqueId,
            redirectUrl: finalResponse.redirectUrl,
            message: finalResponse.message,
            technicalMessage: finalResponse.technicalMessage,
          }
          rowState.status = finalResponse.status === 'approved' ? 'approved' : 'submitted'
          break
        }

        const duplicate = isDuplicateTransactionError(finalResponse, finalError)
        if (duplicate) {
          let reconciliation
          try {
            reconciliation = await reconcileTransaction({ transactionId: transactionIdForAttempt })
          } catch (reconError: any) {
            reconciliation = { ok: false, message: reconError?.message } as any
          }

          const reconStatus = (reconciliation?.status || '').toLowerCase()
          const isReconApproved = reconciliation?.ok && APPROVED_STATUSES.has(reconStatus)
          const isReconPending = reconciliation?.ok && PENDING_STATUSES.has(reconStatus)

          if (isReconApproved || isReconPending) {
            rowState.emp = {
              uniqueId: reconciliation.uniqueId,
              message: reconciliation.message || finalResponse?.message,
              technicalMessage: reconciliation.technicalMessage,
            }
            rowState.empStatus = reconciliation.status
            rowState.status = isReconApproved ? 'approved' : 'submitted'
            resolvedViaExisting = true
            break
          }

          retryCount += 1
          duplicateAttempts += 1
          rowState.retryCount = retryCount
          rowState.duplicateRetries = duplicateAttempts

          try {
            console.warn('[Bulk] duplicate transaction_id, retrying with suffix', {
              rowIndex,
              previousTransactionId: transactionIdForAttempt,
              nextTransactionId: buildRetryTransactionId(baseTransactionId, retryCount),
              duplicateAttempts,
            })
          } catch { }

          if (duplicateAttempts > maxDuplicateRetries) {
            const message = finalResponse?.message || finalError?.message || 'Duplicate transaction_id after retries'
            rowState.status = 'error'
            rowState.emp = {
              message,
              technicalMessage: finalResponse?.technicalMessage || finalError?.stack,
            }
            errors.push({ rowIndex, message })
            break
          }

          continue
        }

        const message = finalResponse?.message || finalError?.message || 'Submit failed'
        rowState.status = 'error'
        rowState.emp = {
          message,
          technicalMessage: finalResponse?.technicalMessage || finalError?.stack,
          uniqueId: finalResponse?.uniqueId,
        }
        errors.push({ rowIndex, message })
        break
      }

      rowState.lastTransactionId = currentRequest.transactionId

      if (!resolvedViaExisting && finalResponse && !finalResponse.ok && rowState.status !== 'error') {
        // Ensure errors capture any non-success state that slipped through
        errors.push({ rowIndex, message: finalResponse.message || 'Submit failed' })
      }

      processed++

      // Periodic DB update for progress tracking
      const now = Date.now()
      if (now - lastDbUpdate > DB_UPDATE_INTERVAL) {
        lastDbUpdate = now
        await uploads.updateOne({ _id: doc._id }, {
          $set: { rows, updatedAt: new Date() },
        }).catch(err => console.error('[Bulk] DB update error:', err))

        console.log(`[Bulk] Progress: ${processed}/${rowsToProcess.length} (${Math.round(processed / rowsToProcess.length * 100)}%)`)
      }
    }

    // Process all rows with controlled concurrency
    const chunks: number[][] = []
    for (let i = 0; i < rowsToProcess.length; i += CONCURRENCY) {
      chunks.push(rowsToProcess.slice(i, i + CONCURRENCY))
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(processRow))
    }

    // Final update with counts
    const approvedCount = rows.filter((r: any) => r.status === 'approved').length
    const errorCount = rows.filter((r: any) => r.status === 'error').length
    const pendingCount = rows.filter((r: any) => r.status === 'pending').length

    await uploads.updateOne({ _id: doc._id }, {
      $set: {
        rows,
        approvedCount,
        errorCount,
        updatedAt: new Date(),
      }
    })

    const runtime = Date.now() - startTime
    console.log(`[Bulk] Complete: ${processed} processed, ${approvedCount} approved, ${errorCount} errors, ${runtime}ms`)

    return NextResponse.json({
      ok: true,
      processed,
      total: records.length,
      approved: approvedCount,
      errors: errorCount,
      pending: pendingCount,
      errorDetails: errors.slice(0, 20), // Return first 20 errors for debugging
      runtime,
    })
  } catch (err: any) {
    console.error('[Bulk] Fatal error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

