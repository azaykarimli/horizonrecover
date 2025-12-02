import { ObjectId, Document } from 'mongodb'
import { getMongoClient, getDbName, withDbErrorHandling } from '../db'
import { User, Agency, Account, Session, SessionPayload, UserRole } from '../types/auth'
import bcrypt from 'bcryptjs'

const USERS_COLLECTION = 'users'
const AGENCIES_COLLECTION = 'agencies'
const ACCOUNTS_COLLECTION = 'accounts'
const SESSIONS_COLLECTION = 'sessions'

const BCRYPT_SALT_ROUNDS = 12

export async function getCollection<T extends Document>(name: string) {
  const client = await getMongoClient()
  return client.db(getDbName()).collection<T>(name)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createUser(data: {
  email: string
  password: string
  name: string
  role: UserRole
  agencyId?: string
  accountId?: string
}): Promise<User> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)

    const existing = await col.findOne({ email: data.email.toLowerCase() })
    if (existing) {
      throw new Error('User with this email already exists')
    }

    const now = new Date()
    const user: User = {
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      name: data.name,
      role: data.role,
      agencyId: data.agencyId ? new ObjectId(data.agencyId) : undefined,
      accountId: data.accountId ? new ObjectId(data.accountId) : undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await col.insertOne(user)
    return { ...user, _id: result.insertedId }
  }, 'createUser')
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)
    return col.findOne({ email: email.toLowerCase(), status: 'active' })
  }, 'findUserByEmail')
}

export async function findUserById(id: string): Promise<User | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)
    return col.findOne({ _id: new ObjectId(id), status: 'active' })
  }, 'findUserById')
}

export async function validateUserCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return null

  const col = await getCollection<User>(USERS_COLLECTION)
  await col.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })

  return user
}

export async function getAllUsers(): Promise<User[]> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)
    return col.find({ status: { $ne: 'inactive' } }).sort({ createdAt: -1 }).toArray()
  }, 'getAllUsers')
}

export async function getUsersByAgency(agencyId: string): Promise<User[]> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)
    return col.find({
      agencyId: new ObjectId(agencyId),
      status: { $ne: 'inactive' }
    }).sort({ createdAt: -1 }).toArray()
  }, 'getUsersByAgency')
}

export async function updateUser(id: string, data: Partial<User>): Promise<boolean> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<User>(USERS_COLLECTION)
    const updateData = { ...data, updatedAt: new Date() }
    delete updateData._id
    const result = await col.updateOne({ _id: new ObjectId(id) }, { $set: updateData })
    return result.modifiedCount > 0
  }, 'updateUser')
}

export async function createAgency(data: { name: string; slug: string }): Promise<Agency> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Agency>(AGENCIES_COLLECTION)

    const existing = await col.findOne({ slug: data.slug.toLowerCase() })
    if (existing) {
      throw new Error('Agency with this slug already exists')
    }

    const now = new Date()
    const agency: Agency = {
      name: data.name,
      slug: data.slug.toLowerCase(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await col.insertOne(agency)
    return { ...agency, _id: result.insertedId }
  }, 'createAgency')
}

export async function findAgencyById(id: string): Promise<Agency | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Agency>(AGENCIES_COLLECTION)
    return col.findOne({ _id: new ObjectId(id) })
  }, 'findAgencyById')
}

export async function findAgencyBySlug(slug: string): Promise<Agency | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Agency>(AGENCIES_COLLECTION)
    return col.findOne({ slug: slug.toLowerCase() })
  }, 'findAgencyBySlug')
}

export async function getAllAgencies(): Promise<Agency[]> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Agency>(AGENCIES_COLLECTION)
    return col.find({ status: 'active' }).sort({ name: 1 }).toArray()
  }, 'getAllAgencies')
}

export async function updateAgency(id: string, data: Partial<Agency>): Promise<boolean> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Agency>(AGENCIES_COLLECTION)
    const updateData = { ...data, updatedAt: new Date() }
    delete updateData._id
    const result = await col.updateOne({ _id: new ObjectId(id) }, { $set: updateData })
    return result.modifiedCount > 0
  }, 'updateAgency')
}

export async function updateAccount(id: string, data: Partial<Account>): Promise<boolean> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)
    const updateData = { ...data, updatedAt: new Date() }
    delete updateData._id
    const result = await col.updateOne({ _id: new ObjectId(id) }, { $set: updateData })
    return result.modifiedCount > 0
  }, 'updateAccount')
}

export async function createAccount(data: {
  name: string
  slug: string
  agencyId: string
  genesisCredentials?: Account['genesisCredentials']
}): Promise<Account> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)

    const existing = await col.findOne({ slug: data.slug.toLowerCase() })
    if (existing) {
      throw new Error('Account with this slug already exists')
    }

    const now = new Date()
    const account: Account = {
      name: data.name,
      slug: data.slug.toLowerCase(),
      agencyId: new ObjectId(data.agencyId),
      genesisCredentials: data.genesisCredentials,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await col.insertOne(account)
    return { ...account, _id: result.insertedId }
  }, 'createAccount')
}

export async function findAccountById(id: string): Promise<Account | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)
    return col.findOne({ _id: new ObjectId(id) })
  }, 'findAccountById')
}

export async function findAccountBySlug(slug: string): Promise<Account | null> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)
    return col.findOne({ slug: slug.toLowerCase() })
  }, 'findAccountBySlug')
}

export async function getAccountsByAgency(agencyId: string): Promise<Account[]> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)
    return col.find({
      agencyId: new ObjectId(agencyId),
      status: 'active'
    }).sort({ name: 1 }).toArray()
  }, 'getAccountsByAgency')
}

export async function getAllAccounts(): Promise<Account[]> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Account>(ACCOUNTS_COLLECTION)
    return col.find({ status: 'active' }).sort({ name: 1 }).toArray()
  }, 'getAllAccounts')
}

export async function createSession(userId: string, userAgent?: string, ip?: string): Promise<string> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Session>(SESSIONS_COLLECTION)

    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const session: Session = {
      userId: new ObjectId(userId),
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      userAgent,
      ip,
    }

    await col.insertOne(session)
    return token
  }, 'createSession')
}

export async function validateSession(token: string): Promise<SessionPayload | null> {
  return withDbErrorHandling(async () => {
    const sessionsCol = await getCollection<Session>(SESSIONS_COLLECTION)
    const session = await sessionsCol.findOne({
      token,
      expiresAt: { $gt: new Date() }
    })

    if (!session) return null

    const user = await findUserById(session.userId.toString())
    if (!user || user.status !== 'active') return null

    let agencyName: string | undefined
    let accountName: string | undefined

    if (user.agencyId) {
      const agency = await findAgencyById(user.agencyId.toString())
      agencyName = agency?.name
    }

    if (user.accountId) {
      const account = await findAccountById(user.accountId.toString())
      accountName = account?.name
    }

    return {
      userId: user._id!.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      agencyId: user.agencyId?.toString(),
      accountId: user.accountId?.toString(),
      agencyName,
      accountName,
    }
  }, 'validateSession')
}

export async function deleteSession(token: string): Promise<boolean> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Session>(SESSIONS_COLLECTION)
    const result = await col.deleteOne({ token })
    return result.deletedCount > 0
  }, 'deleteSession')
}

export async function cleanExpiredSessions(): Promise<number> {
  return withDbErrorHandling(async () => {
    const col = await getCollection<Session>(SESSIONS_COLLECTION)
    const result = await col.deleteMany({ expiresAt: { $lt: new Date() } })
    return result.deletedCount
  }, 'cleanExpiredSessions')
}
