import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { getMongoClient, getDbName } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const showUnassigned = searchParams.get('unassigned') === 'true'
    const filterAgencyId = searchParams.get('agencyId')
    const filterAccountId = searchParams.get('accountId')
    
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const uploads = db.collection('uploads')
    const agencies = db.collection('agencies')
    const accounts = db.collection('accounts')
    
    // Build filter based on role and query params
    let filter: any = {}
    
    // Super Owner sees all, can filter by org
    if (session.role === 'superOwner') {
      if (showUnassigned) {
        filter.$and = [
          { $or: [{ agencyId: null }, { agencyId: { $exists: false } }] },
          { $or: [{ accountId: null }, { accountId: { $exists: false } }] }
        ]
      } else if (filterAgencyId) {
        filter.agencyId = filterAgencyId
        if (filterAccountId) {
          filter.accountId = filterAccountId
        }
      } else if (filterAccountId) {
        filter.accountId = filterAccountId
      }
    } 
    // Agency roles see their agency's uploads + unassigned within agency scope
    else if (session.role === 'agencyAdmin' || session.role === 'agencyViewer') {
      if (showUnassigned) {
        // SECURITY: Agency admins can only see unassigned uploads within their agency
        // They see uploads that: belong to their agency but have no account assigned
        filter.agencyId = session.agencyId
        filter.$or = [
          { accountId: null },
          { accountId: { $exists: false } }
        ]
      } else if (filterAccountId) {
        // Filtering by specific account within their agency
        filter.agencyId = session.agencyId
        filter.accountId = filterAccountId
      } else {
        // Show all uploads: their agency's + globally unassigned (available to claim)
        filter.$or = [
          { agencyId: session.agencyId },
          { 
            $and: [
              { $or: [{ agencyId: null }, { agencyId: { $exists: false } }] },
              { $or: [{ accountId: null }, { accountId: { $exists: false } }] }
            ]
          }
        ]
      }
    }
    // Account roles see only their account's uploads
    else if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
      filter.accountId = session.accountId
    }
    
    // Add search query
    if (q) {
      filter.filename = { $regex: q, $options: 'i' }
    }
    
    const docs = await uploads
      .find(filter, { projection: { records: 0 } })
      .sort({ createdAt: -1, partNumber: 1 })
      .limit(100)
      .toArray()
    
    // Fetch agency and account names for display
    const agencyIds = [...new Set(docs.map(d => d.agencyId).filter(Boolean))]
    const accountIds = [...new Set(docs.map(d => d.accountId).filter(Boolean))]
    
    const agencyDocs = agencyIds.length > 0 
      ? await agencies.find({ _id: { $in: agencyIds.map(id => new ObjectId(id)) } }).toArray()
      : []
    const accountDocs = accountIds.length > 0
      ? await accounts.find({ _id: { $in: accountIds.map(id => new ObjectId(id)) } }).toArray()
      : []
    
    const agencyMap = Object.fromEntries(agencyDocs.map(a => [a._id.toString(), a.name]))
    const accountMap = Object.fromEntries(accountDocs.map(a => [a._id.toString(), a.name]))
    
    const items = docs.map((d: any) => ({
      _id: d._id?.toString?.() ?? d._id,
      filename: d.filename,
      createdAt: d.createdAt,
      recordCount: d.recordCount,
      approvedCount: d.approvedCount || 0,
      errorCount: d.errorCount || 0,
      agencyId: d.agencyId || null,
      accountId: d.accountId || null,
      agencyName: d.agencyId ? agencyMap[d.agencyId] || null : null,
      accountName: d.accountId ? accountMap[d.accountId] || null : null,
      uploadedBy: d.uploadedBy || null,
      assignedBy: d.assignedBy || null,
      assignedAt: d.assignedAt || null,
    }))
    
    return NextResponse.json({ items, session: { role: session.role, agencyId: session.agencyId } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


