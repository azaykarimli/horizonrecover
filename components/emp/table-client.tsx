"use client"

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditRowDialog } from '@/components/emp/edit-row-dialog'
import { RefreshCw, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  title: string
  subtitle?: string
  headers: string[]
  records: Record<string, string>[]
  rowStatuses?: Array<'pending' | 'approved' | 'error' | undefined>
  rowErrors?: Array<string | undefined>
  uploadId?: string
  onRowEdited?: () => void
  canEdit?: boolean
  canSyncRow?: boolean
}

export function TableClient({ title, subtitle, headers, records, rowStatuses, rowErrors, uploadId, onRowEdited, canEdit = true, canSyncRow = true }: Props) {
  const [query, setQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  const filtered = useMemo(() => {
    if (!query) return records.map((r, i) => ({ record: r, originalIndex: i }))
    const q = query.toLowerCase()
    return records
      .map((r, i) => ({ record: r, originalIndex: i }))
      .filter(({ record: row }) => headers.some((h) => (row[h] || '').toLowerCase().includes(q)))
  }, [records, query, headers])

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, currentPage])

  // Reset page when query changes
  useMemo(() => {
    setCurrentPage(1)
  }, [query])

  // State for editing
  const [editingRow, setEditingRow] = useState<{ index: number; record: Record<string, string> } | null>(null)

  function exportCsv() {
    const delimiter = ','
    const headerLine = headers.join(delimiter)
    const lines = filtered.map(({ record: row }) => headers.map((h) => csvEscape(row[h] ?? '', delimiter)).join(delimiter))
    const content = [headerLine, ...lines].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9_-]+/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function getRowClassName(status?: 'pending' | 'approved' | 'error'): string {
    if (status === 'approved') {
      return 'bg-green-50/50 dark:bg-green-950/20 border-l-2 border-l-green-500'
    }
    if (status === 'error') {
      return 'bg-red-50/50 dark:bg-red-950/20 border-l-2 border-l-red-500'
    }
    return 'bg-muted/20 border-l-2 border-l-gray-300 dark:border-l-gray-600'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted border-b">
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={
                    "py-2 px-3 text-left font-medium whitespace-nowrap " +
                    (i === 0 ? 'sticky left-0 z-20 bg-muted border-r' : '')
                  }
                >
                  {h}
                </th>
              ))}
              <th className="py-2 px-3 text-right font-medium sticky right-0 z-20 bg-muted border-l">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.map(({ record: row, originalIndex }, i) => {
              const status = rowStatuses?.[originalIndex]
              const errorMsg = rowErrors?.[originalIndex]
              const rowClass = getRowClassName(status)

              const handleResubmit = async () => {
                try {
                  toast.info('Re-submitting row...')
                  const res = await fetch(`/api/emp/row/${uploadId}/${originalIndex}`, { method: 'POST' })
                  const data = await res.json()
                  if (!res.ok) {
                    console.error('[Resubmit Error]', { status: res.status, data, uploadId, rowIndex: originalIndex })
                    throw new Error(data?.error || 'Re-submit failed')
                  }
                  toast.success('Row re-submitted successfully')
                  if (onRowEdited) onRowEdited()
                } catch (err: any) {
                  console.error('[Resubmit Failed]', err)
                  toast.error(err?.message || 'Re-submit failed')
                }
              }

              const handleDelete = async () => {
                if (!confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
                  return
                }

                try {
                  toast.info('Deleting row...')
                  const res = await fetch(`/api/emp/uploads/delete-row/${uploadId}/${originalIndex}`, {
                    method: 'DELETE'
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data?.error || 'Delete failed')
                  toast.success('Row deleted successfully')
                  if (onRowEdited) onRowEdited()
                } catch (err: any) {
                  toast.error(err?.message || 'Delete failed')
                }
              }

              // Determine background color for sticky columns based on status
              // MUST use solid colors (no opacity) to prevent transparency issues
              let stickyClass = 'bg-background'
              if (status === 'approved') stickyClass = 'bg-[#f0fdf4] dark:bg-[#14532d]' // green-50 / green-900
              else if (status === 'error') stickyClass = 'bg-[#fef2f2] dark:bg-[#7f1d1d]' // red-50 / red-900
              else stickyClass = 'bg-background'

              return (
                <React.Fragment key={originalIndex}>
                  <tr className={`${rowClass} hover:bg-muted/50 transition-colors`}>
                    {headers.map((h, j) => (
                      <td
                        key={h}
                        className={
                          "py-1 px-3 whitespace-nowrap border-b max-w-[20rem] overflow-hidden text-ellipsis " +
                          (j === 0 ? `sticky left-0 z-10 border-r font-medium ${stickyClass}` : '')
                        }
                      >
                        {row[h] ?? ''}
                      </td>
                    ))}
                    <td className={`py-1 px-2 text-right border-b sticky right-0 z-10 border-l ${stickyClass}`}>
                      <div className="flex items-center justify-end gap-1">
                        {uploadId && (
                          <>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Edit"
                                onClick={() => setEditingRow({ index: originalIndex, record: row })}
                              >
                                <span className="sr-only">Edit</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                              </Button>
                            )}
                            {canSyncRow && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Sync"
                                onClick={handleResubmit}
                              >
                                <span className="sr-only">Sync</span>
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Delete"
                                onClick={handleDelete}
                              >
                                <span className="sr-only">Delete</span>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {errorMsg && (
                    <tr>
                      <td colSpan={headers.length + 1} className="py-2 px-3 bg-red-50 dark:bg-red-950/20 border-b border-l-2 border-l-red-500">
                        <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span className="font-medium">Error:</span>
                          <span>{errorMsg}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={headers.length + 1}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({filtered.length} total rows)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Lifted Edit Dialog */}
      {editingRow && uploadId && (
        <EditRowDialog
          open={!!editingRow}
          onOpenChange={(open) => !open && setEditingRow(null)}
          uploadId={uploadId}
          rowIndex={editingRow.index}
          record={editingRow.record}
          headers={headers}
          onSaved={() => {
            setEditingRow(null)
            if (onRowEdited) onRowEdited()
          }}
        />
      )}
    </div>
  )
}

function csvEscape(value: string, delimiter: string): string {
  const needsQuotes = value.includes(delimiter) || value.includes('"') || value.includes('\n')
  let v = value.replace(/"/g, '""')
  return needsQuotes ? `"${v}"` : v
}


