import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllUsers, getUsersByAgency, createUser } from '@/lib/db/users'
import { UserRole } from '@/lib/types/auth'

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
    
    let users
    if (session.role === 'superOwner') {
      users = agencyId ? await getUsersByAgency(agencyId) : await getAllUsers()
    } else if (session.agencyId) {
      users = await getUsersByAgency(session.agencyId)
    } else {
      users = []
    }
    
    const sanitized = users.map(u => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      agencyId: u.agencyId,
      accountId: u.accountId,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }))
    
    return NextResponse.json({ users: sanitized })
  } catch (err: any) {
    console.error('Get users error:', err)
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
    
    const { email, password, name, role, agencyId, accountId } = await req.json()
    
    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Email, password, name, and role are required' }, { status: 400 })
    }
    
    const validRoles: UserRole[] = ['superOwner', 'agencyAdmin', 'agencyViewer', 'accountAdmin', 'accountViewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    
    if ((role === 'agencyAdmin' || role === 'agencyViewer') && !agencyId) {
      return NextResponse.json({ error: 'Agency ID is required for agency roles' }, { status: 400 })
    }
    
    if ((role === 'accountAdmin' || role === 'accountViewer') && (!agencyId || !accountId)) {
      return NextResponse.json({ error: 'Agency ID and Account ID are required for account roles' }, { status: 400 })
    }
    
    const user = await createUser({ email, password, name, role, agencyId, accountId })
    
    return NextResponse.json({ 
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      }
    })
  } catch (err: any) {
    console.error('Create user error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
