import { cookies } from 'next/headers'
import { SessionPayload, UserRole, canWriteToGateway, canManageOrganizations, canViewAccount } from './types/auth'
import { validateSession, findUserById, findAgencyById, findAccountById } from './db/users'

const SESSION_COOKIE = 'emp_session'

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return validateSession(token)
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireRole(minRole: UserRole): Promise<SessionPayload> {
  const session = await requireSession()
  const roleHierarchy: Record<UserRole, number> = {
    superOwner: 100,
    agencyAdmin: 50,
    agencyViewer: 40,
    accountAdmin: 30,
    accountViewer: 20,
  }
  if (roleHierarchy[session.role] < roleHierarchy[minRole]) {
    throw new Error('Forbidden: Insufficient permissions')
  }
  return session
}

export async function requireSuperOwner(): Promise<SessionPayload> {
  const session = await requireSession()
  if (session.role !== 'superOwner') {
    throw new Error('Forbidden: Super Owner access required')
  }
  return session
}

export async function requireWriteAccess(): Promise<SessionPayload> {
  const session = await requireSession()
  if (!canWriteToGateway(session.role)) {
    throw new Error('Forbidden: Only Super Owner can perform write operations')
  }
  return session
}

export async function requireOrganizationAccess(agencyId?: string, accountId?: string): Promise<SessionPayload> {
  const session = await requireSession()

  if (session.role === 'superOwner') {
    return session
  }

  if (agencyId && session.agencyId !== agencyId) {
    throw new Error('Forbidden: No access to this agency')
  }

  if (accountId && session.accountId && session.accountId !== accountId) {
    throw new Error('Forbidden: No access to this account')
  }

  return session
}

export function getOrganizationFilter(session: SessionPayload): Record<string, any> {
  if (session.role === 'superOwner') {
    return {}
  }

  if (session.role === 'agencyAdmin' || session.role === 'agencyViewer') {
    return { agencyId: session.agencyId }
  }

  if (session.role === 'accountAdmin' || session.role === 'accountViewer') {
    return { accountId: session.accountId }
  }

  return { _id: null }
}

export function canUserWrite(session: SessionPayload): boolean {
  return canWriteToGateway(session.role)
}

export function canUserManageOrgs(session: SessionPayload): boolean {
  return canManageOrganizations(session.role)
}

export function canUserViewUpload(
  session: SessionPayload,
  uploadAgencyId?: string,
  uploadAccountId?: string
): boolean {
  return canViewAccount(
    session.role,
    session.agencyId,
    session.accountId,
    uploadAgencyId,
    uploadAccountId
  )
}

export function canManageUpload(session: SessionPayload, upload: any): boolean {
  // Super Owner can do anything
  if (session.role === 'superOwner') return true

  // If upload is locked (approved > 1), non-super owners cannot manage it
  if ((upload.approvedCount || 0) > 1) return false

  // Check ownership
  return canViewAccount(
    session.role,
    session.agencyId,
    session.accountId,
    upload.agencyId,
    upload.accountId
  )
}
