import { getMongoClient, getDbName } from '@/lib/db'
import { parseEmpCsv } from '@/lib/emp'
import { ObjectId } from 'mongodb'
import { UploadDetailClient } from '@/components/emp/upload-detail-client'

export default async function UploadVisualizer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getMongoClient()
  const db = client.db(getDbName())
  const doc = await db.collection('uploads').findOne({ _id: new ObjectId(id) })
  if (!doc) {
    return <div className="text-muted-foreground">Upload not found.</div>
  }

  let headers: string[] = (doc as any).headers || []
  let records: Record<string, string>[] = (doc as any).records || []

  // Legacy fallback: previous uploads may have stored a single header and each row as a single semicolon-separated string
  if (headers.length === 1 && typeof records?.[0]?.[headers[0]] === 'string') {
    const headerLine = headers[0] as string
    const bodyLines = records.map((r: any) => String(r[headerLine] ?? ''))
    const csvText = [headerLine, ...bodyLines].join('\n')
    const reparsed = parseEmpCsv(csvText)
    headers = reparsed[0] ? Object.keys(reparsed[0]) : []
    records = reparsed
  }

  const rows: any[] = (doc as any).rows || []
  const approvedCount = rows.filter((r: any) => r.status === 'approved').length
  const errorCount = rows.filter((r: any) => r.status === 'error').length

  return (
    <UploadDetailClient
      id={id}
      filename={(doc as any).filename}
      recordCount={(doc as any).recordCount}
      createdAt={(doc as any).createdAt}
      approvedCount={approvedCount}
      errorCount={errorCount}
      headers={headers}
      records={records}
      rows={rows}
      reconciliationReport={(doc as any).reconciliationReport}
      lastReconciledAt={(doc as any).lastReconciledAt}
      filteredRecords={(doc as any).filteredRecords}
    />
  )
}
