import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllAccounts, getAccountsByAgency, createAccount } from '@/lib/db/users'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (session.role !== 'superOwner' && session.role !== 'agencyAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    const { searchParams } = new URL(req.url)
    const agencyId = searchParams.get('agencyId')
    
    let accounts: Awaited<ReturnType<typeof getAllAccounts>> = []
    if (session.role === 'superOwner') {
      accounts = agencyId ? await getAccountsByAgency(agencyId) : await getAllAccounts()
    } else if (session.agencyId) {
      accounts = await getAccountsByAgency(session.agencyId)
    }
    
    return NextResponse.json({ accounts })
  } catch (err: any) {
    console.error('Get accounts error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (session.role !== 'superOwner') {
      return NextResponse.json({ error: 'Forbidden: Super Owner access required' }, { status: 403 })
    }
    
    const { name, slug, agencyId, genesisCredentials } = await req.json()
    
    if (!name || !slug || !agencyId) {
      return NextResponse.json({ error: 'Name, slug, and agencyId are required' }, { status: 400 })
    }
    
    const account = await createAccount({ name, slug, agencyId, genesisCredentials })
    return NextResponse.json({ account })
  } catch (err: any) {
    console.error('Create account error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
