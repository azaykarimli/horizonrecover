# Documentation Index

Welcome to the MeLinux emerchantpay Integration Platform documentation. This folder contains comprehensive technical documentation for developers and collaborators.

## 📚 Core Documentation

### [emerchantpay API Integration](./EMERCHANTPAY-API.md)
Complete guide to emerchantpay Genesis API integration:
- **SDD Sale Transactions** - How to submit SEPA Direct Debit transactions
- **Dynamic Descriptors** - Customize merchant information on bank statements
- **Void Transactions** - Cancel pending/approved transactions
- **Reconciliation** - Fetch and verify transaction details
- **Error Handling** - Common errors and solutions
- **Best Practices** - Transaction IDs, security, logging

### [Database Schema](./DATABASE-SCHEMA.md)
MongoDB collections and data structures:
- **emp_uploads** - CSV uploads and processing status
- **emp_reconcile_transactions** - Transaction data from emerchantpay
- **emp_chargeback_cache** - Cached chargeback data
- **emp_settings** - Application settings and field mappings
- **Indexes** - Database indexes for performance
- **Data Flow** - How data moves through the system

### [Batch Synchronization](./BATCH-SYNCHRONIZATION.md)
Batch processing and reconciliation:
- **Batch Sync Process** - How synchronization works
- **Reconciliation** - Fetching transaction details
- **Chargeback Detection** - Identifying and caching chargebacks
- **Analytics Generation** - Batch statistics and reports
- **Manual Operations** - Reset, void, and delete operations
- **Scheduling** - Cron jobs and automation

## 🔍 Debugging & Troubleshooting

### [Analytics Debug](./ANALYTICS-DEBUG.md)
Analytics implementation and debugging guide

### [Batch Chargebacks Final](./BATCH-CHARGEBACKS-FINAL.md)
Chargeback management implementation details

### [Batch Chargebacks Debugging](./BATCH-CHARGEBACKS-DEBUGGING.md)
Debugging guide for chargeback-related issues

### [Batch Chargebacks Linkage](./BATCH-CHARGEBACKS-LINKAGE.md)
How chargebacks are linked to original transactions

### [Batch Chargebacks Fix](./BATCH-CHARGEBACKS-FIX.md)
Fixes applied to chargeback detection

### [Reconciliation](./RECONCILIATION.md)
Detailed reconciliation process documentation

### [Resync Chargebacks Now](./RESYNC-CHARGEBACKS-NOW.md)
Manual chargeback resynchronization process

### [Stability Improvements](./STABILITY-IMPROVEMENTS.md)
System stability enhancements and fixes

## 📝 Feature Documentation

### [Batch Sync](./BATCH-SYNC.md)
Detailed batch synchronization workflows

### [Batch Chargebacks](./BATCH-CHARGEBACKS.md)
Chargeback processing for batches

### [Edit and Retry](./EDIT-AND-RETRY.md)
Row editing and retry functionality

### [Analytics Dashboard](./ANALYTICS-DASHBOARD.md)
Analytics dashboard features and usage

## 🚀 Quick Links

### For New Developers
Start here to understand the system:
1. [README.md](../README.md) - Project overview and setup
2. [emerchantpay API Integration](./EMERCHANTPAY-API.md) - Core API concepts
3. [Database Schema](./DATABASE-SCHEMA.md) - Data structures
4. [Batch Synchronization](./BATCH-SYNCHRONIZATION.md) - Processing workflows

### For Debugging
When something goes wrong:
1. [Analytics Debug](./ANALYTICS-DEBUG.md) - Analytics issues
2. [Batch Chargebacks Debugging](./BATCH-CHARGEBACKS-DEBUGGING.md) - Chargeback issues
3. [Stability Improvements](./STABILITY-IMPROVEMENTS.md) - Known issues and fixes

### For Feature Development
Adding new features:
1. [Database Schema](./DATABASE-SCHEMA.md) - Understand data structures
2. [emerchantpay API Integration](./EMERCHANTPAY-API.md) - API capabilities
3. [Batch Synchronization](./BATCH-SYNCHRONIZATION.md) - Integration points

## 📖 Documentation Standards

### Creating New Documentation

When adding new documentation:

1. **Use Clear Titles** - Descriptive, action-oriented titles
2. **Include Table of Contents** - For documents > 100 lines
3. **Add Code Examples** - Show real implementation code
4. **Link Related Docs** - Cross-reference other documentation
5. **Update This Index** - Add your new doc to the appropriate section

### Documentation Format

```markdown
# Document Title

Brief description of what this document covers.

## Table of Contents
- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1

Content here...

### Code Example

\`\`\`typescript
// Code example
const example = 'value'
\`\`\`

---

**Last Updated**: YYYY-MM-DD
**Version**: X.Y
```

## 🛠️ Tools & Utilities

### CSV Diff Tool
Located in `/.tools/csv_diff.py`

Compare two CSV files and find differences:

```bash
python .tools/csv_diff.py file1.csv file2.csv output.csv --mode file2-only --key iban
```

See `/.tools/README.md` for full documentation.

## 📞 Support

### Internal Support
- Check documentation first
- Review MongoDB logs in `emp_uploads` collection
- Check terminal output for API errors

### External Support
- **emerchantpay**: tech-support@emerchantpay.com
- **MongoDB**: https://www.mongodb.com/docs/

## 📝 Changelog

### Version 2.1 (November 2025)
- **Vercel Cron Jobs** - Automatic analytics refresh every 2 hours
- Improved refresh button with lock mechanism

### Version 2.0 (November 2025)
- Added comprehensive documentation
- Multi-company support (BestWin, Grand Luck, MeLinux)
- Enhanced chargeback management
- Batch analytics and reporting
- Manual void functionality
- CSV diff utility

### Version 1.0 (Initial Release)
- Basic CSV upload and processing
- emerchantpay SDD Sale integration
- MongoDB storage
- Simple analytics

---

**Documentation Version**: 2.0  
**Last Updated**: November 2025  
**Maintained by**: MeLinux Development Team

For questions or suggestions about this documentation, please contact the development team.

