"use client"

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { TableClient } from '@/components/emp/table-client'
import { Button } from '@/components/ui/button'
import { BatchSyncButton } from '@/components/emp/batch-sync-button'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Calendar, Hash, CheckCircle2, XCircle, CheckCircle, RotateCcw, Ban, Loader2, MoreVertical, Filter, Send } from 'lucide-react'
import Link from 'next/link'
import { useAsyncAction } from '@/hooks/use-async-action'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-breakpoint'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle } from 'lucide-react'
import { useSession } from '@/contexts/session-context'

interface UploadDetailClientProps {
  id: string
  filename: string
  recordCount: number
  createdAt: string
  approvedCount: number
  errorCount: number
  headers: string[]
  records: Record<string, string>[]
  rows: any[]
  reconciliationReport?: any
  lastReconciledAt?: string
  filteredRecords?: Record<string, string>[]
}

export function UploadDetailClient({
  id,
  filename,
  recordCount,
  createdAt,
  approvedCount,
  errorCount,
  headers,
  records,
  rows,
  reconciliationReport,
  lastReconciledAt,
  filteredRecords,
}: UploadDetailClientProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [manualVoidOpen, setManualVoidOpen] = useState(false)
  const [filterChargebacksOpen, setFilterChargebacksOpen] = useState(false)
  const [showFilteredRowsOpen, setShowFilteredRowsOpen] = useState(false)

  const handleRefresh = () => {
    router.refresh()
  }

  // Memoize row statuses and errors for performance
  const rowData = useMemo(() => ({
    statuses: rows.map((r: any) => r?.status || 'pending'),
    errors: rows.map((r: any) => r?.empError || r?.emp?.technicalMessage || r?.emp?.message)
  }), [rows])

  const resetAction = useAsyncAction(
    async () => {
      const res = await fetch(`/api/emp/uploads/reset/${id}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset upload')
      }

      return data
    },
    {
      loadingMessage: 'Resetting upload...',
      successMessage: 'Upload reset successfully',
      onSuccess: () => router.refresh(),
    }
  )

  const reconcileAction = useAsyncAction(
    async () => {
      const res = await fetch(`/api/emp/reconcile/${id}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reconcile')
      }

      return data
    },
    {
      loadingMessage: 'Reconciling with payment gateway...',
      successMessage: 'Reconciliation completed successfully',
      onSuccess: () => router.refresh(),
    }
  )

  const voidAction = useAsyncAction(
    async () => {
      const res = await fetch(`/api/emp/uploads/void-approved/${id}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to void transactions')
      }

      return data
    },
    {
      loadingMessage: 'Voiding approved transactions...',
      onSuccess: (data) => {
        toast.success(`✅ Void completed: ${data.voidedCount} voided, ${data.failedCount} failed`)
        router.refresh()
      },
    }
  )


  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset this upload? This will clear all submission history and allow resubmission with new transaction IDs.')) {
      return
    }
    await resetAction.execute()
  }

  const handleVoidApproved = async () => {
    if (!confirm(`⚠️ WARNING: This will void ALL ${approvedCount} approved transactions in this upload!\n\nThis action:\n- Cancels transactions before they're finalized\n- Only works on the same day as the original transaction\n- Cannot be undone\n\nAre you sure you want to continue?`)) {
      return
    }
    await voidAction.execute()
  }

  // Manual void dialog state
  const [uniqueId, setUniqueId] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [isManualVoiding, setIsManualVoiding] = useState(false)
  const [manualVoidResult, setManualVoidResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleManualVoid = async () => {
    if (!uniqueId.trim()) {
      alert('Please enter a unique_id')
      return
    }

    if (!confirm(`⚠️ Are you sure you want to void transaction:\n\nUnique ID: ${uniqueId}\nTransaction ID: ${transactionId || 'N/A'}\n\nThis action cannot be undone!`)) {
      return
    }

    setIsManualVoiding(true)
    setManualVoidResult(null)

    try {
      const res = await fetch('/api/emp/void-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: uniqueId.trim(),
          transactionId: transactionId.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setManualVoidResult({ ok: true, message: `✅ Transaction voided successfully!\nVoid Unique ID: ${data.voidUniqueId}` })
        setUniqueId('')
        setTransactionId('')
        toast.success('Transaction voided successfully')
      } else {
        setManualVoidResult({ ok: false, message: `❌ Void failed: ${data.error || data.message || 'Unknown error'}` })
        toast.error(`Void failed: ${data.error || data.message}`)
      }
    } catch (err: any) {
      console.error('Void error:', err)
      setManualVoidResult({ ok: false, message: `❌ Error: ${err.message}` })
      toast.error(`Error: ${err.message}`)
    } finally {
      setIsManualVoiding(false)
    }
  }

  // Filter chargebacks state
  const [isFilteringChargebacks, setIsFilteringChargebacks] = useState(false)

  const handleFilterChargebacks = async () => {
    setIsFilteringChargebacks(true)
    setFilterChargebacksOpen(false)

    try {
      const res = await fetch(`/api/emp/uploads/filter-chargebacks/${id}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to filter chargebacks')
      }

      if (data.removedCount === 0) {
        toast.success('No chargebacks found - all IBANs are clean')
      } else {
        toast.success(`Removed ${data.removedCount} row(s) with chargebacks. ${data.remainingCount} rows remaining.`)
      }

      handleRefresh()
    } catch (err: any) {
      console.error('Filter chargebacks error:', err)
      toast.error(err?.message || 'Failed to filter chargebacks')
    } finally {
      setIsFilteringChargebacks(false)
    }
  }

  const { user } = useSession()
  const role = user?.role
  const isSuperOwner = role === 'superOwner'
  const isLocked = !isSuperOwner && approvedCount > 1

  return (
    <div className="space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <h2 className="text-lg sm:text-xl font-semibold break-words leading-tight">{filename}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span className="font-medium">{recordCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                  <span className="font-medium text-green-600 dark:text-green-500">{approvedCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-red-600 dark:text-red-500" />
                  <span className="font-medium text-red-600 dark:text-red-500">{errorCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">{new Date(createdAt).toLocaleString()}</span>
                  <span className="sm:hidden text-sm">{new Date(createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0">
              {isSuperOwner && !isLocked && (
                <BatchSyncButton
                  uploadId={id}
                  totalRecords={recordCount}
                  onComplete={handleRefresh}
                />
              )}

              {!isSuperOwner && approvedCount === 0 && (
                <Button
                  variant="outline"
                  onClick={() => setFilterChargebacksOpen(true)}
                  disabled={isFilteringChargebacks}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter Chargebacks</span>
                </Button>
              )}

              {isSuperOwner && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 z-[100]">
                    {approvedCount > 0 && (
                      <>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault()
                            handleVoidApproved()
                          }}
                          disabled={voidAction.isLoading}
                          className="text-orange-600 focus:text-orange-700 focus:bg-orange-50 dark:focus:bg-orange-950/20 cursor-pointer"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          {voidAction.isLoading ? 'Voiding...' : `Void ${approvedCount} Approved`}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setManualVoidOpen(true)
                      }}
                      className="text-orange-600 focus:text-orange-700 focus:bg-orange-50 dark:focus:bg-orange-950/20 cursor-pointer"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Manual Void
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        handleReset()
                      }}
                      disabled={resetAction.isLoading}
                      className="cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {resetAction.isLoading ? 'Resetting...' : 'Reset'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setFilterChargebacksOpen(true)
                      }}
                      disabled={isFilteringChargebacks}
                      className="cursor-pointer"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      {isFilteringChargebacks ? 'Filtering...' : 'Filter Chargebacks'}
                    </DropdownMenuItem>
                    {filteredRecords && filteredRecords.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault()
                            setShowFilteredRowsOpen(true)
                          }}
                          className="cursor-pointer"
                        >
                          <Filter className="h-4 w-4 mr-2" />
                          Show Filtered Rows ({filteredRecords.length})
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        reconcileAction.execute()
                      }}
                      disabled={reconcileAction.isLoading}
                      className="cursor-pointer"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {reconcileAction.isLoading ? 'Reconciling...' : 'Reconcile'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async (e) => {
                        e.preventDefault()
                        if (!confirm(`This will submit all ${recordCount} pending records to the gateway. Continue?`)) return
                        const res = await fetch(`/api/emp/submit-batch/${id}`, { method: 'POST' })
                        const data = await res.json()
                        if (!res.ok) {
                          toast.error(data?.error || 'Submission failed')
                        } else {
                          toast.success(`Submitted ${data.approved || 0} records successfully`)
                          handleRefresh()
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit All to Gateway
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Void Dialog */}
      <Dialog open={manualVoidOpen} onOpenChange={setManualVoidOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manual Void Transaction</DialogTitle>
            <DialogDescription>
              Enter the transaction details to void. You can find the unique_id in the transaction response or reconciliation data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="uniqueId">
                Unique ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="uniqueId"
                placeholder="e.g., 44177a21403427eb96664a6d7e5d5d48"
                value={uniqueId}
                onChange={(e) => setUniqueId(e.target.value)}
                disabled={isManualVoiding}
              />
              <p className="text-xs text-muted-foreground">
                Required: The unique_id from the original transaction (reference_id for void)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transactionId">Transaction ID (Optional)</Label>
              <Input
                id="transactionId"
                placeholder="e.g., your-transaction-id-123"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                disabled={isManualVoiding}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Your original transaction_id for reference
              </p>
            </div>
            {manualVoidResult && (
              <div
                className={`p-3 rounded-md text-sm ${manualVoidResult.ok
                  ? 'bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                  }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{manualVoidResult.message}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManualVoidOpen(false)}
              disabled={isManualVoiding}
            >
              Close
            </Button>
            <Button
              onClick={handleManualVoid}
              disabled={isManualVoiding || !uniqueId.trim()}
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isManualVoiding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  Void Transaction
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter Chargebacks Dialog */}
      <AlertDialog open={filterChargebacksOpen} onOpenChange={setFilterChargebacksOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Filter Chargebacks from Upload
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>
                This will check all IBANs in this upload against the chargeback cache and
                <strong className="text-foreground"> remove any rows</strong> with IBANs that have chargebacks.
              </p>
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-medium text-foreground mb-1">What happens:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Compares all {recordCount} IBANs against chargeback database</li>
                  <li>Removes rows with matching IBANs</li>
                  <li>Updates the upload with clean data only</li>
                  <li>Cannot be undone (but original file is preserved)</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                💡 Tip: Make sure your chargeback cache is up-to-date before filtering.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFilterChargebacks} disabled={isFilteringChargebacks}>
              {isFilteringChargebacks ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Filtering...
                </>
              ) : (
                'Filter Now'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Show Filtered Rows Dialog */}
      <Dialog open={showFilteredRowsOpen} onOpenChange={setShowFilteredRowsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Filtered Rows ({filteredRecords?.length || 0})</DialogTitle>
            <DialogDescription>
              These rows were removed because they matched known chargeback IBANs.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md">
            <TableClient
              title=""
              subtitle=""
              headers={headers}
              records={filteredRecords || []}
              rowStatuses={(filteredRecords || []).map(() => 'error')}
              rowErrors={(filteredRecords || []).map(() => 'Filtered due to chargeback history')}
              uploadId={id}
              canEdit={false}
              canSyncRow={false}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFilteredRowsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {
        reconciliationReport && (
          <Card className="border-border/40 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <h3 className="text-base sm:text-lg font-semibold">Reconciliation Report</h3>
                  {lastReconciledAt && (
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      Last: {new Date(lastReconciledAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                  <div className="space-y-1 p-3 rounded-lg bg-muted/30">
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Total</p>
                    <p className="text-xl sm:text-2xl font-bold">{reconciliationReport.total}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <p className="text-xs sm:text-sm text-green-600 dark:text-green-400 font-medium">Approved</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{reconciliationReport.approved}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                    <p className="text-xs sm:text-sm text-yellow-600 dark:text-yellow-400 font-medium">Pending</p>
                    <p className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{reconciliationReport.pending}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 font-medium">Errors</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{reconciliationReport.error}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-muted/30">
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Not Sent</p>
                    <p className="text-xl sm:text-2xl font-bold">{reconciliationReport.notSubmitted}</p>
                  </div>
                </div>
                {reconciliationReport.missingInEmp?.length > 0 && (
                  <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/50 rounded-lg">
                    <p className="text-xs sm:text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      ⚠️ {reconciliationReport.missingInEmp.length} transaction(s) submitted but not found in EMP
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      }

      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <h3 className="text-base sm:text-lg font-semibold">Transaction Records</h3>
            {!isMobile && (
              <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 dark:bg-green-600 rounded-sm shadow-sm"></div>
                  <span className="text-muted-foreground">Approved</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 dark:bg-red-600 rounded-sm shadow-sm"></div>
                  <span className="text-muted-foreground">Error</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-400 dark:bg-gray-600 rounded-sm shadow-sm"></div>
                  <span className="text-muted-foreground">Pending</span>
                </div>
              </div>
            )}
          </div>
          <TableClient
            title=""
            subtitle=""
            headers={headers}
            records={records}
            rowStatuses={rowData.statuses}
            rowErrors={rowData.errors}
            uploadId={id}
            onRowEdited={handleRefresh}
            canEdit={!isLocked}
            canSyncRow={isSuperOwner}
          />
        </CardContent>
      </Card>

      <div className="pt-2">
        <Button asChild variant="ghost" className="gap-2 text-sm">
          <Link href="/emp">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div >
  )
}
