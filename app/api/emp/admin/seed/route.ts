import { NextResponse } from 'next/server'
import { findUserByEmail, createUser, createAgency, createAccount, findAgencyBySlug, findAccountBySlug } from '@/lib/db/users'

export async function POST(req: Request) {
  try {
    const { adminSecret } = await req.json()
    
    const expectedSecret = process.env.EMP_SESSION_SECRET || 'dev-secret'
    if (adminSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Invalid admin secret' }, { status: 401 })
    }
    
    const results: string[] = []
    
    const superOwnerEmail = process.env.EMP_ADMIN_USER || 'admin@melinux.net'
    const superOwnerPass = process.env.EMP_ADMIN_PASS || 'admin123'
    
    let superOwner = await findUserByEmail(superOwnerEmail)
    if (!superOwner) {
      superOwner = await createUser({
        email: superOwnerEmail,
        password: superOwnerPass,
        name: 'Super Owner',
        role: 'superOwner',
      })
      results.push(`Created Super Owner: ${superOwnerEmail}`)
    } else {
      results.push(`Super Owner already exists: ${superOwnerEmail}`)
    }
    
    let callCollect = await findAgencyBySlug('callcollect')
    if (!callCollect) {
      callCollect = await createAgency({
        name: 'CallCollect',
        slug: 'callcollect',
      })
      results.push('Created Agency: CallCollect')
    } else {
      results.push('Agency already exists: CallCollect')
    }
    
    let grandluck = await findAccountBySlug('grandluck')
    if (!grandluck) {
      grandluck = await createAccount({
        name: 'Grand Luck',
        slug: 'grandluck',
        agencyId: callCollect._id!.toString(),
      })
      results.push('Created Account: Grand Luck')
    } else {
      results.push('Account already exists: Grand Luck')
    }
    
    let bestwin = await findAccountBySlug('bestwin')
    if (!bestwin) {
      bestwin = await createAccount({
        name: 'BestWin',
        slug: 'bestwin',
        agencyId: callCollect._id!.toString(),
      })
      results.push('Created Account: BestWin')
    } else {
      results.push('Account already exists: BestWin')
    }
    
    const agencyAdminEmail = 'agency@callcollect.com'
    let agencyAdmin = await findUserByEmail(agencyAdminEmail)
    if (!agencyAdmin) {
      agencyAdmin = await createUser({
        email: agencyAdminEmail,
        password: 'agency123',
        name: 'CallCollect Admin',
        role: 'agencyAdmin',
        agencyId: callCollect._id!.toString(),
      })
      results.push(`Created Agency Admin: ${agencyAdminEmail}`)
    } else {
      results.push(`Agency Admin already exists: ${agencyAdminEmail}`)
    }
    
    const grandluckUserEmail = 'user@grandluck.com'
    let grandluckUser = await findUserByEmail(grandluckUserEmail)
    if (!grandluckUser) {
      grandluckUser = await createUser({
        email: grandluckUserEmail,
        password: 'grandluck123',
        name: 'Grand Luck User',
        role: 'accountAdmin',
        agencyId: callCollect._id!.toString(),
        accountId: grandluck._id!.toString(),
      })
      results.push(`Created Account User: ${grandluckUserEmail}`)
    } else {
      results.push(`Account User already exists: ${grandluckUserEmail}`)
    }
    
    const bestwinUserEmail = 'user@bestwin.com'
    let bestwinUser = await findUserByEmail(bestwinUserEmail)
    if (!bestwinUser) {
      bestwinUser = await createUser({
        email: bestwinUserEmail,
        password: 'bestwin123',
        name: 'BestWin User',
        role: 'accountAdmin',
        agencyId: callCollect._id!.toString(),
        accountId: bestwin._id!.toString(),
      })
      results.push(`Created Account User: ${bestwinUserEmail}`)
    } else {
      results.push(`Account User already exists: ${bestwinUserEmail}`)
    }
    
    return NextResponse.json({ 
      ok: true,
      results,
      summary: {
        superOwner: superOwnerEmail,
        agency: 'CallCollect',
        accounts: ['Grand Luck', 'BestWin'],
      }
    })
  } catch (err: any) {
    console.error('Seed error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
