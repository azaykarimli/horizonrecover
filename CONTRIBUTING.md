# Contributing to MeLinux emerchantpay Integration
  
Thank you for your interest in contributing to the MeLinux emerchantpay Integration Platform! This document provides guidelines and instructions for collaborators.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)

---

## Getting Started

### Prerequisites

- **Node.js**: Version 18 or higher
- **pnpm**: Package manager (install with `npm install -g pnpm`)
- **MongoDB**: Access to MongoDB Atlas or local instance
- **emerchantpay Account**: API credentials for testing

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/melinux-emp.git
   cd melinux-emp
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

4. **Run development server**:
   ```bash
   pnpm dev
   ```

5. **Open in browser**:
   ```
   http://localhost:3000
   ```

### First-Time Contributors

Before making changes:

1. **Read the documentation**: Start with `/documentation/README.md`
2. **Review the codebase**: Understand the project structure
3. **Run the app locally**: Test basic functionality
4. **Check existing issues**: See if there's something to work on

---

## Development Workflow

### Branch Strategy

We use a feature branch workflow:

```
main (production)
  ├── develop (staging)
  │   ├── feature/add-refund-functionality
  │   ├── feature/improve-analytics
  │   ├── bugfix/fix-duplicate-ids
  │   └── hotfix/critical-security-fix
```

### Creating a Branch

1. **Pull latest changes**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

   Branch naming conventions:
   - `feature/` - New features
   - `bugfix/` - Bug fixes
   - `hotfix/` - Critical production fixes
   - `docs/` - Documentation updates
   - `refactor/` - Code refactoring

3. **Make your changes** and commit regularly:
   ```bash
   git add .
   git commit -m "Add: feature description"
   ```

4. **Push to remote**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Messages

Use clear, descriptive commit messages:

**Format**:
```
Type: Short description (50 chars max)

Longer explanation if needed (wrap at 72 chars)

- Bullet points for details
- References to issues: #123
```

**Types**:
- `Add:` - New feature or file
- `Fix:` - Bug fix
- `Update:` - Modify existing feature
- `Remove:` - Delete feature or file
- `Refactor:` - Code restructuring
- `Docs:` - Documentation changes
- `Test:` - Add or update tests
- `Style:` - Code formatting (no logic change)

**Examples**:
```
Add: manual void dialog for single transactions

Implement a dialog that allows users to void individual
transactions by entering the unique ID.

- Created ManualVoidDialog component
- Added API endpoint /api/emp/void-manual/route.ts
- Updated upload-detail-client.tsx to include button
```

```
Fix: duplicate transaction IDs in batch processing

Modified buildTransactionId() to include random component
and use current date instead of CSV due date.

Fixes #42
```

---

## Code Standards

### TypeScript

- **Use strict typing**: Avoid `any` when possible
- **Define interfaces**: For all data structures
- **Export types**: Make types reusable across files

**Example**:
```typescript
// ✅ Good
export interface UploadDocument {
  _id: ObjectId
  filename: string
  uploadedAt: Date
  records: CsvRecord[]
}

// ❌ Avoid
const upload: any = { ... }
```

### React Components

- **Use TypeScript**: All components in `.tsx` files
- **Functional components**: Prefer hooks over class components
- **Props interface**: Define props explicitly

**Example**:
```tsx
// ✅ Good
interface UploadTableProps {
  uploads: UploadDocument[]
  onRefresh: () => void
}

export function UploadTable({ uploads, onRefresh }: UploadTableProps) {
  // Component code
}

// ❌ Avoid
export function UploadTable(props: any) {
  // Component code
}
```

### API Routes

- **Use Next.js conventions**: File-based routing
- **Error handling**: Always use try-catch
- **Response format**: Consistent JSON structure

**Example**:
```typescript
// ✅ Good
export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return Response.json({ success: true, data })
  } catch (error) {
    console.error('[API] Error:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    )
  }
}

// ❌ Avoid
export async function GET() {
  const data = await fetchData() // No error handling
  return Response.json(data) // Inconsistent format
}
```

### Naming Conventions

- **Files**: `kebab-case.tsx` (e.g., `upload-detail-client.tsx`)
- **Components**: `PascalCase` (e.g., `UploadTable`)
- **Functions**: `camelCase` (e.g., `fetchUploadData`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_UPLOAD_SIZE`)
- **MongoDB Collections**: `snake_case` (e.g., `emp_uploads`)

### Code Formatting

We use Prettier for consistent formatting:

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

**ESLint** for code quality:

```bash
# Lint all files
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Writing Tests

**Unit Tests**: Test individual functions

```typescript
// lib/emp.test.ts
import { buildTransactionId } from './emp'

describe('buildTransactionId', () => {
  it('should generate unique transaction ID', () => {
    const id1 = buildTransactionId('customer123', '2025-11-18', 0)
    const id2 = buildTransactionId('customer123', '2025-11-18', 0)
    
    expect(id1).not.toBe(id2) // Should be different due to random component
  })
})
```

**Integration Tests**: Test API endpoints

```typescript
// app/api/emp/submit/[id]/route.test.ts
import { POST } from './route'

describe('POST /api/emp/submit/[id]', () => {
  it('should submit upload successfully', async () => {
    const request = new Request('http://localhost/api/emp/submit/123', {
      method: 'POST'
    })
    
    const response = await POST(request, { params: { id: '123' } })
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })
})
```

### Manual Testing

Before submitting a PR:

1. **Test locally**: Run the app and test your changes
2. **Test edge cases**: Try invalid inputs, missing data, etc.
3. **Test browser compatibility**: Chrome, Firefox, Safari
4. **Test mobile**: Responsive design

---

## Documentation

### When to Update Documentation

Update documentation when you:
- Add a new feature
- Change an API endpoint
- Modify database schema
- Fix a significant bug
- Add new environment variables

### Where to Document

- **Code comments**: Explain complex logic
- **README.md**: Update if setup process changes
- **documentation/**: Add or update technical docs
- **CHANGELOG.md**: Log all changes

### Documentation Style

- **Be clear and concise**: Short sentences, simple words
- **Include examples**: Code snippets, screenshots
- **Link related docs**: Cross-reference other documentation
- **Update the index**: Add new docs to `documentation/README.md`

**Example**:
```markdown
## New Feature: Manual Void

Allows users to void individual transactions by unique ID.

### Usage

1. Navigate to Upload Detail page
2. Click "Manual Void" button
3. Enter transaction unique ID
4. Click "Void Transaction"

### API Endpoint

`POST /api/emp/void-manual/route.ts`

See [emerchantpay API Documentation](./documentation/EMERCHANTPAY-API.md#void-transactions) for details.
```

---

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass: `pnpm test`
- [ ] No linting errors: `pnpm lint`
- [ ] Documentation updated
- [ ] Tested locally
- [ ] Branch is up to date with `main`

### Creating a Pull Request

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open PR on GitHub**:
   - Go to repository page
   - Click "New Pull Request"
   - Select your branch
   - Fill out PR template

3. **PR Template**:
   ```markdown
   ## Description
   Brief description of changes
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Code refactoring
   
   ## How to Test
   1. Step 1
   2. Step 2
   3. Expected result
   
   ## Screenshots (if applicable)
   
   ## Related Issues
   Closes #123
   ```

4. **Request review**: Assign reviewers

### Review Process

1. **Code review**: Wait for approval from maintainers
2. **Address feedback**: Make requested changes
3. **Re-request review**: After making changes
4. **Merge**: Maintainer will merge after approval

### After Merge

- Delete your feature branch
- Pull latest `main` branch
- Celebrate! 🎉

---

## Project Structure

### Key Directories

```
/app
  /api/emp              # API routes for emerchantpay operations
  /emp                  # Admin dashboard pages
  /services             # Public service pages

/components
  /emp                  # Dashboard components
  /ui                   # Reusable UI components (shadcn/ui)

/lib
  emerchantpay.ts       # SDD Sale transactions
  emerchantpay-void.ts  # Void operations
  emerchantpay-reconcile.ts  # Reconciliation
  emp.ts                # CSV parsing and company detection
  db.ts                 # MongoDB utilities

/documentation          # Technical documentation
/.tools                 # Helper scripts (CSV diff, etc.)
/public                 # Static assets
```

### Key Files

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `next.config.mjs` - Next.js configuration
- `.env.example` - Environment variable template
- `middleware.ts` - Auth middleware
- `README.md` - Project overview

---

## Common Tasks

### Adding a New API Endpoint

1. Create file in `/app/api/emp/your-endpoint/route.ts`
2. Implement `GET`, `POST`, etc. handler
3. Add error handling
4. Update documentation

### Adding a New Component

1. Create file in `/components/emp/your-component.tsx`
2. Define props interface
3. Implement component
4. Add to index file (if applicable)

### Modifying Database Schema

1. Update types in `lib/db.ts` or relevant file
2. Create migration script (if needed)
3. Update `documentation/DATABASE-SCHEMA.md`
4. Test with existing data

### Adding a New Company Configuration

1. Update `detectCompanyFromFilename()` in `lib/emp.ts`
2. Add company config object
3. Test with sample CSV
4. Update documentation

---

## Getting Help

### Resources

- **Documentation**: `/documentation/README.md`
- **Code Examples**: Browse existing components and API routes
- **Issues**: Check GitHub issues for similar problems

### Contact

- **Team Chat**: [Your team chat link]
- **Email**: dev@melinux.net
- **GitHub Issues**: For bugs and feature requests

### Troubleshooting

**Problem**: `MONGODB_URI is not set`
- **Solution**: Copy `.env.example` to `.env.local` and add your MongoDB URI

**Problem**: `Genesis credentials are not configured`
- **Solution**: Add emerchantpay credentials to `.env.local`

**Problem**: Tests failing
- **Solution**: Run `pnpm install` and ensure database is running

**Problem**: Port 3000 already in use
- **Solution**: Kill process: `lsof -ti:3000 | xargs kill -9` or use different port

---

## Code of Conduct

### Our Standards

- **Be respectful**: Treat everyone with respect
- **Be collaborative**: Work together, help each other
- **Be professional**: Keep discussions constructive
- **Be inclusive**: Welcome diverse perspectives

### Unacceptable Behavior

- Harassment or discrimination
- Offensive comments or personal attacks
- Publishing private information
- Trolling or insulting behavior

### Reporting

Report unacceptable behavior to: conduct@melinux.net

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

**Thank you for contributing to MeLinux emerchantpay Integration!** 🚀

For questions about contributing, please contact the development team or open a GitHub issue.

