import { NextResponse } from 'next/server'
import { validateUserCredentials, createSession, findAgencyById, findAccountById } from '@/lib/db/users'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await validateUserCredentials(email, password)
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const userAgent = req.headers.get('user-agent') || undefined
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
    
    const token = await createSession(user._id!.toString(), userAgent, ip)
    
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

    const res = NextResponse.json({ 
      ok: true,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        agencyName,
        accountName,
      }
    })
    
    res.cookies.set('emp_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
    
    return res
  } catch (err: any) {
    console.error('Login error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}


