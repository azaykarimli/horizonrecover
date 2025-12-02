import { SddSaleRequest } from '@/lib/emerchantpay'

type EmpRecord = Record<string, string>

export type CompanyConfig = {
  name: string
  contactEmail: string
  returnUrls: {
    baseUrl: string
    successPath?: string
    failurePath?: string
    pendingPath?: string
    cancelPath?: string
  }
  dynamicDescriptor?: {
    merchantName?: string
    merchantUrl?: string
  }
  fallbackDescription?: string
}

export function parseEmpCsv(csvText: string): EmpRecord[] {
  // Validate input
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('Invalid CSV input: must be a non-empty string')
  }

  // Remove BOM if present
  let text = csvText.charCodeAt(0) === 0xFEFF ? csvText.substring(1) : csvText

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    throw new Error('CSV file is empty or contains no valid lines')
  }

  if (lines.length === 1) {
    throw new Error('CSV file only contains headers, no data rows found')
  }

  // Detect delimiter from first line
  const delimiter = detectDelimiter(lines[0])
  const rawHeaders = splitCsvLine(lines[0], delimiter)

  if (rawHeaders.length === 0) {
    throw new Error('No columns detected in CSV header')
  }

  // Handle empty headers by naming them uniquely, and deduplicate any repeated headers
  const headers: string[] = []
  const headerCounts = new Map<string, number>()

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    const trimmed = rawHeaders[idx].trim()
    let headerName = trimmed || `_empty_${idx}`

    // If this header name already exists (and it's not an empty column), make it unique
    if (!headerName.startsWith('_empty_') && headerCounts.has(headerName)) {
      const count = headerCounts.get(headerName)! + 1
      headerCounts.set(headerName, count)
      headerName = `${headerName}_${count}`
      console.warn(`[CSV Parser] Duplicate header "${trimmed}" renamed to "${headerName}"`)
    } else if (!headerName.startsWith('_empty_')) {
      headerCounts.set(headerName, 1)
    }

    headers.push(headerName)
  }

  const records: EmpRecord[] = []
  const errorRows: number[] = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const line = lines[i]
      if (!line || line.trim().length === 0) continue

      const cells = splitCsvLine(line, delimiter)
      const obj: EmpRecord = {}

      for (let j = 0; j < headers.length; j++) {
        // Skip empty header columns
        if (!headers[j].startsWith('_empty_')) {
          obj[headers[j]] = cells[j] ?? ''
        }
      }

      // Only add if the record has at least one non-empty value
      const hasData = Object.values(obj).some(v => v && v.trim().length > 0)
      if (hasData) {
        records.push(obj)
      }
    } catch (rowError) {
      console.error(`[CSV Parser] Error parsing row ${i + 1}:`, rowError)
      errorRows.push(i + 1)
    }
  }

  if (errorRows.length > 0 && errorRows.length === lines.length - 1) {
    throw new Error(`Failed to parse any rows. Errors on rows: ${errorRows.slice(0, 5).join(', ')}${errorRows.length > 5 ? '...' : ''}`)
  }

  if (records.length === 0) {
    throw new Error('No valid data rows found in CSV (all rows may be empty)')
  }

  if (errorRows.length > 0) {
    console.warn(`[CSV Parser] ${errorRows.length} rows had parsing errors and were skipped`)
  }

  console.log(`[CSV Parser] Successfully parsed ${records.length} records`)
  return records
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length
  const semicolons = (headerLine.match(/;/g) || []).length

  // Debug log
  try {
    console.log('[CSV Parser] Delimiter detection:', {
      headerPreview: headerLine.substring(0, 100),
      commas,
      semicolons,
      charCodes: headerLine.substring(0, 50).split('').map(c => c.charCodeAt(0)).join(',')
    })
  } catch { }

  return semicolons > commas ? ';' : ','
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  const trimmed = result.map((s) => s.trim())

  // Fallback: if we only got 1 field but there are delimiters, the quote logic failed
  // Just do a simple split
  if (trimmed.length === 1 && line.includes(delimiter)) {
    try {
      console.log('[CSV Parser] Quote-aware parsing failed, using simple split')
    } catch { }
    return line.split(delimiter).map(s => s.trim())
  }

  return trimmed
}

// Placeholder for EMP portal integration
export async function pushToEmpPortal(_records: EmpRecord[]): Promise<void> {
  // Implement actual integration here: authenticate and POST to EMP
  // Credentials and endpoints should come from environment variables
}

export type FieldMapping = {
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
  productDescriptor: string[] // For dynamic descriptor params (merchant name)
}

const DEFAULT_MAPPING: FieldMapping = {
  amount: ['amount', 'Amount', 'ProduktPreis', 'produktpreis', 'Betrag'],
  currency: ['currency', 'Curr'],
  usage: ['merchantinformation', 'vzweck1', 'Usage', 'usage', 'Produkt', 'Bemerkung'],
  firstName: ['customerfirstname', 'Given', 'first_name', 'given', 'Vorname'],
  lastName: ['customerlastname', 'Family', 'last_name', 'family', 'Name'],
  address1: ['customerstreet', 'Street', 'address1', 'street', 'Strasse', 'Straße', 'Adresszusatz'],
  zipCode: ['customerzip', 'Zip', 'zip_code', 'zip', 'PLZ'],
  city: ['customercity', 'City', 'city', 'Ort'],
  country: ['customercountry', 'CustomerCountry', 'country', 'accountcountry', 'Land'],
  email: ['customeremail', 'Email', 'customer_email', 'email'],
  iban: ['iban', 'Iban'],
  remoteIp: ['merchantip', 'customerip', 'IP', 'remote_ip', 'ip'],
  shopperId: ['customerid', 'mandatereference', 'ShopperId', 'shopperid', 'Kundennummer'],
  dueDate: ['mandatesigneddate', 'DueDate', 'duedate', 'Spielbeginn'],
  productDescriptor: ['product_descriptor', 'vzweck1', 'Produkt', 'ProductDescriptor', 'descriptor'],
}

function mergeMappingDefaults(customMapping?: FieldMapping | null): FieldMapping {
  if (!customMapping) return DEFAULT_MAPPING
  const merged: FieldMapping = { ...DEFAULT_MAPPING }
  const keys = Object.keys(DEFAULT_MAPPING) as Array<keyof FieldMapping>
  for (const key of keys) {
    const customNames = Array.isArray(customMapping[key]) ? customMapping[key]!.filter(Boolean) : []
    if (customNames.length > 0) {
      const seen = new Set<string>()
      const mergedNames: string[] = []
      for (const name of customNames.concat(DEFAULT_MAPPING[key])) {
        if (!name) continue
        const normalized = name.trim()
        if (!normalized) continue
        const lower = normalized.toLowerCase()
        if (seen.has(lower)) continue
        seen.add(lower)
        mergedNames.push(normalized)
      }
      merged[key] = mergedNames
    }
  }
  return merged
}

function splitFullName(fullNameRaw: string): { firstName: string; lastName: string } {
  const cleaned = (fullNameRaw || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return { firstName: '', lastName: '' }

  if (cleaned.includes(',')) {
    const [last, first] = cleaned
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (first && last) {
      return { firstName: first, lastName: last }
    }
  }

  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] }
  }

  const [firstName, ...rest] = parts
  return {
    firstName,
    lastName: rest.join(' '),
  }
}

export function mapRecordToSddSale(
  record: Record<string, string>,
  rowIndex: number,
  customMapping?: FieldMapping | null,
  filename?: string,
  companyConfig?: CompanyConfig | null
): SddSaleRequest {
  const getField = (fields: string[]): string => {
    for (const field of fields) {
      if (record[field]) return record[field].trim()
      // Try case-insensitive match
      const key = Object.keys(record).find(k => k.toLowerCase() === field.toLowerCase())
      if (key && record[key]) return record[key].trim()
    }
    return ''
  }

  const mapping = mergeMappingDefaults(customMapping)

  const amountStr = getField(mapping.amount)
  const amount = Math.round(parseFloat(amountStr.replace(',', '.')) * 100)

  if (isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid amount at row ${rowIndex + 1}: ${amountStr}`)
  }

  const currency = getField(mapping.currency) || 'EUR'

  // Usage/Description logic with fallback
  let usage = getField(mapping.usage)
  if (!usage && companyConfig?.fallbackDescription) {
    usage = companyConfig.fallbackDescription
  }

  if (!usage) {
    throw new Error(`Missing usage/description at row ${rowIndex + 1}`)
  }

  let firstName = getField(mapping.firstName)
  let lastName = getField(mapping.lastName)

  // Fallback: Try to parse from single name field if specific fields are missing
  if (!firstName || !lastName) {
    const nameField = ['customername', 'name', 'Name', 'CustomerName'].find(f => record[f] || Object.keys(record).find(k => k.toLowerCase() === f.toLowerCase()))
    if (nameField) {
      const fullName = getField([nameField])
      if (fullName) {
        const parts = splitFullName(fullName)
        if (!firstName) firstName = parts.firstName
        if (!lastName) lastName = parts.lastName
      }
    }
  }

  if (!firstName || !lastName) {
    throw new Error(`Missing customer name at row ${rowIndex + 1}`)
  }

  const iban = getField(mapping.iban).replace(/\s/g, '')
  if (!iban) {
    throw new Error(`Missing IBAN at row ${rowIndex + 1}`)
  }

  // Use provided config
  const config = companyConfig

  const transactionId = `txn_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(7)}`

  return {
    transactionId,
    usage,
    remoteIp: getField(mapping.remoteIp) || '127.0.0.1',
    amountMinor: amount,
    currency,
    firstName,
    lastName,
    address1: getField(mapping.address1) || 'Unknown Street',
    zipCode: getField(mapping.zipCode) || '00000',
    city: getField(mapping.city) || 'Unknown City',
    country: getField(mapping.country) || 'DE',
    iban,
    dynamicDescriptorParams: config?.dynamicDescriptor,
    customReturnUrls: config?.returnUrls,
  }
}

function buildTransactionId(shopperId: string, dueDate: string, index: number): string {
  // Create a unique transaction ID with timestamp component
  const now = new Date()
  const timestamp = Date.now().toString(36) // Base-36 timestamp for shorter ID

  // Add random component for extra uniqueness (prevents duplicates when uploading same file multiple times)
  const random = Math.random().toString(36).substring(2, 6) // 4 random chars

  const sanitizedShopperId = (shopperId || 'shp').replace(/[^0-9A-Za-z]/g, '').slice(0, 20)

  // Use current date instead of CSV due date for better uniqueness
  const currentDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

  const components = [
    sanitizedShopperId,
    currentDate, // Current date: YYYYMMDD format
    timestamp,
    random, // Random component for uniqueness
    index.toString().padStart(4, '0') // Pad index for consistent sorting (reduced to 4 digits to save space)
  ].filter(Boolean)

  const fullId = components.join('-')

  // Ensure ID is within limits (max 50 chars for most payment processors)
  return fullId.slice(0, 50) || `txn-${timestamp}-${random}-${index}`
}


export function stripRetrySuffix(transactionId: string | undefined | null): string {
  const value = (transactionId || '').trim()
  if (!value) return ''
  return value.replace(/_retry\d+$/i, '')
}

export function buildRetryTransactionId(baseTransactionId: string, retryCount: number): string {
  const base = stripRetrySuffix(baseTransactionId) || 'txn'
  if (!retryCount || retryCount <= 0) {
    return base
  }
  const suffix = `_retry${retryCount}`
  const maxLength = 50
  const trimmedBase = base.length + suffix.length > maxLength
    ? base.slice(0, Math.max(0, maxLength - suffix.length))
    : base
  return `${trimmedBase}${suffix}`
}


