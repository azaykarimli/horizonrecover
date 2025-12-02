import { ObjectId } from 'mongodb'
import { getMongoClient, getDbName } from './db'
import { SessionPayload } from './types/auth'

/**
 * Get all transaction IDs from uploads belonging to an organization.
 * This is used to filter analytics data to only show organization-scoped transactions.
 * 
 * Transaction IDs are extracted from upload.rows[]:
 * - baseTransactionId: The original transaction ID
 * - lastTransactionId: The ID used for the latest attempt
 * - emp.uniqueId: The Genesis/EMP unique ID for approved transactions
 */
export async function getOrganizationTransactionIds(session: SessionPayload): Promise<{
  transactionIds: Set<string>
  uniqueIds: Set<string>
  uploadIds: string[]
}> {
  const client = await getMongoClient()
  const db = client.db(getDbName())
  const uploads = db.collection('uploads')
  
  const transactionIds = new Set<string>()
  const uniqueIds = new Set<string>()
  const uploadIds: string[] = []
  
  // Super Owner sees all - return empty sets to indicate no filtering needed
  if (session.role === 'superOwner') {
    return { transactionIds, uniqueIds, uploadIds }
  }
  
  // Build filter based on role - STRICT: only assigned uploads, no unassigned data leakage
  let filter: any = {}
  
  if (session.role === 'agencyAdmin' || session.role === 'agencyViewer') {
    if (!session.agencyId) {
      console.warn(`[Analytics] Agency role without agencyId - returning empty results`)
      return { transactionIds, uniqueIds, uploadIds }
    }
    // Only show uploads explicitly assigned to this agency
    filter.agencyId = session.agencyId
  } else if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
    if (!session.accountId) {
      console.warn(`[Analytics] Account role without accountId - returning empty results`)
      return { transactionIds, uniqueIds, uploadIds }
    }
    // Only show uploads explicitly assigned to this account
    filter.accountId = session.accountId
  } else {
    // Unknown role - return empty sets (will show no data)
    return { transactionIds, uniqueIds, uploadIds }
  }
  
  // Get all uploads for this organization
  const docs = await uploads.find(filter, { 
    projection: { 
      _id: 1,
      rows: 1 
    } 
  }).toArray()
  
  // Extract transaction IDs from rows
  for (const doc of docs) {
    uploadIds.push(doc._id.toString())
    
    if (!doc.rows || !Array.isArray(doc.rows)) continue
    
    for (const row of doc.rows) {
      // Add baseTransactionId
      if (row.baseTransactionId) {
        transactionIds.add(row.baseTransactionId)
      }
      
      // Add lastTransactionId
      if (row.lastTransactionId) {
        transactionIds.add(row.lastTransactionId)
      }
      
      // Add emp.uniqueId (Genesis unique ID)
      if (row.emp?.uniqueId) {
        uniqueIds.add(row.emp.uniqueId)
      }
      
      // Also add request.transactionId if available
      if (row.request?.transactionId) {
        transactionIds.add(row.request.transactionId)
      }
    }
  }
  
  console.log(`[Analytics] Organization ${session.agencyId || session.accountId}: Found ${uploadIds.length} uploads, ${transactionIds.size} transaction IDs, ${uniqueIds.size} unique IDs`)
  
  return { transactionIds, uniqueIds, uploadIds }
}

/**
 * Check if the session requires organization filtering.
 * Super Owner sees all data, others see only their organization's data.
 */
export function requiresOrganizationFilter(session: SessionPayload): boolean {
  return session.role !== 'superOwner'
}

/**
 * Build a MongoDB filter for transactions based on organization scope.
 * Returns null if no filtering is needed (Super Owner).
 */
export async function buildTransactionFilter(session: SessionPayload): Promise<any | null> {
  if (!requiresOrganizationFilter(session)) {
    return null // No filter needed for Super Owner
  }
  
  const { transactionIds, uniqueIds } = await getOrganizationTransactionIds(session)
  
  if (transactionIds.size === 0 && uniqueIds.size === 0) {
    // No transactions found - return a filter that matches nothing
    return { _id: { $exists: false } }
  }
  
  // Build filter to match either transactionId or uniqueId
  const orConditions: any[] = []
  
  if (transactionIds.size > 0) {
    orConditions.push({ transactionId: { $in: Array.from(transactionIds) } })
  }
  
  if (uniqueIds.size > 0) {
    orConditions.push({ uniqueId: { $in: Array.from(uniqueIds) } })
  }
  
  return { $or: orConditions }
}

/**
 * Build a MongoDB filter for chargebacks based on organization scope.
 * Returns null if no filtering is needed (Super Owner).
 * 
 * Key insight: Chargebacks reference originalTransactionUniqueId which is the
 * gateway's uniqueId, not the transactionId we generate. We need to look up
 * transactionIds in emp_reconcile_transactions to get the gateway uniqueIds.
 */
export async function buildChargebackFilter(session: SessionPayload): Promise<any | null> {
  if (!requiresOrganizationFilter(session)) {
    return null // No filter needed for Super Owner
  }
  
  const { transactionIds, uniqueIds } = await getOrganizationTransactionIds(session)
  
  if (transactionIds.size === 0 && uniqueIds.size === 0) {
    // No transactions found - return a filter that matches nothing
    return { _id: { $exists: false } }
  }
  
  // Look up transactionIds in emp_reconcile_transactions to get gateway uniqueIds
  // This is needed because chargebacks reference originalTransactionUniqueId (gateway ID)
  const allUniqueIds = new Set(uniqueIds)
  
  if (transactionIds.size > 0) {
    const client = await getMongoClient()
    const db = client.db(getDbName())
    const reconcileCollection = db.collection('emp_reconcile_transactions')
    
    // Query both transactionId and transaction_id fields (both may be used)
    const transactionIdArray = Array.from(transactionIds)
    const transactions = await reconcileCollection
      .find({
        $or: [
          { transactionId: { $in: transactionIdArray } },
          { transaction_id: { $in: transactionIdArray } }
        ]
      }, { projection: { uniqueId: 1, unique_id: 1 } })
      .toArray()
    
    for (const tx of transactions) {
      const uniqueId = tx.uniqueId || tx.unique_id
      if (uniqueId) {
        allUniqueIds.add(uniqueId)
      }
    }
    
    console.log(`[Chargeback Filter] Looked up ${transactionIds.size} transactionIds, found ${transactions.length} in reconcile, total ${allUniqueIds.size} unique IDs`)
  }
  
  if (allUniqueIds.size === 0) {
    return { _id: { $exists: false } }
  }
  
  // Filter chargebacks by originalTransactionUniqueId (the gateway's uniqueId)
  return { originalTransactionUniqueId: { $in: Array.from(allUniqueIds) } }
}
