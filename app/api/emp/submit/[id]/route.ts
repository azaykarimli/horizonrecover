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

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    await requireWriteAccess()

    const { id } = ctx.params
    const body = await req.json().catch(() => ({})) as { dryRun?: boolean; selection?: number[] }
    const dryRun = !!body?.dryRun
    const selection = Array.isArray(body?.selection) ? new Set(body.selection) : null

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const settings = db.collection('settings')
    const accounts = db.collection('accounts')

    const doc = await uploads.findOne({ _id: new ObjectId(id) }) as any
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
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records to submit' }, { status: 400 })
    }

    // Ensure rows[] exists with status
    const rows = (doc.rows && Array.isArray(doc.rows) && doc.rows.length === records.length)
      ? doc.rows
      : records.map(() => ({ status: 'pending', attempts: 0 }))

    // Concurrency-limited submission with error stop
    const limit = 3
    let inFlight = 0
    let cursor = 0
    let submitted = 0
    let shouldStop = false
    let firstError: { rowIndex: number; message: string; technicalMessage?: string } | null = null

    const results: any[] = []
    const runNext = async (): Promise<void> => {
      if (cursor >= records.length || shouldStop) return
      const i = cursor++
      if (selection && !selection.has(i)) {
        return runNext()
      }

      const record = records[i]
      let request
      try {
        request = mapRecordToSddSale(record, i, customMapping, doc.originalFilename || doc.filename, companyConfig)
      } catch (validationError: any) {
        rows[i].status = 'error'
        rows[i].emp = { message: validationError?.message || 'Validation failed' }
        rows[i].attempts = (rows[i].attempts || 0) + 1
        rows[i].lastAttemptAt = new Date()

        shouldStop = true
        firstError = {
          rowIndex: i,
          message: validationError?.message || 'Validation failed',
        }

        submitted++
        await uploads.updateOne({ _id: doc._id }, {
          $set: { rows, updatedAt: new Date() },
        })
        return
      }

      const rowState = rows[i] || { status: 'pending', attempts: 0 }
      rows[i] = rowState

      const baseTransactionId = rowState.baseTransactionId || stripRetrySuffix(request.transactionId)
      rowState.baseTransactionId = baseTransactionId

      const maxDuplicateRetries = 3
      let retryCount = typeof rowState.retryCount === 'number' && rowState.retryCount > 0 ? rowState.retryCount : 0
      let duplicateAttempts = 0
      let finalResponse: SddSaleResponse | null = null
      let finalError: any = null
      let currentRequest = request
      let usedExistingTransaction = false

      while (true) {
        const transactionIdForAttempt = buildRetryTransactionId(baseTransactionId, retryCount)
        if (transactionIdForAttempt !== currentRequest.transactionId) {
          currentRequest = { ...currentRequest, transactionId: transactionIdForAttempt }
        }

        rowState.retryCount = retryCount
        rowState.attempts = (rowState.attempts || 0) + 1
        rowState.lastAttemptAt = new Date()
        rowState.request = { ...currentRequest, iban: maskIban(currentRequest.iban) }
        rowState.status = dryRun ? 'pending' : 'submitted'

        if (dryRun) {
          try {
            console.info('[EMP] dry-run row', { i, transactionId: currentRequest.transactionId, amountMinor: currentRequest.amountMinor, currency: currentRequest.currency, iban: maskIban(currentRequest.iban) })
          } catch { }
          submitted++
          results.push({ i, dryRun: true, transactionId: currentRequest.transactionId })
          return runNext()
        }

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
            usedExistingTransaction = true
            finalResponse = {
              ok: true,
              status: rowState.status,
              uniqueId: reconciliation.uniqueId,
              message: reconciliation.message || finalResponse?.message,
              technicalMessage: reconciliation.technicalMessage,
            }
            break
          }

          retryCount += 1
          duplicateAttempts += 1
          rowState.retryCount = retryCount
          rowState.duplicateRetries = duplicateAttempts

          try {
            console.warn('[EMP] duplicate transaction_id, retrying with suffix', {
              rowIndex: i,
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
        break
      }

      rowState.lastTransactionId = currentRequest.transactionId

      submitted++
      results.push({
        i,
        ok: rowState.status !== 'error',
        status: rowState.status,
        uniqueId: rowState.emp?.uniqueId,
        transactionId: currentRequest.transactionId,
        duplicateRetries: duplicateAttempts,
        usedExistingTransaction,
      })

      if (rowState.status === 'error') {
        shouldStop = true
        firstError = {
          rowIndex: i,
          message: rowState.emp?.message || 'Submit failed',
          technicalMessage: rowState.emp?.technicalMessage,
        }
      }

      await uploads.updateOne({ _id: doc._id }, {
        $set: {
          rows,
          updatedAt: new Date(),
        },
      })

      if (cursor < records.length && !shouldStop) await runNext()
    }

    const starters = Array.from({ length: limit }).map(async () => {
      inFlight++
      try { await runNext() } finally { inFlight-- }
    })
    await Promise.all(starters)

    // Update top-level counts
    const approvedCount = rows.filter((r: any) => r.status === 'approved').length
    const errorCount = rows.filter((r: any) => r.status === 'error').length
    await uploads.updateOne({ _id: doc._id }, { $set: { rows, approvedCount, errorCount, updatedAt: new Date() } })

    // Return error if stopped
    if (firstError) {
      const err = firstError as { rowIndex: number; message: string; technicalMessage?: string }
      return NextResponse.json({
        ok: false,
        submitted,
        stopped: true,
        error: {
          rowIndex: err.rowIndex,
          message: err.message,
          technicalMessage: err.technicalMessage,
        },
        results,
      }, { status: 400 })
    }

    return NextResponse.json({ ok: true, submitted, results })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


