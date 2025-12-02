import { ObjectId } from 'mongodb'

export type UserRole = 'superOwner' | 'agencyAdmin' | 'agencyViewer' | 'accountAdmin' | 'accountViewer'

export interface Agency {
  _id?: ObjectId
  name: string
  slug: string
  status: 'active' | 'inactive'
  createdAt: Date
  updatedAt: Date
}

export interface Account {
  _id?: ObjectId
  name: string
  slug: string
  agencyId: ObjectId
  genesisCredentials?: {
    endpoint?: string
    username?: string
    password?: string
    terminalToken?: string
  }
  // Dynamic Company Settings
  contactEmail?: string
  returnUrls?: {
    baseUrl: string
    successPath?: string
    failurePath?: string
    pendingPath?: string
    cancelPath?: string
  }
  dynamicDescriptor?: {
    merchantName?: string
    merchantUrl?: string
  }
  fallbackDescription?: string
  status: 'active' | 'inactive'
  createdAt: Date
  updatedAt: Date
}

export interface User {
  _id?: ObjectId
  email: string
  passwordHash: string
  name: string
  role: UserRole
  agencyId?: ObjectId
  accountId?: ObjectId
  status: 'active' | 'inactive' | 'pending'
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  _id?: ObjectId
  userId: ObjectId
  token: string
  expiresAt: Date
  createdAt: Date
  userAgent?: string
  ip?: string
}

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: UserRole
  agencyId?: string
  accountId?: string
  agencyName?: string
  accountName?: string
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  superOwner: 100,
  agencyAdmin: 50,
  agencyViewer: 40,
  accountAdmin: 30,
  accountViewer: 20,
}

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}

export function canWriteToGateway(role: UserRole): boolean {
  return role === 'superOwner'
}

export function canManageOrganizations(role: UserRole): boolean {
  return role === 'superOwner'
}

export function canViewAgency(userRole: UserRole, userAgencyId?: string, targetAgencyId?: string): boolean {
  if (userRole === 'superOwner') return true
  if (!userAgencyId || !targetAgencyId) return false
  return userAgencyId === targetAgencyId
}

export function canViewAccount(
  userRole: UserRole,
  userAgencyId?: string,
  userAccountId?: string,
  targetAgencyId?: string,
  targetAccountId?: string
): boolean {
  if (userRole === 'superOwner') return true
  if (userRole === 'agencyAdmin' || userRole === 'agencyViewer') {
    return userAgencyId === targetAgencyId
  }
  if (userRole === 'accountAdmin' || userRole === 'accountViewer') {
    return userAccountId === targetAccountId
  }
  return false
}
