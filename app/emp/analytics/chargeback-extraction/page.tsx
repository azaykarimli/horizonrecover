'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ArrowLeft,
  Download,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  FileText,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  FileDown,
  CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { exportChargebackExtractionPDF } from '@/lib/pdf-export'
import { TruncatedFilename } from '@/components/emp/truncated-filename'
import { useIsMobile } from '@/hooks/use-breakpoint'

interface ChargebackExtraction {
  filename: string
  uploadDate: string
  totalTransactions: number
  chargebacks: Array<{
    transactionId: string
    originalTransactionUniqueId: string
    amount: number
    postDate: string
    reasonCode: string
    reasonDescription: string
    customerName?: string
    iban?: string
    arn?: string
  }>
  previousChargebacks?: Array<any>
}

interface ApiResponse {
  success: boolean
  batches: ChargebackExtraction[]
  totalBatches: number
  totalChargebacks: number
  error?: string
}

export default function ChargebackExtractionPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  const loadData = async () => {
    setLoading(true)
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/emp/analytics/chargeback-extraction?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      const json = await response.json()
      setData(json)

      if (json.success) {
        // toast.success('Chargeback extraction loaded') // Too noisy
      }
    } catch (error) {
      console.error('Error loading chargeback extraction:', error)
      toast.error('Failed to load chargeback extraction')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredBatches = useMemo(() => {
    if (!data?.batches) return []

    const query = searchQuery.toLowerCase().trim()
    let batches = query
      ? data.batches.filter(batch =>
        batch.filename.toLowerCase().includes(query)
      )
      : data.batches

    // Sort by upload date (newest first)
    return [...batches].sort((a, b) =>
      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    )
  }, [data, searchQuery])

  const toggleBatch = (filename: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
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

  const handleExportPDF = () => {
    if (!data || !data.batches) {
      toast.error('No data available to export')
      return
    }

    try {
      exportChargebackExtractionPDF({
        dateRange: 'All Time',
        batches: data.batches,
      })

      toast.success('PDF report generated successfully')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF report')
    }
  }

  const handleDownloadCSV = async (filename: string, type: 'chargebacks' | 'clean') => {
    try {
      const typeLabel = type === 'chargebacks' ? 'chargebacks' : 'clean transactions'
      toast.info(`Generating ${typeLabel} CSV...`)

      const response = await fetch(
        `/api/emp/analytics/chargeback-extraction/csv?filename=${encodeURIComponent(filename)}&type=${type}`
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to generate ${typeLabel} CSV`)
      }

      // Create download link
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = type === 'chargebacks' ? '_chargebacks' : '_clean'
      a.download = `${filename}${suffix}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`${typeLabel} CSV downloaded successfully`)
    } catch (error: any) {
      console.error('Error downloading CSV:', error)
      toast.error(error.message || 'Failed to download CSV')
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
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Chargeback Extraction</h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  View chargebacks grouped by original upload file
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

        {/* Info Banner */}
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Purpose of this report
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  This extraction groups chargebacks by their original upload file. Use this to:
                </p>
                <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-300 space-y-1 ml-4">
                  <li>Download CSV with <strong>chargebacks only</strong> to send to clients for correction</li>
                  <li>Download CSV with <strong>clean transactions only</strong> (without chargebacks) for re-submission</li>
                  <li>Identify which uploaded files had chargebacks</li>
                  <li>Track chargeback patterns per file/batch</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && !data ? (
          <Card>
            <CardContent className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading chargeback extraction...</p>
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
            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Total Batches</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">{data?.totalBatches || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Files with chargebacks
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
                    Across all files
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Total Amount</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl md:text-2xl font-bold">
                    {formatCurrency(
                      data?.batches.reduce((sum, b) =>
                        sum + b.chargebacks.reduce((s, c) => s + c.amount, 0), 0
                      ) || 0
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Chargebacked volume
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle>Extraction List</CardTitle>
                <CardDescription>
                  Search and filter extractions by filename
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

            {/* Extraction Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead className="text-right">Total Trans.</TableHead>
                      <TableHead className="text-right">Chargebacks</TableHead>
                      <TableHead className="text-right">CB Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No extractions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBatches.map((batch, index) => (
                        <Collapsible
                          key={index}
                          open={expandedBatches.has(batch.filename)}
                          onOpenChange={() => toggleBatch(batch.filename)}
                          asChild
                        >
                          <>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {expandedBatches.has(batch.filename) ? (
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
                                  <Badge variant="destructive" className="ml-2 shrink-0">
                                    {batch.chargebacks.length} CB
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(batch.uploadDate)}</TableCell>
                              <TableCell className="text-right">{batch.totalTransactions.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-semibold text-red-600">
                                {batch.chargebacks.length}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(batch.chargebacks.reduce((sum, cb) => sum + cb.amount, 0))}
                              </TableCell>
                            </TableRow>
                            <CollapsibleContent asChild>
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30 p-4">
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm mb-3">Chargeback Details</h4>
                                    <div className="rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>IBAN</TableHead>
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
                                              <TableCell className="font-medium">{cb.customerName || 'N/A'}</TableCell>
                                              <TableCell className="font-mono text-xs">{cb.iban || 'N/A'}</TableCell>
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
                                    <div className="flex gap-2 flex-wrap items-start pt-2">
                                      <Button
                                        onClick={() => handleDownloadCSV(batch.filename, 'chargebacks')}
                                        variant="outline"
                                        size={isMobile ? "sm" : "default"}
                                        className="gap-2"
                                      >
                                        <FileDown className="h-4 w-4" />
                                        <span className="hidden sm:inline">Chargebacks Only</span>
                                        <span className="sm:hidden">CBs</span>
                                      </Button>
                                      <Button
                                        onClick={() => handleDownloadCSV(batch.filename, 'clean')}
                                        variant="outline"
                                        size={isMobile ? "sm" : "default"}
                                        className="gap-2"
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="hidden sm:inline">Clean Only</span>
                                        <span className="sm:hidden">Clean</span>
                                      </Button>
                                      {batch.previousChargebacks && batch.previousChargebacks.length > 0 && (
                                        <Badge variant="outline">
                                          {batch.previousChargebacks.length} Previous CBs
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </CollapsibleContent>
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
        {data && !loading && !data.error && filteredBatches.length === 0 && searchQuery === '' && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No batches found with chargebacks in cache.</p>
              <p className="text-sm text-muted-foreground mt-2">Make sure to sync chargebacks first from the Analytics page.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

