"use client"

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import Link from 'next/link'
import { Upload, Search, FileEdit, Trash2, Eye, CheckCircle, HelpCircle, Loader2, Building2, Users, FolderOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { ResponsiveTable } from '@/components/emp/responsive-table'
import { useAsyncAction } from '@/hooks/use-async-action'
import { Badge } from '@/components/ui/badge'
import { TruncatedFilename } from '@/components/emp/truncated-filename'
import { useIsMobile } from '@/hooks/use-breakpoint'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface SessionInfo {
    role: string
    agencyId?: string
}

interface Agency {
    _id: string
    name: string
    slug: string
}

interface Account {
    _id: string
    name: string
    slug: string
    agencyId: string
}

export default function EmpUploadPage() {
    const [file, setFile] = useState<File | null>(null)
    const [uploads, setUploads] = useState<any[]>([])
    const [q, setQ] = useState('')
    const [isLoadingUploads, setIsLoadingUploads] = useState(true)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const isMobile = useIsMobile()
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
    const [agencies, setAgencies] = useState<Agency[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([])
    const [assignDialogOpen, setAssignDialogOpen] = useState(false)
    const [assignAgencyId, setAssignAgencyId] = useState<string>('')
    const [assignAccountId, setAssignAccountId] = useState<string>('')
    const [filterAgencyId, setFilterAgencyId] = useState<string>('')
    const [filterAccountId, setFilterAccountId] = useState<string>('')
    const [showUnassigned, setShowUnassigned] = useState(false)

    const canAssign = sessionInfo?.role === 'superOwner' || sessionInfo?.role === 'agencyAdmin'
    const isSuperOwner = sessionInfo?.role === 'superOwner'

    const fetchUploads = useCallback(() => {
        setRefreshTrigger(prev => prev + 1)
    }, [])

    // Sort uploads by creation date (newest first)
    const sortedUploads = useMemo(() => {
        return [...uploads].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
    }, [uploads])

    // Load agencies and accounts for Super Owner
    useEffect(() => {
        if (!sessionInfo) return
        if (sessionInfo.role !== 'superOwner' && sessionInfo.role !== 'agencyAdmin') return

            ; (async () => {
                try {
                    if (sessionInfo.role === 'superOwner') {
                        const agenciesRes = await fetch('/api/emp/admin/agencies')
                        if (agenciesRes.ok) {
                            const data = await agenciesRes.json()
                            setAgencies(data.agencies || [])
                        }
                    }

                    const accountsRes = await fetch('/api/emp/admin/accounts')
                    if (accountsRes.ok) {
                        const data = await accountsRes.json()
                        setAccounts(data.accounts || [])
                    }
                } catch (err) {
                    console.error('Failed to load organizations:', err)
                }
            })()
    }, [sessionInfo])

    // Filter accounts based on selected agency
    const filteredAccounts = useMemo(() => {
        if (!assignAgencyId) return accounts
        return accounts.filter(a => a.agencyId === assignAgencyId)
    }, [accounts, assignAgencyId])

    const filterAccounts = useMemo(() => {
        if (!filterAgencyId) return accounts
        return accounts.filter(a => a.agencyId === filterAgencyId)
    }, [accounts, filterAgencyId])

    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

            ; (async () => {
                try {
                    setIsLoadingUploads(true)
                    const params = new URLSearchParams()
                    if (q) params.set('q', q)
                    if (showUnassigned) params.set('unassigned', 'true')
                    else {
                        if (filterAgencyId) params.set('agencyId', filterAgencyId)
                        if (filterAccountId) params.set('accountId', filterAccountId)
                    }
                    const res = await fetch('/api/emp/uploads' + (params.toString() ? `?${params.toString()}` : ''), {
                        signal: controller.signal
                    })
                    const data = await res.json()
                    if (!cancelled && res.ok) {
                        setUploads(data.items || [])
                        if (data.session) setSessionInfo(data.session)
                    }
                } catch (err: any) {
                    if (!cancelled && err.name !== 'AbortError') {
                        toast.error('Failed to load upload history')
                    }
                } finally {
                    if (!cancelled) setIsLoadingUploads(false)
                }
            })()

        return () => {
            cancelled = true
            controller.abort('Component unmounted or dependencies changed')
        }
    }, [q, refreshTrigger, filterAgencyId, filterAccountId, showUnassigned])

    const uploadAction = useAsyncAction(
        async (file: File) => {
            const form = new FormData()
            form.append('file', file)

            const res = await fetch('/api/emp/upload', {
                method: 'POST',
                body: form,
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Upload failed')

            return data
        },
        {
            loadingMessage: '📤 Uploading and parsing CSV file...',
            onSuccess: (data) => {
                const totalRecords = Number(data?.totalRecords ?? data?.count ?? 0)
                const partCount = Number(data?.parts ?? 1)
                const uploadsCreated = Array.isArray(data?.uploads) ? data.uploads : []
                const rangeMessage = partCount > 1 && uploadsCreated.length > 0
                    ? ` Split into ${partCount} batches (${uploadsCreated.map((u: any) => `${u.recordCount} rows`).join(', ')}).`
                    : ''
                toast.success(`✅ Success! ${totalRecords} transactions loaded.${rangeMessage}`)
                setFile(null)

                const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
                if (fileInput) fileInput.value = ''

                fetchUploads()
            },
        }
    )

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (!file) {
            toast.error('⚠️ Please select a CSV file first')
            return
        }
        await uploadAction.execute(file)
    }

    const reconcileAction = useAsyncAction(
        async (uploadId: string) => {
            const res = await fetch(`/api/emp/reconcile/${uploadId}`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to check status')
            return data
        },
        {
            loadingMessage: 'Checking status with payment gateway...',
            onSuccess: (data) => {
                const report = data.report
                toast.success(`Status updated: ${report.approved} approved, ${report.error} errors`)
                fetchUploads()
            },
        }
    )

    const replaceAction = useAsyncAction(
        async ({ uploadId, file }: { uploadId: string; file: File }) => {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch(`/api/emp/uploads/replace/${uploadId}`, { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Replace failed')
            return data
        },
        {
            loadingMessage: 'Replacing file...',
            successMessage: 'File replaced successfully',
            onSuccess: () => fetchUploads(),
        }
    )

    const deleteAction = useAsyncAction(
        async (uploadId: string) => {
            const res = await fetch(`/api/emp/uploads/delete/${uploadId}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Delete failed')
            return data
        },
        {
            successMessage: 'Upload deleted successfully',
            onSuccess: () => fetchUploads(),
        }
    )

    const assignAction = useAsyncAction(
        async ({ uploadIds, agencyId, accountId }: { uploadIds: string[], agencyId: string, accountId: string }) => {
            const res = await fetch('/api/emp/uploads/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadIds, agencyId: agencyId || null, accountId: accountId || null }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Assignment failed')
            return data
        },
        {
            successMessage: 'Uploads assigned successfully',
            onSuccess: () => {
                setSelectedUploadIds([])
                setAssignDialogOpen(false)
                setAssignAgencyId('')
                setAssignAccountId('')
                fetchUploads()
            },
        }
    )

    const toggleUploadSelection = (uploadId: string) => {
        setSelectedUploadIds(prev =>
            prev.includes(uploadId)
                ? prev.filter(id => id !== uploadId)
                : [...prev, uploadId]
        )
    }

    const selectAllUploads = () => {
        if (selectedUploadIds.length === sortedUploads.length) {
            setSelectedUploadIds([])
        } else {
            setSelectedUploadIds(sortedUploads.map(u => u._id))
        }
    }

    const columns = [
        ...(canAssign ? [{
            key: '_select',
            label: '',
            render: (_: any, row: any) => (
                <input
                    type="checkbox"
                    checked={selectedUploadIds.includes(row._id)}
                    onChange={() => toggleUploadSelection(row._id)}
                    className="h-4 w-4 rounded border-gray-300"
                />
            ),
        }] : []),
        {
            key: 'filename',
            label: 'Filename',
            mobileLabel: 'File',
            render: (value: string) => (
                <span className="font-medium">
                    <TruncatedFilename filename={value} maxLength={isMobile ? 25 : 40} />
                </span>
            ),
        },
        {
            key: 'recordCount',
            label: 'Records',
            render: (value: number) => value?.toLocaleString() || '0',
        },
        {
            key: 'approvedCount',
            label: 'Approved',
            render: (value: number) => (
                <span className="text-green-600 dark:text-green-400 font-medium">
                    {value || 0}
                </span>
            ),
        },
        {
            key: 'errorCount',
            label: 'Errors',
            render: (value: number) => (
                <span className="text-red-600 dark:text-red-400 font-medium">
                    {value || 0}
                </span>
            ),
        },
        ...(isSuperOwner ? [{
            key: 'agencyName',
            label: 'Agency',
            render: (value: string | null) => (
                <span className={value ? 'text-foreground' : 'text-muted-foreground italic'}>
                    {value || 'Unassigned'}
                </span>
            ),
        }] : []),
        {
            key: 'accountName',
            label: 'Account',
            render: (value: string | null) => (
                <span className={value ? 'text-foreground' : 'text-muted-foreground italic'}>
                    {value || 'Unassigned'}
                </span>
            ),
        },
        {
            key: 'createdAt',
            label: 'Uploaded',
            mobileLabel: 'Date',
            render: (value: string) => (
                <span className="text-muted-foreground">
                    {new Date(value).toLocaleString()}
                </span>
            ),
        },
    ]

    return (
        <TooltipProvider>
            <div className="space-y-6 p-4 md:p-6">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <CardTitle>Upload CSV File</CardTitle>
                                    <CardDescription className="mt-1">
                                        Select a CSV file to process SEPA Direct Debit transactions (max 50MB, 50,000 records)
                                    </CardDescription>
                                </div>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2 shrink-0">
                                        <HelpCircle className="h-4 w-4" />
                                        <span className="hidden sm:inline">Help</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>How to use the EMP portal</DialogTitle>
                                        <DialogDescription>
                                            Quick reference for uploads, syncing and reconciliation.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 text-sm">
                                        <div>
                                            <h4 className="font-semibold">CSV requirements</h4>
                                            <ul className="mt-2 space-y-1 list-disc pl-5">
                                                <li>Only CSV files are supported (max 50 MB per file).</li>
                                                <li>We accept up to 50,000 rows per upload. Files with more than 2,500 rows are automatically split into batches of 2,500.</li>
                                                <li>Each batch appears as a separate upload (e.g. <em>Part 1/4</em>) in the history table.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">Workflow</h4>
                                            <ul className="mt-2 space-y-1 list-disc pl-5">
                                                <li>After uploading, open the upload to review and edit records before syncing.</li>
                                                <li>Use "Submit All to Gateway" to send a batch to Genesis/EMP.</li>
                                                <li>Run "Reconcile" to refresh statuses from Genesis.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">Mapping &amp; support</h4>
                                            <ul className="mt-2 space-y-1 list-disc pl-5">
                                                <li>If you receive a CSV in a <strong>new format</strong>, contact Kiril for a mapping review before syncing.</li>
                                                <li>Email: <a className="underline" href="mailto:kiriltsanov12@gmail.com">kiriltsanov12@gmail.com</a></li>
                                                <li>Telegram: <a className="underline" href="https://t.me/+359888010283" target="_blank" rel="noopener noreferrer">+359 888 010 283</a></li>
                                            </ul>
                                        </div>
                                        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                            Tip: keep each CSV's headers consistent. If a column is renamed, let us know so we can update the field mapping and avoid validation errors.
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <Input
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                    className="flex-1"
                                    disabled={uploadAction.isLoading}
                                />
                                <Button
                                    type="submit"
                                    disabled={!file || uploadAction.isLoading}
                                    className="gap-2 sm:min-w-[140px]"
                                    size="lg"
                                >
                                    {uploadAction.isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Uploading…
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4" />
                                            Upload File
                                        </>
                                    )}
                                </Button>
                            </div>
                            {file && (
                                <p className="text-sm text-muted-foreground">
                                    Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
                                </p>
                            )}
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Upload History</CardTitle>
                                <CardDescription>View and manage your uploaded CSV files</CardDescription>
                            </div>
                            {canAssign && selectedUploadIds.length > 0 && (
                                <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <FolderOpen className="h-4 w-4" />
                                            Assign {selectedUploadIds.length} selected
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Assign Uploads to Organization</DialogTitle>
                                            <DialogDescription>
                                                Assign {selectedUploadIds.length} selected upload(s) to an agency and/or account.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            {isSuperOwner && (
                                                <div className="space-y-2">
                                                    <Label htmlFor="assign-agency">Agency</Label>
                                                    <Select value={assignAgencyId || '__none__'} onValueChange={(v) => {
                                                        setAssignAgencyId(v === '__none__' ? '' : v)
                                                        setAssignAccountId('')
                                                    }}>
                                                        <SelectTrigger id="assign-agency">
                                                            <SelectValue placeholder="Select agency (optional)" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__none__">No agency (unassign)</SelectItem>
                                                            {agencies.map(a => (
                                                                <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div className="space-y-2">
                                                <Label htmlFor="assign-account">Account</Label>
                                                <Select value={assignAccountId || '__none__'} onValueChange={(v) => setAssignAccountId(v === '__none__' ? '' : v)}>
                                                    <SelectTrigger id="assign-account">
                                                        <SelectValue placeholder="Select account (optional)" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none__">No account (unassign)</SelectItem>
                                                        {filteredAccounts.map(a => (
                                                            <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <DialogClose asChild>
                                                <Button variant="outline">Cancel</Button>
                                            </DialogClose>
                                            <Button
                                                onClick={() => assignAction.execute({
                                                    uploadIds: selectedUploadIds,
                                                    agencyId: assignAgencyId,
                                                    accountId: assignAccountId
                                                })}
                                                disabled={assignAction.isLoading}
                                            >
                                                {assignAction.isLoading ? (
                                                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assigning...</>
                                                ) : (
                                                    'Assign'
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by filename..."
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                {canAssign && (
                                    <div className="flex gap-2 flex-wrap">
                                        {isSuperOwner && (
                                            <Select value={filterAgencyId || '__all__'} onValueChange={(v) => {
                                                setFilterAgencyId(v === '__all__' ? '' : v)
                                                setFilterAccountId('')
                                                setShowUnassigned(false)
                                            }}>
                                                <SelectTrigger className="w-[160px]">
                                                    <SelectValue placeholder="All Agencies" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__all__">All Agencies</SelectItem>
                                                    {agencies.map(a => (
                                                        <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        <Select value={filterAccountId || '__all__'} onValueChange={(v) => {
                                            setFilterAccountId(v === '__all__' ? '' : v)
                                            setShowUnassigned(false)
                                        }}>
                                            <SelectTrigger className="w-[160px]">
                                                <SelectValue placeholder="All Accounts" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All Accounts</SelectItem>
                                                {filterAccounts.map(a => (
                                                    <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant={showUnassigned ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => {
                                                setShowUnassigned(!showUnassigned)
                                                if (!showUnassigned) {
                                                    setFilterAgencyId('')
                                                    setFilterAccountId('')
                                                }
                                            }}
                                        >
                                            Unassigned
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {canAssign && sortedUploads.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={selectAllUploads}>
                                        {selectedUploadIds.length === sortedUploads.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                    {selectedUploadIds.length > 0 && (
                                        <span className="text-sm text-muted-foreground">
                                            {selectedUploadIds.length} selected
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <ResponsiveTable
                            columns={columns}
                            data={sortedUploads}
                            loading={isLoadingUploads}
                            loadingMessage="Loading uploads..."
                            emptyMessage="No uploads yet. Upload a CSV file above to get started."
                            actions={(upload) => {
                                const isLocked = !isSuperOwner && (upload.approvedCount || 0) > 1

                                return (
                                    <>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button asChild variant="ghost" size="sm">
                                                    <Link href={`/emp/uploads/${upload._id}`}>
                                                        <Eye className="h-4 w-4" />
                                                        <span className="sr-only">View details</span>
                                                    </Link>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>View details</TooltipContent>
                                        </Tooltip>

                                        {!isLocked && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <label className="inline-flex items-center justify-center h-8 w-8 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50">
                                                        <FileEdit className="h-4 w-4" />
                                                        <input
                                                            type="file"
                                                            accept=".csv,text/csv"
                                                            className="hidden"
                                                            disabled={replaceAction.isLoading}
                                                            onChange={async (e) => {
                                                                const f = e.target.files?.[0]
                                                                if (!f) return
                                                                await replaceAction.execute({ uploadId: upload._id, file: f })
                                                            }}
                                                        />
                                                        <span className="sr-only">Replace with new file</span>
                                                    </label>
                                                </TooltipTrigger>
                                                <TooltipContent>Replace with new file</TooltipContent>
                                            </Tooltip>
                                        )}

                                        {!isLocked && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={async () => {
                                                            if (!confirm('Are you sure you want to delete this upload? This action cannot be undone.')) return
                                                            await deleteAction.execute(upload._id)
                                                        }}
                                                        disabled={deleteAction.isLoading}
                                                    >
                                                        {deleteAction.isLoading ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                        <span className="sr-only">Delete upload</span>
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Delete upload</TooltipContent>
                                            </Tooltip>
                                        )}
                                    </>
                                )
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        </TooltipProvider>
    )
}
