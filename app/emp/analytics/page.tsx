"use client"

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Activity,
  ShieldAlert,
  CheckCircle2,
  Search,
  Filter,
  FileText,
  Download
} from 'lucide-react'
import Link from 'next/link'
import { exportAnalyticsPDF } from '@/lib/pdf-export'

interface Transaction {
  uniqueId: string
  transactionId: string
  transactionDate: string
  type: string
  amount: number
  currency: string
  status: string
  cardScheme: string
  cardPresent: boolean
  cardNumber?: string
  authCode?: string
  arn?: string
  bankAccountNumber?: string
}

interface Chargeback {
  arn: string
  uniqueId: string
  type: string
  postDate: string
  reasonCode: string
  reasonDescription: string
  amount: number
  currency: string
  cardNumber: string
}

interface StatsData {
  totalTransactions: number
  baseTransactionsCount: number
  totalVolume: string
  totalChargebacks: number
  chargebackRate: string
  transactionsByType: any[]
  transactionsByStatus: any[]
  transactionsByScheme: any[]
  transactionTimeline: any[]
  chargebacksByReason: any[]
  rawReconcileCount: number
}

const DEFAULT_STATS: StatsData = {
  totalTransactions: 0,
  baseTransactionsCount: 0,
  totalVolume: '€0.00',
  totalChargebacks: 0,
  chargebackRate: '0%',
  transactionsByType: [],
  transactionsByStatus: [],
  transactionsByScheme: [],
  transactionTimeline: [],
  chargebacksByReason: [],
  rawReconcileCount: 0
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c']

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([])
  const [stats, setStats] = useState<StatsData>(DEFAULT_STATS)

  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [transactionFilters, setTransactionFilters] = useState({
    search: '',
    status: 'all',
    type: 'all',
    page: 1,
    perPage: 25,
    total: 0,
    totalPages: 1
  })

  const [chargebackFilters, setChargebackFilters] = useState({
    search: '',
    reasonCode: 'all',
    page: 1,
    perPage: 25,
  })

  // Initial load
  useEffect(() => {
    loadStats()
    // loadTransactions() is called by the filter effect below
    loadChargebacks()
  }, [])

  async function loadStats() {
    setIsLoadingStats(true)
    try {
      const res = await fetch(`/api/emp/analytics/stats`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stats')
      setStats(data)
    } catch (error: any) {
      console.error('Stats error:', error)
      toast.error('Failed to load statistics')
    } finally {
      setIsLoadingStats(false)
    }
  }

  async function loadTransactions() {
    setIsLoadingTransactions(true)
    try {
      const params = new URLSearchParams({
        page: transactionFilters.page.toString(),
        perPage: transactionFilters.perPage.toString()
      })

      const res = await fetch(`/api/emp/analytics/cache/transactions?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to fetch transactions')

      setTransactions(data.transactions || [])
      setTransactionFilters(prev => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 1
      }))
    } catch (error: any) {
      console.error('Transactions error:', error)
      toast.error('Failed to load transactions')
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  async function loadChargebacks() {
    try {
      const res = await fetch(`/api/emp/analytics/cache/chargebacks`)
      const data = await res.json()
      if (res.ok) {
        setChargebacks(data.chargebacks || [])
      }
    } catch (e) {
      console.error('Chargebacks error:', e)
    }
  }

  // Reload transactions when page/filters change
  useEffect(() => {
    loadTransactions()
  }, [transactionFilters.page, transactionFilters.perPage])

  async function resyncTransactions(options: { skipReload?: boolean } = {}) {
    const { skipReload = false } = options
    try {
      toast.info('Resyncing transactions...')
      const res = await fetch(`/api/emp/analytics/cache/transactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // No dates, backend defaults to last 2 years
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Resync failed')

      toast.success(`Transactions resynced: ${j.saved || 0} saved`)
      if (!skipReload) {
        loadStats()
        loadTransactions()
      }
    } catch (e: any) {
      toast.error(e?.message || 'Resync failed')
      throw e
    }
  }

  async function resyncChargebacks(options: { skipReload?: boolean } = {}) {
    const { skipReload = false } = options
    try {
      toast.info('Resyncing chargebacks...')
      const res = await fetch(`/api/emp/analytics/cache/chargebacks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // No dates, backend defaults to last 2 years
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Resync failed')

      toast.success(`Chargebacks resynced: ${j.saved || 0} saved`)
      if (!skipReload) {
        loadStats()
        loadChargebacks()
      }
    } catch (e: any) {
      toast.error(e?.message || 'Resync failed')
      throw e
    }
  }

  async function refreshAllData() {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const results = await Promise.allSettled([
        resyncTransactions({ skipReload: true }),
        resyncChargebacks({ skipReload: true }),
      ])
      const hasFailure = results.some((r) => r.status === 'rejected')
      if (!hasFailure) {
        await Promise.all([loadStats(), loadTransactions(), loadChargebacks()])
        toast.success('Analytics and chargebacks refreshed')
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filter chargebacks based on search and filters (Client-side for now as list is usually small)
  const filteredChargebacks = useMemo(() => {
    let filtered = chargebacks

    if (chargebackFilters.search) {
      const searchLower = chargebackFilters.search.toLowerCase()
      filtered = filtered.filter(cb =>
        cb.arn?.toLowerCase().includes(searchLower) ||
        cb.uniqueId?.toLowerCase().includes(searchLower) ||
        cb.cardNumber?.toLowerCase().includes(searchLower)
      )
    }

    if (chargebackFilters.reasonCode !== 'all') {
      filtered = filtered.filter(cb => cb.reasonCode?.toLowerCase() === chargebackFilters.reasonCode)
    }

    return filtered
  }, [chargebacks, chargebackFilters.search, chargebackFilters.reasonCode])

  const paginatedChargebacks = useMemo(() => {
    const start = (chargebackFilters.page - 1) * chargebackFilters.perPage
    const end = start + chargebackFilters.perPage
    return filteredChargebacks.slice(start, end)
  }, [filteredChargebacks, chargebackFilters.page, chargebackFilters.perPage])

  const totalCbPages = Math.ceil(filteredChargebacks.length / chargebackFilters.perPage)

  const uniqueReasonCodes = useMemo(() => {
    const codes = new Set(chargebacks.map(cb => cb.reasonCode?.toLowerCase()).filter(Boolean))
    return Array.from(codes).sort()
  }, [chargebacks])

  // PDF export handler
  const handleExportPDF = () => {
    try {
      // Use stats directly for PDF
      const typeData = stats.transactionsByType.map(t => ({
        name: t.name,
        value: t.value,
        percentage: ((t.value / stats.baseTransactionsCount) * 100).toFixed(1) + '%'
      }))

      const statusData = stats.transactionsByStatus.map(s => ({
        name: s.name,
        value: s.value,
        percentage: ((s.value / stats.baseTransactionsCount) * 100).toFixed(1) + '%'
      }))

      const schemeData = stats.transactionsByScheme.map(s => ({
        name: s.name,
        value: s.value,
        percentage: ((s.value / stats.totalTransactions) * 100).toFixed(1) + '%'
      }))

      // Parse volume string back to number for avg calc (rough approx)
      const volNum = parseFloat(stats.totalVolume.replace(/[^0-9.-]+/g, ''))
      const avgTransaction = stats.totalTransactions > 0 ? volNum / stats.totalTransactions : 0

      exportAnalyticsPDF({
        dateRange: `All Time`,
        stats: {
          totalTransactions: stats.totalTransactions,
          totalVolume: volNum,
          totalChargebacks: stats.totalChargebacks,
          chargebackRate: stats.chargebackRate,
          averageTransaction: avgTransaction,
        },
        typeData,
        statusData,
        schemeData,
        transactions: transactions, // Note: PDF will only contain current page of transactions now
        chargebacks: chargebacks,
      })

      toast.success('PDF report generated successfully')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF report')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Transaction insights and chargeback overview</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button onClick={handleExportPDF} disabled={isLoadingStats} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Link href="/emp/analytics/batch-chargebacks">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Batch Analysis
            </Button>
          </Link>
          <Link href="/emp/analytics/chargeback-extraction">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              CB Extraction
            </Button>
          </Link>
          <Button onClick={refreshAllData} disabled={isLoadingStats || isRefreshing} className="gap-2" variant="outline">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalTransactions.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Approved transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalVolume}</div>
            )}
            <p className="text-xs text-muted-foreground">Transaction volume</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chargebacks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-destructive">{stats.totalChargebacks.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Disputed transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chargeback Rate</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{stats.chargebackRate}</div>
            )}
            <p className="text-xs text-muted-foreground">Of total transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Transactions by Type
            </CardTitle>
            <CardDescription>Distribution of transaction types</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.transactionsByType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.transactionsByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Transaction Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Transaction Status
            </CardTitle>
            <CardDescription>Status distribution overview</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.transactionsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Card Schemes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Card Schemes
            </CardTitle>
            <CardDescription>Transactions by card network</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.transactionsByScheme}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.transactionsByScheme.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Transaction Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Transaction Timeline
            </CardTitle>
            <CardDescription>Daily transaction volume</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.transactionTimeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" name="Transactions" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Transactions List
          </CardTitle>
          <CardDescription>All fetched transactions with details</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="h-[200px] flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="h-12 w-12 mb-2 text-muted-foreground/30" />
              <p className="font-medium">No transactions found</p>
              <p className="text-sm text-center max-w-sm mb-4">
                If you believe there should be data, try refreshing the cache.
              </p>
              <Button onClick={refreshAllData} variant="outline" size="sm" disabled={isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((transactionFilters.page - 1) * transactionFilters.perPage) + 1} - {Math.min(transactionFilters.page * transactionFilters.perPage, transactionFilters.total)} of {transactionFilters.total} transactions
                </p>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Transaction ID</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Type</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Amount</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Card</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Scheme</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Status</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Auth Code</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">ARN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-sm whitespace-nowrap">
                          {tx.transactionDate ? new Date(tx.transactionDate).toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm font-mono text-xs max-w-[150px] truncate" title={tx.transactionId}>
                          {tx.transactionId || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {tx.type || 'unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium">
                          {formatCurrency(tx.amount, tx.currency)}
                        </td>
                        <td className="py-3 px-4 text-sm font-mono text-xs">
                          {tx.cardNumber || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {tx.cardScheme || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tx.status === 'approved' || tx.status === 'completed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : tx.status === 'declined' || tx.status === 'error'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}>
                            {tx.status || 'completed'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm font-mono">
                          {tx.authCode || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm font-mono text-xs max-w-[150px] truncate" title={tx.arn}>
                          {tx.arn || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {transactionFilters.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="txPerPage" className="text-sm">Per page:</Label>
                    <Select
                      value={transactionFilters.perPage.toString()}
                      onValueChange={(value) => setTransactionFilters(prev => ({ ...prev, perPage: parseInt(value), page: 1 }))}
                    >
                      <SelectTrigger id="txPerPage" className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                      disabled={transactionFilters.page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {transactionFilters.page} of {transactionFilters.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionFilters(prev => ({ ...prev, page: Math.min(transactionFilters.totalPages, prev.page + 1) }))}
                      disabled={transactionFilters.page === transactionFilters.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chargebacks Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Chargeback Overview
            <Button variant="outline" className="gap-2 ml-auto">
              <FileText className="h-4 w-4" />
              Batch Analysis
            </Button>
          </CardTitle>
          <CardDescription>Detailed chargeback analysis with reason codes</CardDescription>

        </CardHeader>
        <CardContent>
          {isLoadingStats ? (
            <div className="h-[200px] flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stats.chargebacksByReason.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
              <p className="font-medium">No chargebacks found</p>
              <p className="text-sm">Great news! No chargebacks found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Chargebacks by Reason */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Chargebacks by Reason Code</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.chargebacksByReason} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="code" type="category" width={80} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p: any = payload[0]
                          const d = p.payload
                          return (
                            <div className="rounded-md border bg-background p-2 text-sm">
                              <div className="font-mono">{d.code}</div>
                              <div className="text-muted-foreground max-w-[240px]">{d.description || 'No description'}</div>
                              <div className="mt-1">Count: {d.value}</div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend />
                    <Bar dataKey="value" fill="#ff4444" name="Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chargeback Details Table */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Chargeback Details</h3>

                {/* Chargeback Filter Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="flex-1 w-full">
                    <Label htmlFor="cbSearch" className="text-sm mb-1.5 flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Search Chargebacks
                    </Label>
                    <Input
                      id="cbSearch"
                      type="text"
                      placeholder="Search by ARN, unique ID, or card..."
                      value={chargebackFilters.search}
                      onChange={(e) => setChargebackFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                    />
                  </div>
                  <div className="w-full sm:w-[200px]">
                    <Label htmlFor="cbReason" className="text-sm mb-1.5 flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Reason Code
                    </Label>
                    <Select
                      value={chargebackFilters.reasonCode}
                      onValueChange={(value) => setChargebackFilters(prev => ({ ...prev, reasonCode: value, page: 1 }))}
                    >
                      <SelectTrigger id="cbReason">
                        <SelectValue placeholder="All Reasons" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Reasons</SelectItem>
                        {uniqueReasonCodes.map(code => (
                          <SelectItem key={code} value={code}>
                            {code.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(chargebackFilters.search || chargebackFilters.reasonCode !== 'all') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setChargebackFilters({ search: '', reasonCode: 'all', page: 1, perPage: 25 })}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {((chargebackFilters.page - 1) * chargebackFilters.perPage) + 1} - {Math.min(chargebackFilters.page * chargebackFilters.perPage, filteredChargebacks.length)} of {filteredChargebacks.length} chargeback{filteredChargebacks.length !== 1 ? 's' : ''}
                    {filteredChargebacks.length !== chargebacks.length && ` (filtered from ${chargebacks.length})`}
                  </p>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="border-b">
                        <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">ARN / Tx ID</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Type</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Amount</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Reason</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedChargebacks.map((cb, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 text-sm whitespace-nowrap">{cb.postDate}</td>
                          <td className="py-3 px-4 text-sm font-mono text-xs whitespace-nowrap">{cb.arn || cb.uniqueId}</td>
                          <td className="py-3 px-4 text-sm">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                              {cb.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-destructive">
                            {formatCurrency(cb.amount, cb.currency)}
                          </td>
                          <td className="py-3 px-4 text-sm font-mono">{cb.reasonCode}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate" title={cb.reasonDescription}>
                            {cb.reasonDescription}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Chargeback Pagination Controls */}
                {totalCbPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cbPerPage" className="text-sm">Per page:</Label>
                      <Select
                        value={chargebackFilters.perPage.toString()}
                        onValueChange={(value) => setChargebackFilters(prev => ({ ...prev, perPage: parseInt(value), page: 1 }))}
                      >
                        <SelectTrigger id="cbPerPage" className="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChargebackFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={chargebackFilters.page === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {chargebackFilters.page} of {totalCbPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChargebackFilters(prev => ({ ...prev, page: Math.min(totalCbPages, prev.page + 1) }))}
                        disabled={chargebackFilters.page === totalCbPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatCurrency(amountMinor: number, currency: string): string {
  const major = amountMinor / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(major)
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180)
  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180)

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

