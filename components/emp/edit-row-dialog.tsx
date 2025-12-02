"use client"

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'

interface EditRowDialogProps {
  uploadId: string
  rowIndex: number
  record: Record<string, string>
  headers: string[]
  onSaved?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EditRowDialog({ uploadId, rowIndex, record, headers, onSaved, open: controlledOpen, onOpenChange: setControlledOpen }: EditRowDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen

  const [editedRecord, setEditedRecord] = useState<Record<string, string>>(record)
  const [saving, setSaving] = useState(false)

  // Update editedRecord when record changes or dialog opens
  useMemo(() => {
    setEditedRecord(record)
  }, [record, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      toast.info('Saving changes...')
      const res = await fetch(`/api/emp/edit-row/${uploadId}/${rowIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedRecord: editedRecord }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to save changes')

      toast.success('✓ Transaction updated. You can now re-submit this row.')
      setOpen(false)
      if (onSaved) onSaved()
    } catch (err: any) {
      toast.error(`❌ ${err?.message || 'Failed to save changes'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {!isControlled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditedRecord(record)
            setOpen(true)
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction #{rowIndex + 1}</DialogTitle>
            <DialogDescription>
              Make changes to the transaction details below. After saving, you'll need to re-submit this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {headers.map((header) => (
              <div key={header} className="space-y-2">
                <Label htmlFor={`field-${header}`} className="text-xs font-medium">
                  {header}
                </Label>
                <Input
                  id={`field-${header}`}
                  value={editedRecord[header] || ''}
                  onChange={(e) =>
                    setEditedRecord((prev) => ({ ...prev, [header]: e.target.value }))
                  }
                  className="text-sm"
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

