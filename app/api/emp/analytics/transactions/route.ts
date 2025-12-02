import { NextRequest, NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Helper to build basic auth header
function getAuthHeader() {
  const username = process.env.EMP_GENESIS_USERNAME
  const password = process.env.EMP_GENESIS_PASSWORD

  if (!username || !password) {
    throw new Error('EMP credentials not configured')
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

// Helper to get the reporting endpoint
function getReportingEndpoint() {
  let endpoint = process.env.EMP_GENESIS_ENDPOINT || 'https://staging.gate.emerchantpay.net'

  // Ensure the endpoint has a protocol
  if (!/^https?:\/\//i.test(endpoint)) {
    endpoint = 'https://' + endpoint.replace(/^\/\//, '')
  }

  // Use the base URL without /process/{token} for reporting APIs
  return endpoint.replace(/\/process.*$/, '')
}

// Helper to parse XML response
function parseXMLValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : ''
}

// Helper to read numeric attribute values from the root wrapper element
function parseResponsesAttr(xml: string, root: 'payment_responses' | 'chargeback_responses', attr: string): number {
  const re = new RegExp(`<${root}[^>]*${attr}="(\\d+)"`, 'i')
  const m = xml.match(re)
  return m ? parseInt(m[1], 10) : 0
}

// Helper to parse payment responses from reconcile API
function parsePaymentResponsesXML(xml: string): any[] {
  const transactions: any[] = []

  // Match all payment_response blocks (from reconcile API)
  const transactionBlocks = xml.match(/<payment_response>[\s\S]*?<\/payment_response>/g) || []

  console.log(`[Analytics] Found ${transactionBlocks.length} payment_response blocks in XML`)

  for (const block of transactionBlocks) {
    const transaction = {
      uniqueId: parseXMLValue(block, 'unique_id'),
      transactionId: parseXMLValue(block, 'transaction_id'),
      transactionDate: parseXMLValue(block, 'timestamp'), // reconcile uses 'timestamp'
      type: parseXMLValue(block, 'transaction_type'), // e.g., sdd_sale, chargeback
      amount: parseInt(parseXMLValue(block, 'amount')) || 0,
      currency: parseXMLValue(block, 'currency'),
      status: parseXMLValue(block, 'status'), // approved, pending_async, chargebacked, etc.
      bankAccountNumber: parseXMLValue(block, 'bank_account_number'),
      mode: parseXMLValue(block, 'mode'), // live or test
      descriptor: parseXMLValue(block, 'descriptor'),
      sentToAcquirer: parseXMLValue(block, 'sent_to_acquirer') === 'true',
      cardScheme: parseXMLValue(block, 'card_scheme') || '',
      cardBrand: parseXMLValue(block, 'card_brand') || '',
      cardNumber: parseXMLValue(block, 'card_number') || parseXMLValue(block, 'bank_account_number') || '',
    }
    transactions.push(transaction)

    // Log first few transactions for debugging
    if (transactions.length <= 3) {
      console.log(`[Analytics] Transaction ${transactions.length} parsed:`, transaction)
    }
  }

  return transactions
}

// Core logic: fetch all transactions from reconcile API
export async function fetchReconcileTransactions(startDate: string, endDate: string): Promise<any[]> {
  const terminalToken = process.env.EMP_GENESIS_TERMINAL_TOKEN
  if (!terminalToken) {
    throw new Error('Terminal token not configured')
  }

  const endpoint = getReportingEndpoint()
  const reconcileUrl = `${endpoint}/reconcile/by_date/${terminalToken}`

  console.log('[Analytics] Fetching from reconcile endpoint:', reconcileUrl)
  console.log('[Analytics] Date range:', startDate, 'to', endDate)

  const allTransactions: any[] = []
  let page = 1
  let totalPages = 1

  // Fetch all pages
  while (page <= totalPages) {
    // Build XML request for reconcile API (max 500 per page)
    const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<reconcile>
  <start_date>${startDate}</start_date>
  <end_date>${endDate}</end_date>
  <per_page>500</per_page>
  <page>${page}</page>
</reconcile>`

    console.log(`[Analytics] Fetching page ${page}...`)

    const response = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': getAuthHeader(),
      },
      body: xmlRequest,
    })

    const xmlResponse = await response.text()

    if (page === 1) {
      console.log(`[Analytics] First response preview:`, xmlResponse.substring(0, 800))
    }

    if (!response.ok) {
      console.error(`[Analytics] Error response:`, xmlResponse)
      throw new Error(`Failed to fetch transactions from reconcile API: ${xmlResponse}`)
    }

    // Parse pagination info from payment_responses attributes
    const totalCount = parseResponsesAttr(xmlResponse, 'payment_responses', 'total_count') || 0
    const pagesCount = parseResponsesAttr(xmlResponse, 'payment_responses', 'pages_count') || 0
    const perPage = parseResponsesAttr(xmlResponse, 'payment_responses', 'per_page') || 100

    console.log(`[Analytics] Page ${page}/${pagesCount}, Total count: ${totalCount}, Per page: ${perPage}`)

    // Parse the XML response (payment_response blocks)
    const transactions = parsePaymentResponsesXML(xmlResponse)
    allTransactions.push(...transactions)

    console.log(`[Analytics] Parsed ${transactions.length} transactions from page ${page}`)

    // Continue fetching until all pages are retrieved
    if (page < pagesCount) {
      page++
      totalPages = pagesCount
    } else {
      break
    }
  }

  console.log(`[Analytics] Total fetched: ${allTransactions.length} transactions`)
  return allTransactions
}

export async function GET(request: NextRequest) {
  try {
    // Direct API access requires Super Owner - organization filtering only works on cache
    await requireWriteAccess()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date') || getDefaultStartDate()
    const endDate = searchParams.get('end_date') || getDefaultEndDate()

    const transactions = await fetchReconcileTransactions(startDate, endDate)

    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length,
      startDate,
      endDate,
    })

  } catch (error: any) {
    console.error('[Analytics] Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', message: error.message },
      { status: 500 }
    )
  }
}

// Get default start date (2 years ago for maximum data coverage)
function getDefaultStartDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 2)
  return date.toISOString().split('T')[0]
}

// Get default end date (today)
function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]
}

