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

function parseResponsesAttr(xml: string, root: 'chargeback_responses' | 'payment_responses', attr: string): number {
  const re = new RegExp(`<${root}[^>]*${attr}="(\\d+)"`, 'i')
  const m = xml.match(re)
  return m ? parseInt(m[1], 10) : 0
}

// Chargeback reason code mapping to human-readable explanations
export const CHARGEBACK_REASON_CODES: Record<string, string> = {
  // Visa reason codes
  '10.1': 'EMV Liability Shift Counterfeit Fraud',
  '10.2': 'EMV Liability Shift Non-Counterfeit Fraud',
  '10.3': 'Other Fraud - Card Present Environment',
  '10.4': 'Other Fraud - Card Absent Environment',
  '10.5': 'Visa Fraud Monitoring Program',
  '11.1': 'Card Recovery Bulletin',
  '11.2': 'Declined Authorization',
  '11.3': 'No Authorization',
  '12.1': 'Late Presentment',
  '12.2': 'Incorrect Transaction Code',
  '12.3': 'Incorrect Currency',
  '12.4': 'Incorrect Account Number',
  '12.5': 'Incorrect Amount',
  '12.6': 'Duplicate Processing',
  '12.7': 'Invalid Data',
  '13.1': 'Merchandise/Services Not Received',
  '13.2': 'Cancelled Recurring Transaction',
  '13.3': 'Not as Described or Defective Merchandise/Services',
  '13.4': 'Counterfeit Merchandise',
  '13.5': 'Misrepresentation',
  '13.6': 'Credit Not Processed',
  '13.7': 'Cancelled Merchandise/Services',
  '13.8': 'Original Credit Transaction Not Accepted',
  '13.9': 'Non-Receipt of Cash or Load Transaction Value',

  // Mastercard reason codes
  '4807': 'Warning Bulletin File',
  '4808': 'Authorization-Related Chargeback',
  '4812': 'Account Number Not on File',
  '4831': 'Transaction Amount Differs',
  '4834': 'Duplicate Processing',
  '4837': 'No Cardholder Authorization',
  '4840': 'Fraudulent Processing of Transactions',
  '4841': 'Cancelled Recurring or Digital Goods Transactions',
  '4842': 'Late Presentment',
  '4846': 'Correct Transaction Currency Code Not Provided',
  '4849': 'Questionable Merchant Activity',
  '4850': 'Credit Posted as a Purchase',
  '4853': 'Cardholder Dispute',
  '4854': 'Cardholder Dispute—Not Elsewhere Classified (U.S. Only)',
  '4855': 'Non-Receipt of Merchandise',
  '4857': 'Card-Activated Telephone Transaction',
  '4859': 'Services Not Rendered',
  '4860': 'Credit Not Processed',
  '4862': 'Counterfeit Transaction',
  '4863': 'Cardholder Does Not Recognize—Potential Fraud',
  '4870': 'Chip Liability Shift',
  '4871': 'Chip/PIN Liability Shift',

  // American Express reason codes
  'F10': 'Missing Imprint',
  'F14': 'Missing Signature',
  'F22': 'Expired Card',
  'F24': 'No Cardmember Authorization',
  'F29': 'Card Not Present',
  'F30': 'EMV Counterfeit',
  'F31': 'EMV Lost/Stolen/Non-Received',
  'C02': 'Credit Not Processed',
  'C04': 'Goods/Services Returned or Refused',
  'C05': 'Goods/Services Cancelled',
  'C08': 'Goods/Services Not Received or Only Partially Received',
  'C14': 'Paid by Other Means',
  'C18': '"No Show" or CARDeposit Cancelled',
  'C28': 'Cancelled Recurring Billing',
  'C31': 'Goods/Services Not as Described',
  'C32': 'Goods/Services Damaged or Defective',
  'P01': 'Unassigned Card Number',
  'P03': 'Credit Posted as Card Sale',
  'P04': 'Charge Processed as Credit',
  'P05': 'Incorrect Charge Amount',
  'P07': 'Late Submission',
  'P08': 'Duplicate Charge',
  'P22': 'Non-Matching Card Number',
  'P23': 'Currency Discrepancy',

  // Generic/Common
  'fraud': 'Fraudulent Transaction',
  'duplicate': 'Duplicate Processing',
  'not_received': 'Goods or Services Not Received',
  'not_as_described': 'Product Not as Described',
  'credit_not_processed': 'Credit Not Processed',
  'cancelled': 'Transaction Cancelled by Cardholder',
  'unauthorized': 'Unauthorized Transaction',
  'processing_error': 'Processing Error',

  // SEPA Direct Debit specific R-transaction reasons
  // Account/customer/accounting related
  'AC01': 'Account identifier incorrect or invalid (e.g. IBAN/BIC invalid)',
  'AC04': 'Account closed',
  'AC06': 'Account blocked',

  // Mandate-related
  'MD01': 'Missing or invalid mandate',
  'MD06': 'Refund requested by debtor (authorized SDD, up to 8 weeks)',

  // Miscellaneous/not specified
  'MS02': 'Reason not specified – customer generated',
  'MS03': 'Reason not specified – agent/bank generated',

  // Regulatory
  'RR04': 'Regulatory reasons (e.g. compliance/legal constraints)'
}

// Helper to get reason description
export function getReasonDescription(reasonCode: string): string {
  const code = reasonCode?.trim().toUpperCase()
  return CHARGEBACK_REASON_CODES[code] || CHARGEBACK_REASON_CODES[reasonCode] || 'Unknown reason'
}

// Helper to parse chargebacks from XML
function parseChargebacksXML(xml: string, importDateForItems?: string): any[] {
  const chargebacks: any[] = []

  // Prefer explicit chargeback_response blocks
  let blocks = xml.match(/<chargeback_response>[\s\S]*?<\/chargeback_response>/g) || []

  // Fallback to chargeback_event blocks (alternative schema)
  if (blocks.length === 0) {
    blocks = xml.match(/<chargeback_event>[\s\S]*?<\/chargeback_event>/g) || []
  }

  // As a last resort, some reconcile-like feeds might include payment_response with transaction_type=chargeback
  if (blocks.length === 0) {
    const paymentBlocks = xml.match(/<payment_response>[\s\S]*?<\/payment_response>/g) || []
    for (const block of paymentBlocks) {
      const txType = parseXMLValue(block, 'transaction_type')
      if (String(txType).toLowerCase() === 'chargeback') {
        const reasonCode = parseXMLValue(block, 'reason_code')
        chargebacks.push({
          arn: parseXMLValue(block, 'arn'),
          uniqueId: parseXMLValue(block, 'unique_id') || parseXMLValue(block, 'original_transaction_unique_id'),
          type: 'chargeback',
          postDate: parseXMLValue(block, 'post_date') || parseXMLValue(block, 'timestamp') || importDateForItems || '',
          reasonCode,
          reasonDescription: getReasonDescription(reasonCode),
          amount: parseFloat(parseXMLValue(block, 'chargeback_amount') || parseXMLValue(block, 'amount')) || 0,
          currency: parseXMLValue(block, 'chargeback_currency') || parseXMLValue(block, 'currency'),
          cardNumber: parseXMLValue(block, 'card_number') || '',
        })
      }
    }
    return chargebacks
  }

  for (const block of blocks) {
    const reasonCode = parseXMLValue(block, 'reason_code')
    chargebacks.push({
      arn: parseXMLValue(block, 'arn'),
      uniqueId: parseXMLValue(block, 'unique_id'),
      originalTransactionUniqueId: parseXMLValue(block, 'original_transaction_unique_id'),
      type: parseXMLValue(block, 'type') || 'chargeback',
      postDate: parseXMLValue(block, 'post_date') || parseXMLValue(block, 'import_date') || importDateForItems || '',
      reasonCode,
      reasonDescription: getReasonDescription(reasonCode) || parseXMLValue(block, 'reason_description'),
      amount: parseFloat(parseXMLValue(block, 'chargeback_amount') || parseXMLValue(block, 'amount')) || 0,
      currency: parseXMLValue(block, 'chargeback_currency') || parseXMLValue(block, 'currency'),
      cardNumber: parseXMLValue(block, 'card_number') || '',
      originalTransactionType: parseXMLValue(block, 'original_transaction_type') || '',
      originalAmount: parseFloat(parseXMLValue(block, 'original_amount')) || 0,
      originalCurrency: parseXMLValue(block, 'original_currency') || '',
      originalPostDate: parseXMLValue(block, 'original_post_date') || '',
      originalSlip: parseXMLValue(block, 'original_slip') || '',
      itemSlipNumber: parseXMLValue(block, 'item_slip_number') || '',
    })
  }

  return chargebacks
}

// Core logic: fetch all chargebacks from chargebacks API for date range
export async function fetchChargebacksByDateRange(startDate: string, endDate: string): Promise<any[]> {
  const endpoint = getReportingEndpoint()
  const chargebacksUrl = `${endpoint}/chargebacks/by_date/`

  console.log('[Analytics] Fetching chargebacks from:', chargebacksUrl)

  // Build list of dates to query (chargebacks endpoint accepts a single import_date per request)
  const dateList: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dateList.push(d.toISOString().split('T')[0])
  }
  console.log('[Analytics] Import date range:', startDate, 'to', endDate, `(${dateList.length} days)`)

  const allChargebacks: any[] = []

  // Iterate over each date and fetch all pages
  for (const importDate of dateList) {
    let page = 1
    let totalPages = 1
    console.log(`[Analytics] Fetching chargebacks for ${importDate}`)

    while (page <= totalPages) {
      // Build XML request for chargebacks (max 1000 per page)
      const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<chargeback_request>
  <import_date>${importDate}</import_date>
  <per_page>1000</per_page>
  <page>${page}</page>
</chargeback_request>`

      console.log(`[Analytics] Fetching chargebacks page ${page} for ${importDate}...`)

      const response = await fetch(chargebacksUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': getAuthHeader(),
        },
        body: xmlRequest,
      })

      const xmlResponse = await response.text()

      if (page === 1) {
        console.log('[Analytics] Chargebacks Response preview:', xmlResponse.substring(0, 800))
      }

      if (!response.ok) {
        console.error('[Analytics] Chargebacks error response:', xmlResponse)
        // If it's a 470 (not found), skip this date
        if (response.status === 470) {
          break
        }
        throw new Error(`Failed to fetch chargebacks for ${importDate}: ${xmlResponse}`)
      }

      // Parse pagination info from chargeback_responses attributes
      const totalCount = parseResponsesAttr(xmlResponse, 'chargeback_responses', 'total_count') || 0
      const pagesCount = parseResponsesAttr(xmlResponse, 'chargeback_responses', 'pages_count') || 0
      const perPage = parseResponsesAttr(xmlResponse, 'chargeback_responses', 'per_page') || 1000

      console.log(`[Analytics] Chargebacks ${importDate} - page ${page}/${pagesCount}, Total count: ${totalCount}, Per page: ${perPage}`)

      // Parse the XML response
      const chargebacks = parseChargebacksXML(xmlResponse, importDate)
      allChargebacks.push(...chargebacks)

      console.log(`[Analytics] Parsed ${chargebacks.length} chargebacks from page ${page} (${importDate})`)

      // Continue fetching until all pages are retrieved
      if (page < pagesCount) {
        page++
        totalPages = pagesCount
      } else {
        break
      }
    }
  }

  console.log(`[Analytics] Total fetched: ${allChargebacks.length} chargebacks`)
  return allChargebacks
}

export async function GET(request: NextRequest) {
  try {
    // Direct API access requires Super Owner - organization filtering only works on cache
    await requireWriteAccess()

    const searchParams = request.nextUrl.searchParams
    const startDateParam = searchParams.get('start_date') || getDefaultStartDate()
    const endDateParam = searchParams.get('end_date') || getDefaultEndDate()

    const chargebacks = await fetchChargebacksByDateRange(startDateParam, endDateParam)

    return NextResponse.json({
      success: true,
      chargebacks,
      count: chargebacks.length,
      startDate: startDateParam,
      endDate: endDateParam,
    })

  } catch (error: any) {
    console.error('[Analytics] Error fetching chargebacks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chargebacks', message: error.message },
      { status: 500 }
    )
  }
}

// Get default start date (90 days ago for chargebacks)
function getDefaultStartDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().split('T')[0]
}

// Get default end date (today)
function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]
}

