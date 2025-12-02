"use client"

import { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-breakpoint'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Column {
  key: string
  label: string
  render?: (value: any, row: any) => ReactNode
  className?: string
  mobileLabel?: string
}

interface ResponsiveTableProps {
  columns: Column[]
  data: any[]
  actions?: (row: any, index: number) => ReactNode
  getRowClassName?: (row: any) => string
  emptyMessage?: string
  loading?: boolean
  loadingMessage?: string
}

export function ResponsiveTable({
  columns,
  data,
  actions,
  getRowClassName,
  emptyMessage = 'No data available',
  loading = false,
  loadingMessage = 'Loading...',
}: ResponsiveTableProps) {
  const isMobile = useIsMobile()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="space-y-4">
        {data.map((row, index) => (
          <Card key={index} className={getRowClassName?.(row)}>
            <CardContent className="p-4 space-y-3">
              {columns.map((col) => (
                <div key={col.key} className="flex justify-between items-start gap-2">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">
                    {col.mobileLabel || col.label}:
                  </span>
                  <span className="text-sm text-right flex-1">
                    {col.render ? col.render(row[col.key], row) : row[col.key] || '-'}
                  </span>
                </div>
              ))}
              {actions && (
                <div className="pt-2 border-t flex justify-end gap-2">
                  {actions(row, index)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 text-left text-sm font-medium ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
              {actions && (
                <th className="py-3 px-4 text-right text-sm font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={index}
                className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                  getRowClassName?.(row) || ''
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`py-3 px-4 text-sm ${col.className || ''}`}>
                    {col.render ? col.render(row[col.key], row) : row[col.key] || '-'}
                  </td>
                ))}
                {actions && (
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {actions(row, index)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
