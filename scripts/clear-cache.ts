#!/usr/bin/env node
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') })

import { getMongoClient } from '../lib/db'

async function clearCache() {
  console.log('🧹 Clearing cache collections from melinux_emp...\n')

  try {
    const client = await getMongoClient()
    const db = client.db('melinux_emp')

    // Clear emp_reconcile_transactions
    console.log('Clearing emp_reconcile_transactions...')
    const txCountBefore = await db.collection('emp_reconcile_transactions').countDocuments()
    console.log(`  Before: ${txCountBefore} documents`)

    const txResult = await db.collection('emp_reconcile_transactions').deleteMany({})
    console.log(`  Deleted: ${txResult.deletedCount} documents`)

    const txCountAfter = await db.collection('emp_reconcile_transactions').countDocuments()
    console.log(`  After: ${txCountAfter} documents\n`)

    // Clear emp_chargebacks
    console.log('Clearing emp_chargebacks...')
    const cbCountBefore = await db.collection('emp_chargebacks').countDocuments()
    console.log(`  Before: ${cbCountBefore} documents`)

    const cbResult = await db.collection('emp_chargebacks').deleteMany({})
    console.log(`  Deleted: ${cbResult.deletedCount} documents`)

    const cbCountAfter = await db.collection('emp_chargebacks').countDocuments()
    console.log(`  After: ${cbCountAfter} documents\n`)

    console.log('✅ Cache cleared successfully!')
    console.log('\n📝 Note: You can refresh this data anytime from the Analytics dashboard')
    console.log('   by clicking the "Refresh Data" button.')

  } catch (error) {
    console.error('❌ Failed to clear cache:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  clearCache()
    .then(() => {
      console.log('\n✅ Script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error)
      process.exit(1)
    })
}

export { clearCache }
