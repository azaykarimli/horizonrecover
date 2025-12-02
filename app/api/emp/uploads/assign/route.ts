import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession, getOrganizationFilter } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/emp/uploads/assign
 * 
 * Assign or reassign uploads to an organization (agency/account)
 * - Super Owner can assign to any organization
 * - Agency Admin can assign within their agency only
 * 
 * SECURITY: Agency admins cannot assign to accounts outside their agency
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    
    const body = await req.json()
    const { uploadIds, agencyId, accountId } = body
    
    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return NextResponse.json({ error: 'uploadIds array is required' }, { status: 400 })
    }
    
    if (session.role !== 'superOwner' && session.role !== 'agencyAdmin') {
      return NextResponse.json({ 
        error: 'Only Super Owner or Agency Admin can assign uploads' 
      }, { status: 403 })
    }
    
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const accounts = db.collection('accounts')
    
    // Agency Admin validation - must stay within their own agency
    if (session.role === 'agencyAdmin') {
      // Agency admins can only use their own agencyId (or clear it)
      if (agencyId && agencyId !== session.agencyId) {
        return NextResponse.json({ 
          error: 'You can only assign uploads within your agency' 
        }, { status: 403 })
      }
      
      // If assigning to an account, verify the account belongs to their agency
      if (accountId) {
        const account = await accounts.findOne({ _id: new ObjectId(accountId) })
        if (!account) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }
        if (account.agencyId.toString() !== session.agencyId) {
          return NextResponse.json({ 
            error: 'You can only assign to accounts within your agency' 
          }, { status: 403 })
        }
      }
    }
    
    // Super Owner validation - if assigning accountId, verify it belongs to the specified agencyId
    if (session.role === 'superOwner' && accountId && agencyId) {
      const account = await accounts.findOne({ _id: new ObjectId(accountId) })
      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }
      if (account.agencyId.toString() !== agencyId) {
        return NextResponse.json({ 
          error: 'Account does not belong to the specified agency' 
        }, { status: 400 })
      }
    }
    
    const objectIds = uploadIds.map((id: string) => new ObjectId(id))
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
      assignedBy: session.email,
      assignedAt: new Date(),
    }
    
    // For Agency Admin: always use their agencyId when assigning to an account
    if (session.role === 'agencyAdmin' && accountId) {
      updateData.agencyId = session.agencyId
      updateData.accountId = accountId
    } else {
      if (agencyId !== undefined) {
        updateData.agencyId = agencyId || null
      }
      if (accountId !== undefined) {
        updateData.accountId = accountId || null
      }
    }
    
    // Build filter - Super Owner can update any, Agency Admin only their agency's or unassigned
    const filter: any = { _id: { $in: objectIds } }
    if (session.role === 'agencyAdmin') {
      filter.$or = [
        { agencyId: session.agencyId },
        { agencyId: null },
        { agencyId: { $exists: false } }
      ]
    }
    
    const result = await uploads.updateMany(filter, { $set: updateData })
    
    return NextResponse.json({ 
      ok: true, 
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    })
  } catch (err: any) {
    console.error('[Assign Upload] Error:', err)
    return NextResponse.json({ 
      error: err?.message || 'Failed to assign uploads' 
    }, { status: 500 })
  }
}
