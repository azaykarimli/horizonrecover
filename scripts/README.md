# Database Migration Scripts

Scripts for migrating collections from `emp_admin` database to `melinux_emp` database.

## Overview

These scripts migrate 7 collections from the staging database (emp_admin) to the production database (melinux_emp):
- users (4 documents)
- agencies (2 documents)
- accounts (2 documents)
- sessions (4 documents)
- settings (1 document)
- emp_reconcile_transactions (5,260 documents)
- emp_chargebacks (3 documents)

**Note**: The `uploads` collection is skipped as it already exists in melinux_emp.

## Prerequisites

- Node.js installed
- MongoDB connection configured in `.env` file
- Both `emp_admin` and `melinux_emp` databases must exist

## Available Scripts

### 1. Dry Run (Recommended First Step)

Test the migration without actually copying data:

```bash
npm run migrate:dry-run
```

This will:
- Verify database connections
- Show document counts for each collection
- Estimate how many documents will be migrated
- No actual data copying

### 2. Backup

Create a JSON backup of all collections before migration:

```bash
npm run backup
```

This will:
- Create a timestamped backup directory in `backups/`
- Export each collection to JSON format
- Save metadata about the backup
- Example output: `backups/emp_admin_2025-12-05_14-30-00/`

### 3. Migrate

Perform the actual migration:

```bash
npm run migrate
```

This will:
- Connect to both databases
- Use MongoDB aggregation pipeline with `$merge` for efficient copying
- Copy documents from emp_admin to melinux_emp
- Preserve existing documents in target (no overwriting)
- Show progress for each collection
- Save migration report to `logs/`

### 4. Verify

Verify the migration was successful:

```bash
npm run verify
```

This will:
- Compare document counts between source and target
- Validate random sample of documents
- Check relationships (user→agency, account→agency)
- Report any discrepancies

## Recommended Workflow

Follow these steps in order:

```bash
# 1. Test with dry run
npm run migrate:dry-run

# 2. Create backup
npm run backup

# 3. Run migration
npm run migrate

# 4. Verify results
npm run verify
```

## Migration Details

### Strategy

- **Method**: MongoDB aggregation pipeline with `$merge` operator
- **Approach**: Copy-only (non-destructive)
- **Existing Data**: Preserved (uses `whenMatched: 'keepExisting'`)
- **Large Collections**: Automatically batched (10K docs per batch)

### Safety Features

1. **Non-destructive**: Source database unchanged
2. **No overwriting**: Existing target documents preserved
3. **Idempotent**: Safe to re-run if migration fails mid-way
4. **Error handling**: Failed collections logged but don't stop others
5. **Progress tracking**: Real-time progress for each collection

### Time Estimates

Based on current data (5,276 total documents):
- Backup: ~5-10 seconds
- Migration: ~10-30 seconds
- Verification: ~5-10 seconds
- **Total: ~30-60 seconds**

## Output Locations

- **Backups**: `backups/emp_admin_[timestamp]/`
- **Migration logs**: `logs/migration_[timestamp].json`
- **Console output**: Real-time progress and results

## Troubleshooting

### Connection Errors

If you get "MONGODB_URI is not set":
- Check that `.env` file exists
- Verify `MONGODB_URI` is set in `.env`
- Ensure `.env` is in the project root directory

### Database Not Found

If "database not found":
- Verify database names in MongoDB Atlas
- Check that both `emp_admin` and `melinux_emp` exist
- Confirm your MongoDB user has access to both databases

### Large Collection Timeout

For very large collections (>100K documents):
- The script automatically uses batched migration
- Batch size: 10,000 documents per batch
- Shows progress percentage for each batch

### Rollback

If migration fails or data is corrupted:

**Option 1**: Continue using emp_admin (no action needed)
- App still points to emp_admin via `MONGODB_DB` env var

**Option 2**: Restore from backup
```bash
# Backups are in JSON format in backups/emp_admin_[timestamp]/
# Manually import using MongoDB tools if needed
```

**Option 3**: Clean and retry
```bash
# Drop collections from melinux_emp in MongoDB Atlas
# Re-run: npm run migrate
```

## Post-Migration

After successful migration:

1. ✅ Verify all document counts match
2. ✅ Test application functionality:
   - Login with existing users
   - View settings
   - Check analytics dashboard
3. ✅ Keep backup until confident migration successful
4. 📝 Update `MONGODB_DB` in `.env` when ready to switch (optional)

## Important Notes

- **No index creation**: Indexes are not created by these scripts
- **Environment unchanged**: `MONGODB_DB` still points to `emp_admin`
- **Both databases coexist**: Can switch between them via env var
- **Sessions preserved**: 24h TTL sessions are migrated
- **Uploads skipped**: Already exists in melinux_emp

## File Locations

- [scripts/backup-collections.ts](backup-collections.ts) - Backup script
- [scripts/migrate-collections.ts](migrate-collections.ts) - Migration script
- [scripts/verify-migration.ts](verify-migration.ts) - Verification script
- [lib/db.ts](../lib/db.ts) - MongoDB connection configuration
