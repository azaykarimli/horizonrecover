# Batch Synchronization & Processing

This document explains how batch synchronization works in the MeLinux emerchantpay integration platform, including transaction reconciliation, chargeback detection, and analytics generation.

## Table of Contents

- [Overview](#overview)
- [Batch Sync Process](#batch-sync-process)
- [Reconciliation](#reconciliation)
- [Chargeback Detection](#chargeback-detection)
- [Analytics Generation](#analytics-generation)
- [Manual Operations](#manual-operations)

---

## Overview

Batch synchronization is the process of fetching transaction data from emerchantpay and matching it with uploaded CSV records to:

1. **Update Transaction Statuses** - Sync approved, declined, and pending transactions
2. **Detect Chargebacks** - Identify chargebacked transactions and link them to originals
3. **Calculate Analytics** - Generate statistics, success rates, and financial summaries
4. **Verify Data Integrity** - Ensure all transactions are accounted for

### Key Concepts

- **Upload** - A single CSV file with multiple transaction rows
- **Batch** - A collection of related uploads (e.g., all BestWin uploads for December)
- **Reconciliation** - Fetching transaction details from emerchantpay
- **Chargeback** - A disputed transaction where funds are reversed
- **Unique ID** - emerchantpay's identifier for a transaction (immutable)
- **Transaction ID** - Our identifier for a transaction (generated)

---

## Batch Sync Process

### High-Level Flow

```
1. User clicks "Sync Batch" button
   ↓
2. Fetch date range (default: last 7 days)
   ↓
3. Call emerchantpay reconciliation API
   ↓
4. Store/update transactions in emp_reconcile_transactions
   ↓
5. Match transactions to uploads by transaction_id
   ↓
6. Update row statuses in emp_uploads
   ↓
7. Detect and cache chargebacks
   ↓
8. Recalculate upload statistics
   ↓
9. Generate batch analytics
   ↓
10. Display results to user
```

### Implementation

**API Endpoint**: `/app/api/emp/analytics/batch-sync/route.ts`

**Trigger**: Button click or scheduled job

#### Step 1: Fetch Transaction Data

```typescript
// Date range (default: last 7 days)
const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
const endDate = new Date()

// Fetch all transactions from emerchantpay
const transactions = await reconcileByDateRange(startDate, endDate)
```

#### Step 2: Store in Database

```typescript
const reconcileCollection = db.collection('emp_reconcile_transactions')

for (const tx of transactions) {
  await reconcileCollection.updateOne(
    { uniqueId: tx.unique_id },
    {
      $set: {
        transactionId: tx.transaction_id,
        transactionType: tx.transaction_type,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        bankAccountNumber: tx.bank_account_number || tx.iban,
        cardNumber: tx.card_number,
        customerEmail: tx.customer_email,
        timestamp: tx.timestamp,
        receivedAt: new Date(),
        referenceId: tx.reference_id,
        originalTransactionUniqueId: tx.original_transaction_unique_id,
        rawData: tx
      }
    },
    { upsert: true }
  )
}
```

#### Step 3: Match to Uploads

```typescript
const uploadsCollection = db.collection('emp_uploads')

// Find all uploads in date range
const uploads = await uploadsCollection.find({
  uploadedAt: { $gte: startDate, $lte: endDate }
}).toArray()

for (const upload of uploads) {
  for (const row of upload.rows) {
    // Find matching transaction by transaction_id
    const matchedTx = await reconcileCollection.findOne({
      transactionId: row.baseTransactionId
    })
    
    if (matchedTx) {
      // Update row status
      await uploadsCollection.updateOne(
        { _id: upload._id, 'rows.index': row.index },
        {
          $set: {
            'rows.$.status': matchedTx.status,
            'rows.$.uniqueId': matchedTx.uniqueId,
            'rows.$.lastAttemptAt': new Date(matchedTx.timestamp)
          }
        }
      )
    }
  }
}
```

#### Step 4: Recalculate Statistics

```typescript
for (const upload of uploads) {
  const updatedDoc = await uploadsCollection.findOne({ _id: upload._id })
  
  const stats = {
    submittedCount: updatedDoc.rows.length,
    successCount: updatedDoc.rows.filter(r => r.status === 'approved').length,
    errorCount: updatedDoc.rows.filter(r => r.status === 'declined' || r.status === 'error').length,
    pendingCount: updatedDoc.rows.filter(r => r.status === 'pending' || r.status === 'pending_async').length
  }
  
  await uploadsCollection.updateOne(
    { _id: upload._id },
    { $set: stats }
  )
}
```

---

## Reconciliation

Reconciliation is the process of fetching transaction details from emerchantpay.

### Methods

#### 1. By Unique ID

**File**: `lib/emerchantpay-reconcile.ts`

```typescript
const transaction = await reconcileTransaction('2bbf27193e764c78fb8e482f8b2a3241')

// Response:
{
  ok: true,
  status: 'approved',
  uniqueId: '2bbf27193e764c78fb8e482f8b2a3241',
  transactionId: '76013213-20251118-mi3sl6cp-00001',
  amount: 8900,
  currency: 'EUR',
  timestamp: '2025-11-18T14:32:01Z'
}
```

#### 2. By Transaction ID

```typescript
const transaction = await reconcileTransaction({
  transactionId: '76013213-20251118-mi3sl6cp-00001'
})
```

#### 3. By Date Range

```typescript
const startDate = '2025-11-01T00:00:00Z'
const endDate = '2025-11-30T23:59:59Z'

const transactions = await reconcileByDateRange(startDate, endDate)
```

### Reconciliation Response

emerchantpay returns complete transaction details:

```xml
<payment_response>
  <transaction_type>sdd_sale</transaction_type>
  <status>approved</status>
  <unique_id>2bbf27193e764c78fb8e482f8b2a3241</unique_id>
  <transaction_id>76013213-20251118-mi3sl6cp-00001</transaction_id>
  <amount>8900</amount>
  <currency>EUR</currency>
  <timestamp>2025-11-18T14:32:01Z</timestamp>
  <iban>DE29731900000005021715</iban>
  <customer_email>klaus@example.com</customer_email>
  <descriptor>bestwin</descriptor>
  <!-- ... more fields ... -->
</payment_response>
```

### Notification Webhook

emerchantpay also sends asynchronous notifications when transaction status changes.

**Endpoint**: `/app/api/emp/notifications/route.ts`

```typescript
// emerchantpay POST notification
{
  unique_id: '2bbf27193e764c78fb8e482f8b2a3241',
  transaction_id: '76013213-20251118-mi3sl6cp-00001',
  transaction_type: 'sdd_sale',
  status: 'approved',
  amount: 8900,
  currency: 'EUR',
  signature: 'abc123...' // SHA1 hash for verification
}
```

**Signature Verification**:
```typescript
const apiPassword = process.env.EMP_GENESIS_PASSWORD
const expectedSignature = crypto
  .createHash('sha1')
  .update(`${uniqueId}${apiPassword}`)
  .digest('hex')

if (expectedSignature !== notification.signature) {
  throw new Error('Invalid signature')
}
```

---

## Chargeback Detection

Chargebacks occur when customers dispute a transaction with their bank.

### Chargeback Flow

```
1. Customer disputes transaction with bank
   ↓
2. Bank initiates chargeback
   ↓
3. emerchantpay sends chargeback notification
   ↓
4. System receives notification with type: "chargeback"
   ↓
5. Extract originalTransactionUniqueId
   ↓
6. Find original transaction in emp_reconcile_transactions
   ↓
7. Extract IBAN from original transaction
   ↓
8. Cache chargeback in emp_chargeback_cache
   ↓
9. Link to upload row if found
   ↓
10. Update analytics
```

### Chargeback Notification

```typescript
{
  unique_id: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  transaction_type: 'chargeback',
  status: 'approved', // Chargeback was approved (funds reversed)
  original_transaction_unique_id: '2bbf27193e764c78fb8e482f8b2a3241',
  amount: 8900,
  currency: 'EUR',
  timestamp: '2025-11-20T10:00:00Z'
}
```

### Caching Chargebacks

**API Endpoint**: `/app/api/emp/analytics/chargebacks/route.ts`

```typescript
// Find original transaction
const originalTx = await reconcileCollection.findOne({
  uniqueId: notification.original_transaction_unique_id
})

// Extract IBAN
const iban = originalTx.bankAccountNumber || originalTx.iban || originalTx.cardNumber

// Normalize IBAN (uppercase, no spaces)
const normalizedIban = iban.replace(/\s+/g, '').toUpperCase()

// Cache chargeback
await chargebackCacheCollection.updateOne(
  { uniqueId: notification.unique_id },
  {
    $set: {
      originalTransactionUniqueId: notification.original_transaction_unique_id,
      amount: notification.amount,
      currency: notification.currency,
      iban: normalizedIban,
      bankAccountNumber: iban,
      chargebackDate: new Date(notification.timestamp),
      cachedAt: new Date(),
      resolved: false
    }
  },
  { upsert: true }
)
```

### Filtering Chargebacks from CSV

Users can remove chargebacked IBANs from uploads before processing.

**Button**: "Filter Chargebacks" in upload detail page

**API Endpoint**: `/app/api/emp/uploads/filter-chargebacks/[id]/route.ts`

#### Process:

```typescript
// Step 1: Get all chargebacks
const chargebacks = await chargebackCacheCollection.find({}).toArray()

// Step 2: Extract original transaction unique IDs
const originalTxUniqueIds = chargebacks.map(cb => cb.originalTransactionUniqueId)

// Step 3: Find original transactions
const originalTransactions = await reconcileCollection.find({
  uniqueId: { $in: originalTxUniqueIds }
}).toArray()

// Step 4: Extract IBANs (bankAccountNumber or cardNumber)
const chargebackAccounts = new Set<string>()
for (const tx of originalTransactions) {
  const account = tx.bankAccountNumber || tx.cardNumber
  if (account) {
    const normalized = account.replace(/\s+/g, '').toUpperCase()
    chargebackAccounts.add(normalized)
  }
}

// Step 5: Filter CSV rows
const cleanRecords = upload.records.filter((record, index) => {
  // Find IBAN field (case-insensitive)
  const ibanField = Object.keys(record).find(key => 
    key.toLowerCase() === 'iban' || 
    key.toLowerCase().includes('iban')
  )
  
  if (!ibanField) return true // Keep if no IBAN field
  
  const iban = record[ibanField]
  const normalizedIban = iban.replace(/\s+/g, '').toUpperCase()
  
  // Remove if IBAN is in chargeback list
  return !chargebackAccounts.has(normalizedIban)
})

// Step 6: Update upload with clean records
await uploadsCollection.updateOne(
  { _id: uploadId },
  {
    $set: {
      records: cleanRecords,
      rows: cleanRows,
      totalRecords: cleanRecords.length,
      chargebackFilterStats: {
        appliedAt: new Date(),
        originalRowCount: upload.records.length,
        chargebackedRowCount: upload.records.length - cleanRecords.length,
        cleanRowCount: cleanRecords.length,
        chargebackedIbans: Array.from(chargebackAccounts)
      }
    }
  }
)
```

---

## Analytics Generation

### Batch Chargeback Analytics

**API Endpoint**: `/app/api/emp/analytics/batch-chargebacks/route.ts`

**Purpose**: Group uploads into batches and calculate chargeback rates.

#### Batch Detection

Uploads are grouped into batches based on:
1. Filename pattern (e.g., all files containing "bestwin")
2. Upload date (same day = same batch)
3. Company configuration

```typescript
// Group uploads by filename pattern
const batches = new Map<string, Upload[]>()

for (const upload of uploads) {
  // Extract batch identifier (e.g., "bestwin", "grandluck", "melinux")
  const batchKey = detectBatchKey(upload.filename)
  
  if (!batches.has(batchKey)) {
    batches.set(batchKey, [])
  }
  
  batches.get(batchKey).push(upload)
}
```

#### Batch Statistics

For each batch, calculate:

```typescript
{
  batchId: 'bestwin-2025-11-18',
  company: 'BestWin',
  uploadCount: 3,
  totalTransactions: 1250,
  
  // Transaction Status
  approvedCount: 1100,
  declinedCount: 50,
  pendingCount: 100,
  
  // Financial
  totalAmount: 125000, // in cents
  approvedAmount: 110000,
  declinedAmount: 5000,
  pendingAmount: 10000,
  currency: 'EUR',
  
  // Chargebacks
  chargebackCount: 15,
  chargebackAmount: 1500,
  chargebackRate: 0.012, // 1.2%
  
  // Success Metrics
  successRate: 0.88, // 88%
  errorRate: 0.04,   // 4%
  pendingRate: 0.08, // 8%
  
  // Dates
  firstUpload: ISODate('2025-11-18T10:00:00Z'),
  lastUpload: ISODate('2025-11-18T16:00:00Z'),
  
  // Uploads in this batch
  uploads: [
    { _id: '...', filename: 'bestwin_batch1.csv', ... },
    { _id: '...', filename: 'bestwin_batch2.csv', ... },
    { _id: '...', filename: 'bestwin_batch3.csv', ... }
  ]
}
```

### Chargeback Extraction

**API Endpoint**: `/app/api/emp/analytics/chargeback-extraction/route.ts`

**Purpose**: Extract chargebacked transactions from batches for analysis.

#### Process:

```typescript
// For each batch:
// 1. Get all transaction unique IDs from uploads
const txUniqueIds = batch.uploads.flatMap(upload => 
  upload.rows.map(row => row.uniqueId)
).filter(Boolean)

// 2. Find chargebacks for these transactions
const chargebacks = await chargebackCacheCollection.find({
  originalTransactionUniqueId: { $in: txUniqueIds }
}).toArray()

// 3. Link chargebacks to original records
const chargebackedRecords = []
for (const cb of chargebacks) {
  const originalTx = await reconcileCollection.findOne({
    uniqueId: cb.originalTransactionUniqueId
  })
  
  // Find matching CSV record
  const record = findRecordByTransactionId(originalTx.transactionId)
  
  chargebackedRecords.push({
    ...record,
    chargebackDate: cb.chargebackDate,
    chargebackAmount: cb.amount,
    chargebackReason: cb.reason
  })
}

// 4. Export as CSV
const csv = generateCsv(chargebackedRecords)
```

#### Download Options

Users can download:

1. **Chargebacks Only** - CSV containing only chargebacked transactions
   - URL: `/api/emp/analytics/chargeback-extraction/csv?batchId=...&type=chargebacks`

2. **Clean Transactions Only** - CSV containing only non-chargebacked transactions
   - URL: `/api/emp/analytics/chargeback-extraction/csv?batchId=...&type=clean`

3. **Full Analytics** - JSON with complete batch statistics
   - URL: `/api/emp/analytics/batch-chargebacks`

---

## Manual Operations

### Reset Upload

Clears all transaction IDs and statuses, allowing resubmission with new IDs.

**Button**: "Reset" in upload detail page

**API Endpoint**: `/app/api/emp/uploads/reset/[id]/route.ts`

```typescript
await uploadsCollection.updateOne(
  { _id: uploadId },
  {
    $set: {
      status: 'pending',
      submittedCount: 0,
      successCount: 0,
      errorCount: 0,
      'rows.$[].baseTransactionId': null,
      'rows.$[].status': 'pending',
      'rows.$[].uniqueId': null,
      'rows.$[].retryCount': 0,
      'rows.$[].lastAttemptAt': null,
      'rows.$[].attempts': []
    }
  }
)
```

### Void Approved Transactions

Cancel all approved transactions in an upload.

**Button**: "Void Approved" in upload detail page

**API Endpoint**: `/app/api/emp/uploads/void-approved/[id]/route.ts`

```typescript
// Find all approved rows
const approvedRows = upload.rows.filter(r => r.status === 'approved' && r.uniqueId)

// Void each transaction
for (const row of approvedRows) {
  const voidResult = await voidTransaction({
    transactionId: `void-${row.baseTransactionId}`,
    referenceId: row.uniqueId,
    usage: 'Bulk void from dashboard'
  })
  
  if (voidResult.ok) {
    // Update row status
    await uploadsCollection.updateOne(
      { _id: uploadId, 'rows.index': row.index },
      {
        $set: {
          'rows.$.status': 'voided'
        }
      }
    )
  }
}
```

### Manual Void

Void a single transaction by unique ID.

**Dialog**: "Manual Void" in upload detail page

**API Endpoint**: `/app/api/emp/void-manual/route.ts`

```typescript
const result = await voidTransaction({
  transactionId: `manual-void-${Date.now()}`,
  referenceId: uniqueId, // From user input
  usage: 'Manual void',
  remoteIp: requestIp
})
```

### Delete Row

Remove a single row from an upload.

**Button**: "Delete" in CSV table

**API Endpoint**: `/app/api/emp/uploads/delete-row/[uploadId]/[rowIndex]/route.ts`

```typescript
await uploadsCollection.updateOne(
  { _id: uploadId },
  {
    $pull: {
      records: { /* match by index */ },
      rows: { index: rowIndex }
    },
    $inc: { totalRecords: -1 }
  }
)
```

---

## Scheduling & Automation

### Vercel Cron Jobs (Implemented)

The platform uses Vercel cron jobs for automatic data synchronization.

#### Analytics Refresh Cron (Every 2 Hours)

**Endpoint**: `/api/cron/refresh-analytics`  
**Schedule**: `0 */2 * * *` (every 2 hours at minute 0)  
**Action**: Same as clicking "Refresh Data" button on analytics dashboard

```typescript
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/refresh-analytics",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

**What it does**:
1. Calculates date range (last 30 days to +30 days future)
2. Fetches all transactions from emerchantpay reconcile API
3. Clears and updates `emp_reconcile_transactions` cache
4. Fetches all chargebacks from emerchantpay chargebacks API
5. Clears and updates `emp_chargebacks` cache
6. Logs results and timing

**Security**: The cron endpoint verifies the `CRON_SECRET` environment variable:

```typescript
// Verify Vercel cron request
const authHeader = request.headers.get('authorization')
const cronSecret = process.env.CRON_SECRET

if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Environment Setup**:
```bash
# .env.local
CRON_SECRET=your_cron_secret_here  # Generate with: openssl rand -base64 32
```

**Vercel Dashboard Configuration**:
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Add `CRON_SECRET` with a secure random value
3. Cron jobs automatically use this for authentication

### Manual Triggers

Users can manually trigger sync operations:

1. **Refresh Data** - Button in analytics dashboard (syncs transactions + chargebacks)
2. **Sync Batch** - Button in batch analysis page
3. **Refresh Stats** - Button in upload detail page
4. **Re-run Chargeback Detection** - API endpoint

### Cron Job Response

```typescript
// Successful response
{
  success: true,
  message: 'Analytics refresh completed',
  dateRange: {
    startDate: '2025-10-28',
    endDate: '2025-12-27'
  },
  results: {
    transactions: { success: true, fetched: 5033, error: null },
    chargebacks: { success: true, fetched: 435, error: null }
  },
  duration: '12345ms',
  timestamp: '2025-11-27T10:00:00.000Z'
}
```

### Monitoring Cron Execution

Check Vercel dashboard for cron execution logs:
1. Go to Vercel Dashboard → Deployments → Functions
2. Filter by `/api/cron/refresh-analytics`
3. View execution logs and timing

---

## Best Practices

### Synchronization Frequency

- **Production**: Every 6 hours
- **Development**: Manual trigger only
- **High-volume**: Every 2 hours

### Date Ranges

- **Default**: Last 7 days (captures most pending transactions)
- **Full Sync**: Last 30 days (monthly reconciliation)
- **Audit**: Last 90 days (quarterly review)

### Error Handling

```typescript
try {
  const result = await batchSync()
} catch (error) {
  console.error('[Batch Sync] Error:', error)
  
  // Retry with exponential backoff
  await retryWithBackoff(() => batchSync(), {
    maxAttempts: 3,
    initialDelay: 5000, // 5 seconds
    maxDelay: 60000 // 1 minute
  })
}
```

### Performance Optimization

- **Batch Updates**: Use `bulkWrite` for multiple updates
- **Indexing**: Ensure indexes on uniqueId, transactionId, uploadedAt
- **Pagination**: Process large uploads in chunks
- **Caching**: Cache chargeback lookups for faster filtering

---

## Troubleshooting

### Sync Not Updating Status

**Cause**: Transaction ID mismatch

**Solution**: 
1. Check that `transactionId` in emerchantpay matches `baseTransactionId` in upload
2. Verify transaction exists in `emp_reconcile_transactions`
3. Run manual reconciliation for specific transaction

### Chargebacks Not Detected

**Cause**: Missing `originalTransactionUniqueId` in chargeback notification

**Solution**:
1. Verify notification webhook is configured
2. Check `emp_reconcile_transactions` for chargeback entries
3. Manually run chargeback cache refresh

### Duplicate Transactions in Batch

**Cause**: Same CSV uploaded multiple times

**Solution**:
1. Use "Reset" to clear IDs
2. Filter duplicates by IBAN + amount + date
3. Delete duplicate uploads

---

**Last Updated**: November 2025  
**Version**: 2.0

