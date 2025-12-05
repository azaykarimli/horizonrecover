#!/usr/bin/env node
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') })

import { getMongoClient } from '../lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const COLLECTIONS_TO_BACKUP = [
  'users',
  'agencies',
  'accounts',
  'sessions',
  'settings',
  'emp_reconcile_transactions',
  'emp_chargebacks',
]

interface BackupMetadata {
  timestamp: string
  sourceDb: string
  collections: {
    name: string
    count: number
    backupFile: string
  }[]
  totalDocuments: number
}

async function backupCollections() {
  console.log('🔄 Starting backup process...\n')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)
  const backupDir = join(process.cwd(), 'backups', `emp_admin_${timestamp}`)

  try {
    // Create backup directory
    await mkdir(backupDir, { recursive: true })
    console.log(`📁 Created backup directory: ${backupDir}\n`)

    // Connect to MongoDB
    const client = await getMongoClient()
    const sourceDb = client.db('emp_admin')

    const metadata: BackupMetadata = {
      timestamp,
      sourceDb: 'emp_admin',
      collections: [],
      totalDocuments: 0,
    }

    // Backup each collection
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      console.log(`📦 Backing up collection: ${collectionName}`)

      const collection = sourceDb.collection(collectionName)
      const count = await collection.countDocuments()

      if (count === 0) {
        console.log(`   ⚠️  Collection is empty, skipping...\n`)
        continue
      }

      // Export to JSON
      const documents = await collection.find({}).toArray()
      const backupFile = `${collectionName}.json`
      const filePath = join(backupDir, backupFile)

      await writeFile(filePath, JSON.stringify(documents, null, 2), 'utf-8')

      console.log(`   ✅ Backed up ${count} documents to ${backupFile}\n`)

      metadata.collections.push({
        name: collectionName,
        count,
        backupFile,
      })
      metadata.totalDocuments += count
    }

    // Save metadata
    const metadataFile = join(backupDir, 'metadata.json')
    await writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8')

    console.log('✅ Backup completed successfully!\n')
    console.log('📊 Backup Summary:')
    console.log(`   Directory: ${backupDir}`)
    console.log(`   Collections: ${metadata.collections.length}`)
    console.log(`   Total Documents: ${metadata.totalDocuments}`)
    console.log(`   Timestamp: ${timestamp}\n`)

    return { success: true, backupDir, metadata }
  } catch (error) {
    console.error('❌ Backup failed:', error)
    throw error
  } finally {
    // Note: Don't close the client as it's a singleton
  }
}

// Run if called directly
if (require.main === module) {
  backupCollections()
    .then(() => {
      console.log('✅ Backup script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Backup script failed:', error)
      process.exit(1)
    })
}

export { backupCollections }
