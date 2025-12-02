"use client"

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { EditRowDialog } from '@/components/emp/edit-row-dialog'
import { RefreshCw, AlertCircle, Search, Download, HelpCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useIsMobile } from '@/hooks/use-breakpoint'

type Props = {
  uploadId?: string
  headers: string[]
  records: Record<string, string>[]
  rowStatuses?: Array<'pending' | 'approved' | 'error' | undefined>
  rowErrors?: Array<string | undefined>
  onRowEdited?: () => void
}

export function ImprovedTable({ uploadId, headers, records, rowStatuses, rowErrors, onRowEdited }: Props) {
  const [query, setQuery] = useState('')
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(headers.slice(0, 10)))
  const isMobile = useIsMobile()

  const filtered = useMemo(() => {
    if (!query) return records.map((r, i) => ({ record: r, originalIndex: i }))
    const q = query.toLowerCase()
    return records
      .map((r, i) => ({ record: r, originalIndex: i }))
      .filter(({ record: row }) => 
        Object.values(row).some(v => String(v || '').toLowerCase().includes(q))
      )
  }, [records, query])

  const visibleHeaders = useMemo(() => 
    headers.filter(h => selectedColumns.has(h)),
    [headers, selectedColumns]
  )

  function exportCsv() {
    const delimiter = ','
    const headerLine = visibleHeaders.join(delimiter)
    const lines = filtered.map(({ record: row }) => 
      visibleHeaders.map((h) => {
        const val = row[h] ?? ''
        const escaped = val.replace(/"/g, '""')
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${escaped}"` : val
      }).join(delimiter)
    )
    const content = [headerLine, ...lines].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `export_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  const resubmitAction = useAsyncAction(
    async ({ uploadId, rowIndex }: { uploadId: string; rowIndex: number }) => {
      const res = await fetch(`/api/emp/row/${uploadId}/${rowIndex}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Re-submit failed')
      return data
    },
    {
      loadingMessage: 'Re-submitting transaction...',
      successMessage: 'Transaction re-submitted successfully',
      onSuccess: () => onRowEdited?.(),
    }
  )

  const getStatusBadge = (status?: 'pending' | 'approved' | 'error') => {
    if (status === 'approved') {
      return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Approved</Badge>
    }
    if (status === 'error') {
      return <Badge variant="destructive">Error</Badge>
    }
    return <Badge variant="outline" className="bg-gray-100">Pending</Badge>
  }

  const approvedCount = rowStatuses?.filter(s => s === 'approved').length || 0
  const errorCount = rowStatuses?.filter(s => s === 'error').length || 0
  const pendingCount = rowStatuses?.filter(s => s === 'pending' || !s).length || 0

  if (isMobile) {
    return (
      <TooltipProvider>
        <div className="space-y-4">
          {/* Search and actions bar */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>

              {rowStatuses && (
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="bg-green-50">
                    <span className="text-green-700">{approvedCount} ✓</span>
                  </Badge>
                  <Badge variant="outline" className="bg-red-50">
                    <span className="text-red-700">{errorCount} ✗</span>
                  </Badge>
                  <Badge variant="outline">
                    <span className="text-gray-700">{pendingCount} ⏳</span>
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Mobile card view */}
          <div className="space-y-3">
            {filtered.slice(0, 1000).map(({ record: row, originalIndex }) => {
              const status = rowStatuses?.[originalIndex]
              const errorMsg = rowErrors?.[originalIndex]
              
              return (
                <Card key={originalIndex} className={
                  status === 'approved' ? 'border-green-200 bg-green-50/30' :
                  status === 'error' ? 'border-red-200 bg-red-50/30' : ''
                }>
                  <CardContent className="p-4 space-y-3">
                    {rowStatuses && (
                      <div className="flex items-center justify-between pb-2 border-b">
                        {getStatusBadge(status)}
                        <span className="text-xs text-muted-foreground">Row {originalIndex + 1}</span>
                      </div>
                    )}
                    
                    {visibleHeaders.slice(0, 6).map((h) => (
                      <div key={h} className="flex justify-between items-start gap-2 text-sm">
                        <span className="font-medium text-muted-foreground min-w-[80px]">
                          {h}:
                        </span>
                        <span className="text-right flex-1 break-words">
                          {row[h] ?? '-'}
                        </span>
                      </div>
                    ))}
                    
                    {errorMsg && (
                      <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}
                    
                    {uploadId && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t">
                        <EditRowDialog
                          uploadId={uploadId}
                          rowIndex={originalIndex}
                          record={row}
                          headers={headers}
                          onSaved={onRowEdited}
                        />
                        {status !== 'approved' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resubmitAction.execute({ uploadId, rowIndex: originalIndex })}
                            disabled={resubmitAction.isLoading}
                            className="gap-1.5"
                          >
                            {resubmitAction.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Retry
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Footer info */}
          <div className="text-sm text-muted-foreground text-center">
            {filtered.length === 0 ? (
              <p>No transactions found</p>
            ) : (
              <>
                <p>Showing {Math.min(filtered.length, 1000)} of {filtered.length} transactions</p>
                {filtered.length > 1000 && (
                  <p className="text-yellow-600 dark:text-yellow-400 mt-1">
                    ⚠️ Use search to find specific transactions
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search and actions bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export visible data as CSV</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm font-semibold mb-1">Transaction Status Colors:</p>
                <p className="text-sm">🟢 <strong>Green</strong> = Approved by gateway</p>
                <p className="text-sm">🔴 <strong>Red</strong> = Error or rejected</p>
                <p className="text-sm">⚪ <strong>Gray</strong> = Not yet synced</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Status summary */}
        {rowStatuses && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span>{approvedCount} Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <span>{errorCount} Errors</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gray-400"></div>
              <span>{pendingCount} Pending</span>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b sticky top-0 z-10">
                <tr>
                  {rowStatuses && <th className="py-3 px-4 text-left font-medium w-[100px]">Status</th>}
                  {visibleHeaders.map((h) => (
                    <th key={h} className="py-3 px-4 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  {uploadId && <th className="py-3 px-4 text-right font-medium sticky right-0 bg-muted/50 w-[200px]">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 1000).map(({ record: row, originalIndex }, i) => {
                  const status = rowStatuses?.[originalIndex]
                  const errorMsg = rowErrors?.[originalIndex]

                  return (
                    <>
                      <tr 
                        key={i} 
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                          status === 'approved' ? 'bg-green-50/30 dark:bg-green-950/10' :
                          status === 'error' ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                        }`}
                      >
                        {rowStatuses && (
                          <td className="py-3 px-4">
                            {getStatusBadge(status)}
                          </td>
                        )}
                        {visibleHeaders.map((h) => (
                          <td key={h} className="py-3 px-4 max-w-[300px] truncate" title={row[h]}>
                            {row[h] ?? ''}
                          </td>
                        ))}
                        {uploadId && (
                          <td className="py-3 px-4 text-right sticky right-0 bg-background border-l">
                            <div className="flex items-center justify-end gap-2">
                              <EditRowDialog
                                uploadId={uploadId}
                                rowIndex={originalIndex}
                                record={row}
                                headers={headers}
                                onSaved={onRowEdited}
                              />
                              {status !== 'approved' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => resubmitAction.execute({ uploadId, rowIndex: originalIndex })}
                                      disabled={resubmitAction.isLoading}
                                      className="gap-1.5"
                                    >
                                      {resubmitAction.isLoading ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}
                                      Retry
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Re-submit this transaction</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {errorMsg && (
                        <tr key={`${i}-error`} className="border-b bg-red-50/50 dark:bg-red-950/20">
                          <td colSpan={visibleHeaders.length + (rowStatuses ? 1 : 0) + (uploadId ? 1 : 0)} className="py-2 px-4">
                            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-semibold">Error: </span>
                                <span>{errorMsg}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={visibleHeaders.length + (rowStatuses ? 1 : 0) + (uploadId ? 1 : 0)} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Search className="h-12 w-12 text-muted-foreground/30" />
                        <p className="font-medium">No transactions found</p>
                        <p className="text-sm">Try adjusting your search query</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {Math.min(filtered.length, 1000)} of {filtered.length} transactions</span>
          {filtered.length > 1000 && (
            <span className="text-yellow-600 dark:text-yellow-400">
              ⚠️ Large dataset: only first 1,000 rows displayed. Use search to find specific transactions.
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
