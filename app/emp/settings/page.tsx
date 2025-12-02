"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Save, RotateCcw, Info, Settings2, Database, Loader2 } from 'lucide-react'
import { useRequireSession } from '@/contexts/session-context'

type FieldMapping = {
  amount: string[]
  currency: string[]
  usage: string[]
  firstName: string[]
  lastName: string[]
  address1: string[]
  zipCode: string[]
  city: string[]
  country: string[]
  email: string[]
  iban: string[]
  remoteIp: string[]
  shopperId: string[]
  dueDate: string[]
}

const DEFAULT_MAPPING: FieldMapping = {
  amount: ['ProduktPreis', 'produktpreis', 'amount'],
  currency: ['Curr', 'currency'],
  usage: ['Usage', 'usage'],
  firstName: ['Given', 'first_name', 'given'],
  lastName: ['Family', 'last_name', 'family'],
  address1: ['Street', 'address1', 'street'],
  zipCode: ['Zip', 'zip_code', 'zip'],
  city: ['City', 'city'],
  country: ['CustomerCountry', 'country', 'accountcountry'],
  email: ['Email', 'customer_email', 'email'],
  iban: ['Iban', 'iban'],
  remoteIp: ['IP', 'remote_ip', 'ip'],
  shopperId: ['ShopperId', 'shopperid'],
  dueDate: ['DueDate', 'duedate'],
}

const FIELD_LABELS: Record<keyof FieldMapping, string> = {
  amount: 'Amount',
  currency: 'Currency',
  usage: 'Usage / Description',
  firstName: 'First Name',
  lastName: 'Last Name',
  address1: 'Address',
  zipCode: 'Zip Code',
  city: 'City',
  country: 'Country',
  email: 'Email',
  iban: 'IBAN',
  remoteIp: 'Remote IP',
  shopperId: 'Shopper ID',
  dueDate: 'Due Date',
}

const FIELD_DESCRIPTIONS: Record<keyof FieldMapping, string> = {
  amount: 'Transaction amount (will be converted to minor units)',
  currency: 'Currency code (e.g., EUR, USD)',
  usage: 'Transaction description or reference',
  firstName: 'Customer first name',
  lastName: 'Customer last name',
  address1: 'Street address',
  zipCode: 'Postal/ZIP code',
  city: 'City name',
  country: 'Country code (e.g., DE, US)',
  email: 'Customer email address',
  iban: 'IBAN number',
  remoteIp: 'Customer IP address (optional)',
  shopperId: 'Unique shopper/customer identifier',
  dueDate: 'Payment due date',
}

export default function SettingsPage() {
  const session = useRequireSession()

  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingIndexes, setIsCreatingIndexes] = useState(false)

  async function createIndexes() {
    if (!confirm('This will create database indexes to optimize analytics performance. Continue?')) return

    setIsCreatingIndexes(true)
    try {
      toast.info('Creating database indexes...')
      const res = await fetch('/api/emp/admin/indexes', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to create indexes')

      toast.success('✓ Database indexes created successfully!')
    } catch (err: any) {
      toast.error(`❌ ${err?.message || 'Failed to create indexes'}`)
    } finally {
      setIsCreatingIndexes(false)
    }
  }

  useEffect(() => {
    // Redirect non-Super Owners
    if (!session.loading && session.user?.role !== 'superOwner') {
      window.location.href = '/emp'
    }
  }, [session.loading, session.user])

  useEffect(() => {
    // Load saved mapping
    ; (async () => {
      try {
        const res = await fetch('/api/emp/settings/mapping')
        if (res.ok) {
          const data = await res.json()
          if (data.mapping) {
            setMapping(data.mapping)
          }
        }
      } catch (e) {
        console.error('Failed to load mapping', e)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function onSave() {
    setIsSaving(true)
    try {
      toast.info('Saving field mappings...')
      const res = await fetch('/api/emp/settings/mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mapping }),
      })
      if (!res.ok) throw new Error('Failed to save configuration')
      toast.success('✓ Field mappings saved successfully')
    } catch (e: any) {
      toast.error(`❌ ${e?.message || 'Failed to save configuration'}`)
    } finally {
      setIsSaving(false)
    }
  }

  function onReset() {
    if (confirm('Are you sure you want to reset all field mappings to their default values? This action cannot be undone.')) {
      setMapping(DEFAULT_MAPPING)
      toast.success('✓ Field mappings reset to defaults')
    }
  }

  function updateField(key: keyof FieldMapping, value: string) {
    const aliases = value.split(',').map((s) => s.trim()).filter(Boolean)
    setMapping((prev) => ({ ...prev, [key]: aliases }))
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Field Mapping Configuration</CardTitle>
            <CardDescription>Configure how CSV column names map to transaction fields</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">How Field Mapping Works</h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  When processing CSV files, the system searches for each field using the aliases you define below (in order).
                  For example, if you set "Amount" aliases as "ProduktPreis, amount, price", it will first try to find a column
                  named "ProduktPreis", then "amount", then "price".
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Tip:</strong> Add multiple variations to handle different CSV formats automatically. Fields marked with <span className="text-red-500">*</span> are required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle>CSV Field Mapping</CardTitle>
            </div>
            <CardDescription>
              Configure how CSV columns map to transaction fields. Provide comma-separated aliases (checked in order).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(Object.keys(mapping) as Array<keyof FieldMapping>).map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium">
                  {FIELD_LABELS[key]}
                  {key === 'amount' || key === 'iban' ? (
                    <span className="text-red-500 ml-1">*</span>
                  ) : null}
                </Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  {FIELD_DESCRIPTIONS[key]}
                </p>
                <Input
                  id={key}
                  value={mapping[key].join(', ')}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder="e.g., ColumnName, column_name, alternate_name"
                  className="font-mono text-sm"
                />
              </div>
            ))}

            <div className="flex items-center gap-3 pt-4 border-t">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={onSave} disabled={isSaving} className="gap-2" size="lg">
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save field mapping configuration</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={onReset} variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore default field mappings</TooltipContent>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Common CSV Column Names</CardTitle>
            <CardDescription>
              Reference list of typical column names found in your CSV files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted/50 p-4 font-mono text-xs leading-relaxed break-words border">
              Method, Type, TransactionId, ReferenceId, ShopperId, ChannelId, Mode, Reserved1, RecurrenceMode,
              DueDate, ProduktPreis, Curr, Usage, MandatsNummer, MandateDateOfSignature, Salutation, Title,
              Given, Family, Company, Street, Zip, City, State, CustomerCountry, Phone, Mobile, Email, IP,
              PassportId, IDCard, TaxStatementId, Reserved2, Reserved3, Holder, Number, Bank, AccountCountry,
              Reserved4, Reserved5, Reserved6, Iban, Bic, Reserved7, Reserved8, Reserved9, Reserved10,
              Reserved11, Reserved12
            </div>
          </CardContent>
        </Card>

        {/* Database Optimization Card */}
        <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-orange-900 dark:text-orange-100">Database Optimization</CardTitle>
            </div>
            <CardDescription className="text-orange-800 dark:text-orange-200">
              Run this if you notice slow performance on the Analytics page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={createIndexes}
              disabled={isCreatingIndexes}
              variant="outline"
              className="gap-2 border-orange-200 hover:bg-orange-100 hover:text-orange-900 dark:border-orange-800 dark:hover:bg-orange-900 dark:hover:text-orange-100"
            >
              {isCreatingIndexes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {isCreatingIndexes ? 'Optimizing Database...' : 'Create Analytics Indexes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

