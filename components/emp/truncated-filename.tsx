"use client"

import { useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface TruncatedFilenameProps {
  filename: string
  maxLength?: number
  className?: string
}

export function TruncatedFilename({ 
  filename, 
  maxLength = 30,
  className = "" 
}: TruncatedFilenameProps) {
  const [open, setOpen] = useState(false)
  const shouldTruncate = filename.length > maxLength
  const displayName = shouldTruncate 
    ? `${filename.slice(0, maxLength)}...` 
    : filename

  if (!shouldTruncate) {
    return <span className={className}>{filename}</span>
  }

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(true)}
              className={`underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer text-left ${className}`}
            >
              {displayName}
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-md break-all hidden md:block">
            <p>{filename}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-normal text-muted-foreground">
              Full Filename
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm break-all">{filename}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
