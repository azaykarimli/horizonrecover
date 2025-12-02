# MeLinux EmerchantPay Integration Platform

## Overview
A Next.js application for managing SEPA Direct Debit (SDD) transactions through the emerchantpay Genesis API, with multi-company support, chargeback management, and batch processing capabilities.

## Recent Changes
- **December 2025**: Initial Replit import and configuration
  - Configured Next.js to run on port 5000
  - Set up environment variables from .env file
  - Added Replit-specific configurations

## Project Architecture

### Technology Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: MongoDB
- **Payment Processing**: emerchantpay Genesis API
- **Authentication**: JWT-based session management

### Project Structure
```
/app
  /api/emp          # emerchantpay API routes
  /emp              # Employee/admin dashboard
  /services         # Public service pages
/components
  /emp              # Dashboard components
  /ui               # Reusable UI components
/lib
  emerchantpay.ts   # SDD Sale transactions
  emerchantpay-void.ts   # Void transactions
  emerchantpay-reconcile.ts   # Reconciliation
  emp.ts            # CSV parsing & company detection
  db.ts             # MongoDB utilities
/documentation      # Technical documentation
```

### Key Features
- CSV Upload & Processing for batch SEPA Direct Debit
- Multi-Company Support (BestWin, Grand Luck, MeLinux)
- Dynamic Descriptors for bank statements
- Chargeback Management with auto-detection
- Transaction Reconciliation
- Batch Analytics

## Environment Variables

### Required Secrets (configured in Replit Secrets)
- `MONGODB_URI` - MongoDB connection string
- `EMP_GENESIS_ENDPOINT` - emerchantpay API endpoint
- `EMP_GENESIS_USERNAME` - API username
- `EMP_GENESIS_PASSWORD` - API password
- `EMP_GENESIS_TERMINAL_TOKEN` - Terminal token
- `SESSION_SECRET` - Session encryption key
- `EMP_ADMIN_USER` - Admin username
- `EMP_ADMIN_PASS` - Admin password
- `SMTP_PASS` - SMTP password for emails

### Environment Variables
- `MONGODB_DB` - Database name
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` - Email configuration
- `EMP_NOTIFICATION_URL` - Payment notification webhook
- `EMP_RETURN_BASE_URL` - Return URL base for payments

## Development

### Running Locally
```bash
npm run dev
```
The app runs on `http://0.0.0.0:5000`

### Building for Production
```bash
npm run build
npm start
```

## User Preferences
- TypeScript for all new code
- shadcn/ui components for UI
- Tailwind CSS for styling
