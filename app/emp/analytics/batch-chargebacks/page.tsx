'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, AlertTriangle, TrendingDown, FileText, RefreshCw, Download } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { exportBatchChargebacksPDF } from '@/lib/pdf-export'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TruncatedFilename } from '@/components/emp/truncated-filename'
import { useIsMobile } from '@/hooks/use-breakpoint'
import { ResponsiveTable } from '@/components/emp/responsive-table'

interface BatchChargeback {
  uploadId: string
  filename: string
  createdAt: string
  totalRecords: number
  approvedCount: number
  chargebackCount: number
  chargebackRate: string
  chargebackAmount: number
  chargebacks: Array<{
    uniqueId?: string
    originalTransactionUniqueId: string
    transactionId: string
    reasonCode: string
    reasonDescription: string
    amount: number
    postDate: string
    arn?: string
  }>
}

interface ApiResponse {
  success: boolean
  batches: BatchChargeback[]
  totalBatches: number
  totalChargebacks: number
  totalChargebacksInDb?: number
  unmatchedChargebacks?: number
  timestamp?: string
  error?: string
}

export default function BatchChargebacksPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = async () => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new controller
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/emp/analytics/batch-chargebacks?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal
      })
      const json = await response.json()

      // Only update state if this is the latest request
      if (!controller.signal.aborted) {
        setData(json)
        console.log('[Batch Chargebacks UI] Data loaded at:', json.timestamp || 'no timestamp')

        if (json.unmatchedChargebacks && json.unmatchedChargebacks > 0) {
          console.warn(`⚠️ ${json.unmatchedChargebacks} chargebacks could not be matched to any batch`)
        }
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return
      }
      console.error('Failed to load batch chargebacks:', error)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData()
    return () => {
      try {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
      } catch (e) {
        // Ignore abort errors during cleanup
      }
    }
  }, [])

  const filteredBatches = useMemo(() => {
    if (!data?.batches) return []

    const query = searchQuery.toLowerCase().trim()
    let batches = query
      ? data.batches.filter(batch =>
        batch.filename.toLowerCase().includes(query) ||
        batch.uploadId.toLowerCase().includes(query)
      )
      : data.batches

    // Sort by upload date (newest first)
    return [...batches].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [data, searchQuery])

  const batchesWithChargebacks = useMemo(() => {
    return filteredBatches.filter(b => b.chargebackCount > 0)
  }, [filteredBatches])

  const totalChargebackAmount = useMemo(() => {
    return batchesWithChargebacks.reduce((sum, b) => sum + b.chargebackAmount, 0)
  }, [batchesWithChargebacks])

  const toggleBatch = (uploadId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev)
      if (next.has(uploadId)) {
        next.delete(uploadId)
      } else {
        next.add(uploadId)
      }
      return next
    })
  }

  const formatCurrency = (amountMinor: number) => {
    const major = amountMinor / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(major)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const getChargebackRateColor = (rateStr: string) => {
    const rate = parseFloat(rateStr)
    if (rate >= 10) return 'text-red-600 font-bold'
    if (rate >= 5) return 'text-orange-600 font-semibold'
    if (rate >= 2) return 'text-yellow-600'
    return 'text-green-600'
  }

  const handleExportPDF = () => {
    if (!data || !data.batches) {
      toast.error('No data available to export')
      return
    }

    try {
      exportBatchChargebacksPDF({
        dateRange: 'All Time',
        summary: {
          totalBatches: data.totalBatches,
          totalChargebacks: data.totalChargebacks,
          totalAmount: data.batches.reduce((sum, b) => sum + b.chargebackAmount, 0),
          unmatchedChargebacks: data.unmatchedChargebacks || 0,
        },
        batches: data.batches,
      })

      toast.success('PDF report generated successfully')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF report')
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link href="/emp/analytics">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Batch Chargeback Analysis</h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  Track chargebacks by file upload batch
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleExportPDF} disabled={loading || !data} variant="outline" size={isMobile ? "sm" : "default"}>
              <Download className="h-4 w-4 mr-2" />
              {isMobile ? "PDF" : "Export PDF"}
            </Button>
            <Button onClick={loadData} disabled={loading} variant="outline" size={isMobile ? "sm" : "default"}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {isMobile ? "Sync" : "Refresh"}
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <Card>
            <CardContent className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading batch chargeback analysis...</p>
            </CardContent>
          </Card>
        ) : data?.error ? (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-red-600">{data.error}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Warning Banner for Unmatched Chargebacks */}
            {data && data.unmatchedChargebacks && data.unmatchedChargebacks > 0 && (
              <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                        {data.unmatchedChargebacks} Unmatched Chargebacks
                      </h3>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        Total chargebacks in database: <strong>{data.totalChargebacksInDb}</strong>
                        {' • '}
                        Matched to batches: <strong>{data.totalChargebacks}</strong>
                        {' • '}
                        Not matched: <strong>{data.unmatchedChargebacks}</strong>
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                        These chargebacks could not be linked to any upload batch. Possible reasons: transaction not in reconcile cache, transaction ID not in upload, or batch was deleted.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Total Batches</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">{data?.totalBatches || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Showing {data?.batches.length} on this page
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Affected Batches</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">{batchesWithChargebacks.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Batches with chargebacks
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Total Chargebacks</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">{data?.totalChargebacks || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Across all batches
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Total Amount</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">{formatCurrency(totalChargebackAmount)}</div>
                  <p className="text-xs text-muted-foreground">
                    Chargebacked volume
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle>Batch List</CardTitle>
                <CardDescription>
                  Search and filter batch uploads by filename or ID
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Search by filename..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </CardContent>
            </Card>

            {/* Batch Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead className="text-right">Total Records</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Chargebacks</TableHead>
                      <TableHead className="text-right">CB Rate</TableHead>
                      <TableHead className="text-right">CB Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No batches found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBatches.map((batch) => (
                        <Collapsible
                          key={batch.uploadId}
                          open={expandedBatches.has(batch.uploadId)}
                          onOpenChange={() => toggleBatch(batch.uploadId)}
                          asChild
                        >
                          <>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {expandedBatches.has(batch.uploadId) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <TruncatedFilename filename={batch.filename} maxLength={isMobile ? 20 : 35} />
                                  {batch.chargebackCount > 0 && (
                                    <Badge variant="destructive" className="ml-2 shrink-0">
                                      {batch.chargebackCount} CB
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(batch.createdAt)}</TableCell>
                              <TableCell className="text-right">{batch.totalRecords.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{batch.approvedCount.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {batch.chargebackCount > 0 ? (
                                  <span className="text-red-600">{batch.chargebackCount}</span>
                                ) : (
                                  <span className="text-green-600">0</span>
                                )}
                              </TableCell>
                              <TableCell className={`text-right ${getChargebackRateColor(batch.chargebackRate)}`}>
                                {batch.chargebackRate}
                              </TableCell>
                              <TableCell className="text-right">
                                {batch.chargebackAmount > 0 ? formatCurrency(batch.chargebackAmount) : '€0.00'}
                              </TableCell>
                            </TableRow>
                            {batch.chargebackCount > 0 && (
                              <CollapsibleContent asChild>
                                <TableRow>
                                  <TableCell colSpan={8} className="bg-muted/30 p-4">
                                    <div className="space-y-2">
                                      <h4 className="font-semibold text-sm mb-3">Chargeback Details</h4>
                                      <div className="rounded-md border">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Transaction ID</TableHead>
                                              <TableHead>Original Tx ID</TableHead>
                                              <TableHead>Reason Code</TableHead>
                                              <TableHead>Description</TableHead>
                                              <TableHead>Post Date</TableHead>
                                              <TableHead className="text-right">Amount</TableHead>
                                              <TableHead>ARN</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {batch.chargebacks.map((cb, idx) => (
                                              <TableRow key={idx}>
                                                <TableCell className="font-mono text-xs" title={cb.transactionId}>
                                                  {cb.transactionId}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs" title={cb.originalTransactionUniqueId}>
                                                  {cb.originalTransactionUniqueId?.substring(0, 12) || 'N/A'}...
                                                </TableCell>
                                                <TableCell>
                                                  <Badge variant="outline">{cb.reasonCode}</Badge>
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate" title={cb.reasonDescription}>
                                                  {cb.reasonDescription || 'N/A'}
                                                </TableCell>
                                                <TableCell>{formatDate(cb.postDate)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(cb.amount)}</TableCell>
                                                <TableCell className="font-mono text-xs">{cb.arn || 'N/A'}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              </CollapsibleContent>
                            )}
                          </>
                        </Collapsible>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

