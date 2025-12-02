import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllAgencies, createAgency } from '@/lib/db/users'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (session.role !== 'superOwner') {
      return NextResponse.json({ error: 'Forbidden: Super Owner access required' }, { status: 403 })
    }
    
    const agencies = await getAllAgencies()
    return NextResponse.json({ agencies })
  } catch (err: any) {
    console.error('Get agencies error:', err)
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
    
    const { name, slug } = await req.json()
    
    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
    }
    
    const agency = await createAgency({ name, slug })
    return NextResponse.json({ agency })
  } catch (err: any) {
    console.error('Create agency error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
