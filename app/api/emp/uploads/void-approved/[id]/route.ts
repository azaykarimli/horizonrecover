import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { voidTransaction } from '@/lib/emerchantpay-void'
import { requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/emp/uploads/void-approved/[id]
 * 
 * Voids all approved transactions in an upload
 * This cancels transactions before they are finalized
 * Only Super Owner can void transactions
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireWriteAccess()
    
    const { id } = ctx.params

    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')

    // Get the upload document
    const doc = await uploads.findOne({ _id: new ObjectId(id) }) as any
    if (!doc) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const rows: any[] = doc.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: 'No rows to void',
      })
    }

    console.log(`[Void Approved] Processing upload ${id} with ${rows.length} rows`)

    // Find all approved rows with uniqueId
    const approvedRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.status === 'approved' && row.emp?.uniqueId)

    console.log(`[Void Approved] Found ${approvedRows.length} approved transactions to void`)

    if (approvedRows.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No approved transactions to void',
        voidedCount: 0,
        failedCount: 0,
      })
    }

    let voidedCount = 0
    let failedCount = 0
    const results: any[] = []

    // Process voids sequentially to avoid rate limiting
    for (const { row, index } of approvedRows) {
      const uniqueId = row.emp?.uniqueId
      const transactionId = row.lastTransactionId || row.baseTransactionId || row.request?.transactionId
      
      if (!uniqueId || !transactionId) {
        console.warn(`[Void Approved] Skipping row ${index}: missing uniqueId or transactionId`)
        failedCount++
        results.push({
          index,
          success: false,
          error: 'Missing uniqueId or transactionId',
        })
        continue
      }

      try {
        console.log(`[Void Approved] Voiding row ${index}: transactionId=${transactionId}, uniqueId=${uniqueId}`)
        
        const voidResponse = await voidTransaction({
          transactionId: `${transactionId}-void-${Date.now()}`, // Unique void transaction ID
          referenceId: uniqueId, // Reference to original transaction
          usage: 'Void transaction - uploaded with chargebacks',
          remoteIp: row.request?.remoteIp || '8.8.8.8',
        })

        if (voidResponse.ok && voidResponse.status === 'approved') {
          // Update row status to voided
          rows[index].status = 'voided'
          rows[index].voidedAt = new Date()
          rows[index].voidResponse = {
            uniqueId: voidResponse.uniqueId,
            message: voidResponse.message,
            status: voidResponse.status,
          }
          voidedCount++
          results.push({
            index,
            success: true,
            voidUniqueId: voidResponse.uniqueId,
          })
        } else {
          rows[index].voidFailed = true
          rows[index].voidError = voidResponse.message || voidResponse.technicalMessage
          failedCount++
          results.push({
            index,
            success: false,
            error: voidResponse.message || voidResponse.technicalMessage,
          })
        }
      } catch (err: any) {
        console.error(`[Void Approved] Error voiding row ${index}:`, err)
        rows[index].voidFailed = true
        rows[index].voidError = err.message
        failedCount++
        results.push({
          index,
          success: false,
          error: err.message,
        })
      }

      // Small delay between voids to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Recalculate counts
    const approvedCount = rows.filter((r: any) => r.status === 'approved').length
    const voidedRowCount = rows.filter((r: any) => r.status === 'voided').length

    // Update the upload document
    await uploads.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          rows,
          approvedCount,
          voidedCount: voidedRowCount,
          updatedAt: new Date(),
        },
      }
    )

    console.log(`[Void Approved] Completed: ${voidedCount} voided, ${failedCount} failed`)

    return NextResponse.json({
      ok: true,
      message: `Voided ${voidedCount} transaction(s), ${failedCount} failed`,
      voidedCount,
      failedCount,
      totalProcessed: approvedRows.length,
      results,
    })
  } catch (err: any) {
    console.error('[Void Approved] Error:', err)
    return NextResponse.json({ 
      error: err?.message || 'Failed to void transactions' 
    }, { status: 500 })
  }
}



