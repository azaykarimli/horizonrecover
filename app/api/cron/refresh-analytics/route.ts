import { NextRequest, NextResponse } from 'next/server'
import { refreshAnalytics } from '@/lib/services/analytics-sync'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron Job: Refresh Analytics Dashboard
 * 
 * Runs every 2 hours to automatically sync transactions and chargebacks
 * from emerchantpay API to the local cache.
 * 
 * This performs the same action as clicking "Refresh Data" on the analytics page.
 */

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Cron] Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting scheduled analytics refresh...')

  try {
    const result = await refreshAnalytics()

    return NextResponse.json({
      success: result.success,
      message: 'Analytics refresh completed',
      dateRange: result.dateRange,
      results: result.results,
      duration: `${result.duration}ms`,
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}


