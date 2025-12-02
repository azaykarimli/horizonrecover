import { NextRequest, NextResponse } from 'next/server'
import { refreshAnalytics } from '@/lib/services/analytics-sync'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        // 1. Verify Admin Session
        const session = await getSession()
        if (!session || session.role !== 'superOwner') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log(`[Admin API] Manual analytics refresh triggered by ${session.email}`)

        // 2. Run Sync
        const result = await refreshAnalytics()

        return NextResponse.json({
            success: result.success,
            message: 'Analytics refresh completed successfully',
            details: result
        })

    } catch (error: any) {
        console.error('[Admin API] Refresh error:', error)
        return NextResponse.json({
            error: error.message || 'Failed to refresh analytics'
        }, { status: 500 })
    }
}
