"use client"

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface BatchSyncButtonProps {
  uploadId: string
  totalRecords: number
  onComplete?: () => void
}

export function BatchSyncButton({ uploadId, totalRecords, onComplete }: BatchSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const beforeUnloadRef = useRef<(() => void) | null>(null)

  const clearBeforeUnload = () => {
    if (beforeUnloadRef.current) {
      beforeUnloadRef.current()
      beforeUnloadRef.current = null
    }
  }

  const setBeforeUnload = () => {
    if (beforeUnloadRef.current) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    beforeUnloadRef.current = () => {
      window.removeEventListener('beforeunload', handler)
    }
  }

  const submitBulk = async () => {
    setSyncing(true)
    
    try {
      toast.info(`Submitting ${totalRecords} transactions in bulk. Please keep this page open until the process finishes.`)
      setBeforeUnload()
      
      const res = await fetch(`/api/emp/submit-batch/${uploadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data?.error || 'Bulk submission failed')
      }

      // Show success summary
      const successCount = data.approved || 0
      const summaryErrorCount = data.errors || 0
      const runtime = data.runtime ? `${Math.round(data.runtime / 1000)}s` : ''
      
      if (summaryErrorCount > 0) {
        toast.warning(
          `✅ Submission complete${runtime ? ` in ${runtime}` : ''}: ${successCount} approved, ${summaryErrorCount} failed. Check the table for error details.`,
          { duration: 8000 }
        )
      } else {
        toast.success(
          `🎉 All done${runtime ? ` in ${runtime}` : ''}! ${successCount} transactions submitted successfully.`,
          { duration: 5000 }
        )
      }

      if (onComplete) onComplete()
    } catch (err: any) {
      toast.error(`❌ Submission failed: ${err?.message || 'Unknown error'}. Please try again.`)
    } finally {
      setSyncing(false)
      clearBeforeUnload()
    }
  }

  return (
    <Button
      onClick={submitBulk}
      disabled={syncing}
      size="lg"
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? 'Syncing...' : 'Sync All to Gateway'}
    </Button>
  )
}

