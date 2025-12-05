#!/usr/bin/env node
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') })

import { getMongoClient } from '../lib/db'
import { ObjectId } from 'mongodb'

const COLLECTIONS_TO_VERIFY = [
  'users',
  'agencies',
  'accounts',
  'sessions',
  'settings',
  'emp_reconcile_transactions',
  'emp_chargebacks',
]

interface CollectionVerification {
  collection: string
  sourceCount: number
  targetCount: number
  countMatch: boolean
  sampleValidation: {
    checked: number
    matched: number
    mismatched: number
  }
  success: boolean
  warnings: string[]
  errors: string[]
}

interface VerificationReport {
  timestamp: string
  sourceDb: string
  targetDb: string
  collections: CollectionVerification[]
  allMatch: boolean
  totalWarnings: number
  totalErrors: number
}

async function verifySampleDocuments(
  sourceDb: any,
  targetDb: any,
  collectionName: string,
  sampleSize: number = 10
): Promise<{ matched: number; mismatched: number; errors: string[] }> {
  const sourceCollection = sourceDb.collection(collectionName)
  const targetCollection = targetDb.collection(collectionName)

  const errors: string[] = []
  let matched = 0
  let mismatched = 0

  try {
    // Get random sample from source
    const sourceDocs = await sourceCollection
      .aggregate([{ $sample: { size: sampleSize } }])
      .toArray()

    if (sourceDocs.length === 0) {
      return { matched: 0, mismatched: 0, errors: [] }
    }

    // Check each document exists in target
    for (const doc of sourceDocs) {
      const targetDoc = await targetCollection.findOne({ _id: doc._id })

      if (!targetDoc) {
        mismatched++
        errors.push(`Document ${doc._id} not found in target`)
      } else {
        // Simple comparison - check if critical fields match
        const sourceKeys = Object.keys(doc).sort()
        const targetKeys = Object.keys(targetDoc).sort()

        if (JSON.stringify(sourceKeys) !== JSON.stringify(targetKeys)) {
          mismatched++
          errors.push(`Document ${doc._id} has different field structure`)
        } else {
          matched++
        }
      }
    }
  } catch (error: any) {
    errors.push(`Sample validation error: ${error.message}`)
  }

  return { matched, mismatched, errors }
}

async function verifyRelationships(sourceDb: any, targetDb: any): Promise<string[]> {
  const warnings: string[] = []

  try {
    // Check user->agency relationships
    const usersCollection = targetDb.collection('users')
    const agenciesCollection = targetDb.collection('agencies')

    const usersWithAgency = await usersCollection.find({ agencyId: { $exists: true, $ne: null } }).toArray()
    for (const user of usersWithAgency) {
      if (user.agencyId) {
        const agency = await agenciesCollection.findOne({ _id: new ObjectId(user.agencyId) })
        if (!agency) {
          warnings.push(`User ${user._id} references non-existent agency ${user.agencyId}`)
        }
      }
    }

    // Check account->agency relationships
    const accountsCollection = targetDb.collection('accounts')
    const accountsWithAgency = await accountsCollection.find({ agencyId: { $exists: true, $ne: null } }).toArray()
    for (const account of accountsWithAgency) {
      if (account.agencyId) {
        const agency = await agenciesCollection.findOne({ _id: new ObjectId(account.agencyId) })
        if (!agency) {
          warnings.push(`Account ${account._id} references non-existent agency ${account.agencyId}`)
        }
      }
    }

    // Check user->account relationships
    const usersWithAccount = await usersCollection.find({ accountId: { $exists: true, $ne: null } }).toArray()
    for (const user of usersWithAccount) {
      if (user.accountId) {
        const account = await accountsCollection.findOne({ _id: new ObjectId(user.accountId) })
        if (!account) {
          warnings.push(`User ${user._id} references non-existent account ${user.accountId}`)
        }
      }
    }
  } catch (error: any) {
    warnings.push(`Relationship validation error: ${error.message}`)
  }

  return warnings
}

async function verifyCollection(
  sourceDb: any,
  targetDb: any,
  collectionName: string
): Promise<CollectionVerification> {
  console.log(`\n🔍 Verifying collection: ${collectionName}`)

  const warnings: string[] = []
  const errors: string[] = []

  try {
    const sourceCollection = sourceDb.collection(collectionName)
    const targetCollection = targetDb.collection(collectionName)

    // Get document counts
    const sourceCount = await sourceCollection.countDocuments()
    const targetCount = await targetCollection.countDocuments()

    console.log(`   Source: ${sourceCount} documents`)
    console.log(`   Target: ${targetCount} documents`)

    const countMatch = sourceCount === targetCount

    if (!countMatch) {
      const diff = Math.abs(sourceCount - targetCount)
      if (targetCount < sourceCount) {
        errors.push(`Target has ${diff} fewer documents than source`)
      } else {
        warnings.push(`Target has ${diff} more documents than source (may include pre-existing data)`)
      }
    }

    // Sample validation
    console.log(`   📊 Validating sample documents...`)
    const sampleSize = Math.min(10, sourceCount)
    const sampleResult = await verifySampleDocuments(sourceDb, targetDb, collectionName, sampleSize)

    console.log(`   ✅ Matched: ${sampleResult.matched}/${sampleSize}`)
    if (sampleResult.mismatched > 0) {
      console.log(`   ⚠️  Mismatched: ${sampleResult.mismatched}/${sampleSize}`)
      errors.push(...sampleResult.errors)
    }

    const success = countMatch && sampleResult.mismatched === 0 && errors.length === 0

    if (success) {
      console.log(`   ✅ Verification passed`)
    } else {
      console.log(`   ⚠️  Verification completed with issues`)
    }

    return {
      collection: collectionName,
      sourceCount,
      targetCount,
      countMatch,
      sampleValidation: {
        checked: sampleSize,
        matched: sampleResult.matched,
        mismatched: sampleResult.mismatched,
      },
      success,
      warnings,
      errors,
    }
  } catch (error: any) {
    console.error(`   ❌ Verification failed: ${error.message}`)

    return {
      collection: collectionName,
      sourceCount: 0,
      targetCount: 0,
      countMatch: false,
      sampleValidation: {
        checked: 0,
        matched: 0,
        mismatched: 0,
      },
      success: false,
      warnings,
      errors: [error.message],
    }
  }
}

async function verifyMigration() {
  console.log('🔍 Migration Verification Script')
  console.log('=================================\n')

  const timestamp = new Date().toISOString()

  try {
    // Connect to MongoDB
    const client = await getMongoClient()
    const sourceDb = client.db('emp_admin')
    const targetDb = client.db('melinux_emp')

    console.log('✅ Connected to MongoDB')
    console.log(`   Source: emp_admin`)
    console.log(`   Target: melinux_emp\n`)

    const report: VerificationReport = {
      timestamp,
      sourceDb: 'emp_admin',
      targetDb: 'melinux_emp',
      collections: [],
      allMatch: true,
      totalWarnings: 0,
      totalErrors: 0,
    }

    console.log('🔄 Verifying collections...')

    // Verify each collection
    for (const collectionName of COLLECTIONS_TO_VERIFY) {
      const result = await verifyCollection(sourceDb, targetDb, collectionName)
      report.collections.push(result)

      if (!result.success) {
        report.allMatch = false
      }

      report.totalWarnings += result.warnings.length
      report.totalErrors += result.errors.length
    }

    // Verify relationships
    console.log(`\n🔗 Verifying relationships...`)
    const relationshipWarnings = await verifyRelationships(sourceDb, targetDb)
    report.totalWarnings += relationshipWarnings.length

    if (relationshipWarnings.length > 0) {
      console.log(`   ⚠️  Found ${relationshipWarnings.length} relationship issues`)
      relationshipWarnings.forEach((warning) => console.log(`      - ${warning}`))
    } else {
      console.log(`   ✅ All relationships valid`)
    }

    // Print summary
    console.log('\n\n📊 Verification Summary')
    console.log('=======================\n')
    console.log(`Collections verified: ${report.collections.length}`)
    console.log(`All counts match: ${report.allMatch ? '✅ Yes' : '⚠️  No'}`)
    console.log(`Total warnings: ${report.totalWarnings}`)
    console.log(`Total errors: ${report.totalErrors}\n`)

    if (!report.allMatch || report.totalErrors > 0) {
      console.log('⚠️  Issues found:\n')
      report.collections.forEach((col) => {
        if (!col.success || col.errors.length > 0) {
          console.log(`   ${col.collection}:`)
          col.errors.forEach((err) => console.log(`      ❌ ${err}`))
          col.warnings.forEach((warn) => console.log(`      ⚠️  ${warn}`))
        }
      })
      console.log()
    }

    if (relationshipWarnings.length > 0) {
      console.log('⚠️  Relationship issues:\n')
      relationshipWarnings.forEach((warning) => console.log(`   ⚠️  ${warning}`))
      console.log()
    }

    // Print per-collection summary
    console.log('📋 Collection Details:\n')
    report.collections.forEach((col) => {
      const status = col.success ? '✅' : '⚠️ '
      console.log(`   ${status} ${col.collection}: ${col.targetCount} documents`)
    })
    console.log()

    if (report.allMatch && report.totalErrors === 0) {
      console.log('✅ All verifications passed! Migration successful.\n')
    } else if (report.totalErrors > 0) {
      console.log('❌ Verification failed. Please review errors above.\n')
    } else {
      console.log('⚠️  Verification completed with warnings. Please review above.\n')
    }

    return report
  } catch (error) {
    console.error('❌ Verification failed:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  verifyMigration()
    .then((result) => {
      if (result.allMatch && result.totalErrors === 0) {
        console.log('✅ Verification script completed successfully')
        process.exit(0)
      } else if (result.totalErrors > 0) {
        console.log('❌ Verification failed')
        process.exit(1)
      } else {
        console.log('⚠️  Verification completed with warnings')
        process.exit(0)
      }
    })
    .catch((error) => {
      console.error('❌ Verification script failed:', error)
      process.exit(1)
    })
}

export { verifyMigration }
