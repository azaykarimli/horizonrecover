import { NextResponse } from 'next/server'
import { voidTransaction } from '@/lib/emerchantpay-void'
import { requireWriteAccess } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/emp/void-manual
 * 
 * Manually void a single transaction by unique_id
 * Only Super Owner can void transactions
 */
export async function POST(req: Request) {
  try {
    await requireWriteAccess()
    
    const body = await req.json()
    const { uniqueId, transactionId } = body

    if (!uniqueId) {
      return NextResponse.json({ 
        error: 'uniqueId is required' 
      }, { status: 400 })
    }

    console.log(`[Manual Void] Voiding transaction: uniqueId=${uniqueId}, transactionId=${transactionId}`)

    const voidResponse = await voidTransaction({
      transactionId: transactionId || `manual-void-${Date.now()}`,
      referenceId: uniqueId,
      usage: 'Manual void',
      remoteIp: '8.8.8.8',
    })

    if (voidResponse.ok && voidResponse.status === 'approved') {
      return NextResponse.json({
        ok: true,
        message: 'Transaction voided successfully',
        voidUniqueId: voidResponse.uniqueId,
        status: voidResponse.status,
      })
    } else {
      return NextResponse.json({
        ok: false,
        error: voidResponse.message || voidResponse.technicalMessage || 'Void failed',
        status: voidResponse.status,
      }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[Manual Void] Error:', err)
    return NextResponse.json({ 
      error: err?.message || 'Failed to void transaction' 
    }, { status: 500 })
  }
}



