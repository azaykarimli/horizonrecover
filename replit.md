# MeLinux EmerchantPay Integration Platform - Replit Setup

## Project Overview
A Next.js application for managing SEPA Direct Debit (SDD) transactions through the emerchantpay Genesis API, with multi-company support, chargeback management, and batch processing capabilities.

## Recent Changes
- **2025-11-27**: Organization-scoped analytics filtering with strict tenant isolation
  - Analytics data now filtered by organization ownership with strict security
  - Created `lib/analytics-helpers.ts` with helper functions:
    - `getOrganizationTransactionIds()`: Extract transaction IDs from user's uploads
    - `buildTransactionFilter()`: Build MongoDB filter for transactions
    - `buildChargebackFilter()`: Build MongoDB filter for chargebacks (now looks up gateway uniqueIds via reconcile)
    - `buildUploadsOrgFilter()`: STRICT filtering - only shows uploads explicitly assigned to org
  - Updated analytics cache endpoints to filter by organization:
    - `/api/emp/analytics/cache/transactions`: Filters by transaction IDs from user's uploads
    - `/api/emp/analytics/cache/chargebacks`: Filters by unique IDs from user's uploads (via reconcile lookup)
  - Updated batch analytics endpoints with strict organization filtering:
    - `/api/emp/analytics/batch-chargebacks`: Looks up transactionIds in reconcile to get gateway uniqueIds, then filters chargebacks
    - `/api/emp/analytics/chargeback-extraction`: Same logic - transactionIds → reconcile → uniqueIds → chargebacks
  - Chargeback filtering logic:
    - Chargebacks reference `originalTransactionUniqueId` (gateway's uniqueId)
    - Uploads store `baseTransactionId`/`lastTransactionId` (our generated IDs)
    - Solution: Look up our transactionIds in `emp_reconcile_transactions` to get gateway uniqueIds
    - Both field naming conventions supported: `transactionId`/`transaction_id`, `uniqueId`/`unique_id`
  - Security fixes implemented:
    - Agency admins ONLY see uploads explicitly assigned to their agency (no unassigned)
    - Chargeback queries now filter by organization's transaction unique IDs before returning data
    - Edge cases handled: missing agencyId/accountId returns empty results safely
  - Direct API endpoints (transactions, chargebacks) now require Super Owner access
  - Super Owner sees all data; other roles see only data from their organization's uploads

- **2025-11-27**: Organization file assignment feature
  - Added organization columns (Agency, Account) to upload history table
  - Super Owner can see and filter by all agencies and accounts
  - Agency Admin can see and filter by accounts within their agency
  - Added "Unassigned" filter to show uploads not yet assigned to any organization
  - Bulk selection and assignment dialog for assigning multiple uploads at once
  - Created `/api/emp/uploads/assign` endpoint for bulk file assignment
  - Updated uploads API to return agencyName and accountName for display
  - Session info returned with uploads for role-based UI rendering
  
- **2025-11-27**: Production-ready RBAC security implementation
  - All API routes now validate sessions against MongoDB database
  - Write operations (upload, submit, void, reset, delete, reconcile, edit, filter) require Super Owner role via `requireWriteAccess()`
  - Read operations (analytics, cached data, settings GET) require authenticated session via `requireSession()`
  - bcrypt (12 rounds) for password hashing, replacing legacy SHA-256
  - Removed HMAC authentication bypass from middleware
  - JWT tokens stored in HttpOnly cookies, validated against sessions collection
  - Role hierarchy: superOwner > agencyAdmin > agencyViewer > accountAdmin > accountViewer
  - Only Super Owner can sync to emerchantpay gateway; all other roles have read-only access

- **2025-11-24**: Initial Replit environment setup completed
  - Configured Next.js to run on port 5000 with host 0.0.0.0
  - Installed dependencies via npm
  - Set up environment variables and secrets
  - Configured deployment for autoscale (production ready)
  - Verified homepage and admin login functionality
  
- **2025-11-24**: Frontend revamp for /emp section
  - Created custom hooks for better UX:
    - `useAsyncAction`: Spam-proof async operations with loading states
    - `useBreakpoint`: Responsive breakpoint detection for mobile
  - Built `ResponsiveTable` component: table on desktop, card layout on mobile (<640px)
  - Updated all pages with mobile-responsive design
  - Implemented AbortController for race condition prevention
  - Enhanced `EmpHeader` with mobile drawer navigation
  - All async buttons now use consistent loading states and spam prevention
  - Fixed all TypeScript/Next.js warnings
  
- **2025-11-24**: Analytics pages mobile optimization and UX improvements
  - Created `TruncatedFilename` component for long filenames:
    - Desktop: Shows tooltip on hover
    - Mobile: Opens dialog on tap/click
    - Clickable button with dotted underline for discoverability
  - Optimized `/emp/analytics/chargeback-extraction`:
    - Mobile-responsive padding, headers, and buttons
    - Sorted batches by upload date (newest first)
    - Integrated TruncatedFilename for long filenames
  - Optimized `/emp/analytics/batch-chargebacks`:
    - Mobile-responsive card grid and layouts
    - Sorted batches by upload date (newest first)
    - TruncatedFilename in batch selection table
  - Dashboard improvements:
    - Sorted uploads by creation date (newest first)
    - Integrated TruncatedFilename with responsive maxLength
  - All file lists now consistently show newest uploads first

- **2025-11-24**: Upload detail page optimization and action menu redesign
  - Reorganized page actions with clean hierarchy:
    - Primary: "Sync All to Gateway" button (prominent)
    - Secondary: 3-dot overflow menu with all other actions
  - Dropdown menu actions (properly triggered with onSelect):
    - Void X Approved (conditional, only when approved > 0)
    - Manual Void (opens dialog)
    - Reset
    - Filter Chargebacks (opens alert dialog)
    - Reconcile
    - Submit All to Gateway (redundant option for flexibility)
  - Visual enhancements:
    - Improved card styling with subtle borders and shadows
    - Enhanced reconciliation report with colored stat boxes
    - Better responsive padding and text sizing for mobile
    - Refined spacing and visual hierarchy throughout
  - Performance optimizations:
    - Added useMemo for row data processing (statuses and errors)
    - Proper state management for dialogs and async actions
    - Reduced re-renders with memoized calculations
  - Mobile-first design with responsive breakpoints
  - All dialog triggers work correctly from dropdown menu

## Technology Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: MongoDB (external connection required)
- **Payment Processing**: emerchantpay Genesis API

## Project Architecture
This is a full-stack Next.js application with:
- Frontend pages in `/app` directory
- API routes in `/app/api/emp` for emerchantpay integration
- Employee/admin dashboard at `/emp/*` routes
- MongoDB for data persistence
- JWT-based session authentication

## Environment Configuration

### Required Environment Variables
The following environment variables must be configured for the application to work:

#### MongoDB
- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB`: Database name (default: melinux_emp)

#### emerchantpay API
- `EMP_GENESIS_ENDPOINT`: API endpoint (e.g., gate.emerchantpay.net)
- `EMP_GENESIS_USERNAME`: API username
- `EMP_GENESIS_PASSWORD`: API password
- `EMP_GENESIS_TERMINAL_TOKEN`: Terminal token

#### Admin Authentication
- `EMP_ADMIN_USER`: Admin username for login
- `EMP_ADMIN_PASS`: Admin password
- `EMP_SESSION_SECRET`: Secret for session encryption

#### SMTP Email (Optional)
- `SMTP_HOST`: SMTP server hostname
- `SMTP_PORT`: SMTP server port
- `SMTP_USER`: SMTP username
- `SMTP_PASS`: SMTP password
- `CONTACT_TO`: Email recipient for contact form

#### Application URLs
- `EMP_NOTIFICATION_URL`: Webhook URL for emerchantpay notifications
- `EMP_RETURN_BASE_URL`: Base URL for transaction returns

### Development Server
- Port: 5000 (configured for Replit)
- Host: 0.0.0.0 (allows proxy access)
- Command: `npm run dev`

## Multi-Company Support
The system automatically detects company configuration based on uploaded CSV filename:
- **BestWin**: Files containing "bestwin"
- **Grand Luck**: Files containing "grandluck", "grand-luck", or "grand_luck"
- **MeLinux**: Default for all other files

## Key Features
- CSV upload and batch processing for SEPA Direct Debit
- Chargeback detection and management
- Transaction reconciliation with emerchantpay
- Analytics dashboard with success rates and financial summaries
- Real-time status tracking
- Manual void functionality
- Row-level editing before submission

## Documentation
See `/documentation` folder for detailed technical documentation:
- EMERCHANTPAY-API.md: API integration details
- DATABASE-SCHEMA.md: MongoDB schema
- BATCH-SYNCHRONIZATION.md: Batch processing
- BATCH-CHARGEBACKS-FINAL.md: Chargeback handling
- ANALYTICS-DEBUG.md: Analytics implementation
