#!/usr/bin/env node
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') })

import { getMongoClient } from '../lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const COLLECTIONS_TO_MIGRATE = [
  'users',
  'agencies',
  'accounts',
  'sessions',
  'settings',
  'emp_reconcile_transactions',
  'emp_chargebacks',
]

const BATCH_SIZE = 10000 // For large collections

interface MigrationResult {
  collection: string
  sourceCount: number
  targetCountBefore: number
  targetCountAfter: number
  migratedCount: number
  duration: number
  success: boolean
  error?: string
}

interface MigrationReport {
  timestamp: string
  sourceDb: string
  targetDb: string
  results: MigrationResult[]
  totalMigrated: number
  totalDuration: number
  success: boolean
}

async function migrateCollection(
  sourceDb: any,
  targetDb: any,
  collectionName: string
): Promise<MigrationResult> {
  const startTime = Date.now()

  try {
    console.log(`\n🔄 Migrating collection: ${collectionName}`)

    const sourceCollection = sourceDb.collection(collectionName)
    const targetCollection = targetDb.collection(collectionName)

    // Get counts
    const sourceCount = await sourceCollection.countDocuments()
    const targetCountBefore = await targetCollection.countDocuments()

    console.log(`   Source documents: ${sourceCount}`)
    console.log(`   Target documents (before): ${targetCountBefore}`)

    if (sourceCount === 0) {
      console.log(`   ⚠️  Source collection is empty, skipping...`)
      return {
        collection: collectionName,
        sourceCount,
        targetCountBefore,
        targetCountAfter: targetCountBefore,
        migratedCount: 0,
        duration: Date.now() - startTime,
        success: true,
      }
    }

    // Use aggregation pipeline with $merge for efficient same-cluster migration
    console.log(`   📤 Starting migration using $merge aggregation...`)

    // Check if collection is large (>100K docs) - use batched approach
    if (sourceCount > 100000) {
      console.log(`   📊 Large collection detected, using batched migration...`)

      let migratedTotal = 0
      for (let skip = 0; skip < sourceCount; skip += BATCH_SIZE) {
        const batch = Math.min(BATCH_SIZE, sourceCount - skip)
        console.log(`   📦 Processing batch: ${skip + 1}-${skip + batch} of ${sourceCount}`)

        await sourceCollection
          .aggregate([
            { $skip: skip },
            { $limit: BATCH_SIZE },
            {
              $merge: {
                into: { db: targetDb.databaseName, coll: collectionName },
                whenMatched: 'keepExisting', // Don't overwrite existing documents
                whenNotMatched: 'insert', // Insert new documents
              },
            },
          ])
          .toArray()

        migratedTotal += batch
        const progress = ((migratedTotal / sourceCount) * 100).toFixed(1)
        console.log(`   ✅ Progress: ${progress}%`)
      }
    } else {
      // Small collection - migrate all at once
      await sourceCollection
        .aggregate([
          {
            $merge: {
              into: { db: targetDb.databaseName, coll: collectionName },
              whenMatched: 'keepExisting', // Don't overwrite existing documents
              whenNotMatched: 'insert', // Insert new documents
            },
          },
        ])
        .toArray()
    }

    // Get new count
    const targetCountAfter = await targetCollection.countDocuments()
    const migratedCount = targetCountAfter - targetCountBefore

    const duration = Date.now() - startTime
    console.log(`   ✅ Migration completed in ${(duration / 1000).toFixed(2)}s`)
    console.log(`   Target documents (after): ${targetCountAfter}`)
    console.log(`   New documents migrated: ${migratedCount}`)

    return {
      collection: collectionName,
      sourceCount,
      targetCountBefore,
      targetCountAfter,
      migratedCount,
      duration,
      success: true,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`   ❌ Migration failed: ${error.message}`)

    return {
      collection: collectionName,
      sourceCount: 0,
      targetCountBefore: 0,
      targetCountAfter: 0,
      migratedCount: 0,
      duration,
      success: false,
      error: error.message,
    }
  }
}

async function migrateCollections(dryRun: boolean = false) {
  const startTime = Date.now()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)

  console.log('🚀 Database Migration Script')
  console.log('============================\n')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be migrated\n')
  }

  try {
    // Connect to MongoDB
    const client = await getMongoClient()
    const sourceDb = client.db('emp_admin')
    const targetDb = client.db('melinux_emp')

    console.log('✅ Connected to MongoDB')
    console.log(`   Source: emp_admin`)
    console.log(`   Target: melinux_emp\n`)

    // Verify databases exist
    const adminDb = client.db('admin')
    const databases = await adminDb.admin().listDatabases()
    const dbNames = databases.databases.map((db) => db.name)

    if (!dbNames.includes('emp_admin')) {
      throw new Error('Source database "emp_admin" not found')
    }
    if (!dbNames.includes('melinux_emp')) {
      throw new Error('Target database "melinux_emp" not found')
    }

    console.log('✅ Both databases verified\n')

    // If dry run, just show counts and exit
    if (dryRun) {
      console.log('📊 Collection Summary:\n')
      for (const collectionName of COLLECTIONS_TO_MIGRATE) {
        const sourceCount = await sourceDb.collection(collectionName).countDocuments()
        const targetCount = await targetDb.collection(collectionName).countDocuments()
        console.log(`   ${collectionName}:`)
        console.log(`      Source: ${sourceCount} documents`)
        console.log(`      Target: ${targetCount} documents`)
        console.log(`      Would migrate: ~${Math.max(0, sourceCount - targetCount)} documents\n`)
      }
      console.log('✅ Dry run completed\n')
      return { success: true, dryRun: true }
    }

    // Perform actual migration
    const report: MigrationReport = {
      timestamp,
      sourceDb: 'emp_admin',
      targetDb: 'melinux_emp',
      results: [],
      totalMigrated: 0,
      totalDuration: 0,
      success: true,
    }

    console.log('🔄 Starting migration process...')

    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      const result = await migrateCollection(sourceDb, targetDb, collectionName)
      report.results.push(result)
      report.totalMigrated += result.migratedCount

      if (!result.success) {
        report.success = false
      }
    }

    report.totalDuration = Date.now() - startTime

    // Save migration report
    const logDir = join(process.cwd(), 'logs')
    await mkdir(logDir, { recursive: true })
    const reportFile = join(logDir, `migration_${timestamp}.json`)
    await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf-8')

    // Print summary
    console.log('\n\n📊 Migration Summary')
    console.log('===================\n')
    console.log(`Total collections: ${report.results.length}`)
    console.log(`Successful: ${report.results.filter((r) => r.success).length}`)
    console.log(`Failed: ${report.results.filter((r) => !r.success).length}`)
    console.log(`Total documents migrated: ${report.totalMigrated}`)
    console.log(`Total duration: ${(report.totalDuration / 1000).toFixed(2)}s`)
    console.log(`Report saved: ${reportFile}\n`)

    if (!report.success) {
      console.log('⚠️  Some collections failed to migrate:\n')
      report.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`   ❌ ${r.collection}: ${r.error}`)
        })
      console.log()
    }

    return report
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('-d')

  migrateCollections(dryRun)
    .then((result) => {
      if (result.success || result.dryRun) {
        console.log('✅ Migration script completed successfully')
        process.exit(0)
      } else {
        console.log('⚠️  Migration completed with errors')
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error)
      process.exit(1)
    })
}

export { migrateCollections }
