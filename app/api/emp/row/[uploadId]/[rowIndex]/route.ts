import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
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

export async function POST(_req: Request, ctx: { params: { uploadId: string; rowIndex: string } }) {
  try {
    await requireWriteAccess()

    const uploadId = ctx.params.uploadId
    const rowIndex = parseInt(ctx.params.rowIndex, 10)
    if (Number.isNaN(rowIndex)) return NextResponse.json({ error: 'Invalid row index' }, { status: 400 })

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const settings = db.collection('settings')
    const accounts = db.collection('accounts')

    const doc = await uploads.findOne({ _id: new ObjectId(uploadId) }) as any
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    if (!records[rowIndex]) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

    const rows = (doc.rows && Array.isArray(doc.rows) && doc.rows.length === records.length)
      ? doc.rows
      : records.map(() => ({ status: 'pending', attempts: 0 }))

    let request
    try {
      request = mapRecordToSddSale(records[rowIndex], rowIndex, customMapping, doc.originalFilename || doc.filename, companyConfig)
    } catch (validationError: any) {
      rows[rowIndex].status = 'error'
      rows[rowIndex].emp = { message: validationError?.message || 'Validation failed' }
      rows[rowIndex].attempts = (rows[rowIndex].attempts || 0) + 1
      rows[rowIndex].lastAttemptAt = new Date()
      await uploads.updateOne({ _id: doc._id }, { $set: { rows, updatedAt: new Date() } })
      return NextResponse.json({ ok: false, error: validationError?.message || 'Validation failed', row: rows[rowIndex] }, { status: 400 })
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
        console.info('[EMP] submit single row', {
          rowIndex,
          transactionId: currentRequest.transactionId,
          amountMinor: currentRequest.amountMinor,
          currency: currentRequest.currency,
          iban: maskIban(currentRequest.iban),
          retryCount,
        })
      } catch { }

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
            resolvedViaExisting: true,
          }
          rowState.empStatus = reconciliation.status
          rowState.status = isReconApproved ? 'approved' : 'submitted'
          resolvedViaExisting = true
          try {
            console.info('[EMP] reused existing transaction for row', {
              rowIndex,
              transactionId: transactionIdForAttempt,
              status: reconciliation.status,
            })
          } catch { }
          break
        }

        retryCount += 1
        duplicateAttempts += 1
        rowState.retryCount = retryCount
        rowState.duplicateRetries = duplicateAttempts

        try {
          console.warn('[EMP] duplicate transaction_id on single row, retrying', {
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
          try {
            console.error('[EMP] duplicate transaction_id retry limit reached', {
              rowIndex,
              transactionId: transactionIdForAttempt,
              duplicateAttempts,
            })
          } catch { }
          break
        }

        continue
      }

      const message = finalResponse?.message || finalError?.message || 'Submit failed'
      try {
        console.error('[EMP] submit single error', { rowIndex, transactionId: currentRequest.transactionId, message })
      } catch { }
      rowState.status = 'error'
      rowState.emp = {
        message,
        technicalMessage: finalResponse?.technicalMessage || finalError?.stack,
        uniqueId: finalResponse?.uniqueId,
      }
      break
    }

    rowState.lastTransactionId = currentRequest.transactionId

    await uploads.updateOne({ _id: doc._id }, { $set: { rows, updatedAt: new Date() } })

    const ok = rowState.status !== 'error'
    const responseBody: any = {
      ok,
      row: rows[rowIndex],
      resolvedViaExisting,
      duplicateRetries: rowState.duplicateRetries || 0,
    }

    if (!ok) {
      responseBody.error = rowState.emp?.message || 'Submit failed'
    }

    return NextResponse.json(responseBody, { status: ok ? 200 : 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
