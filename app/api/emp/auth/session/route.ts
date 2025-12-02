import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/db/users'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('emp_session')?.value

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const session = await validateSession(token)

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        agencyId: session.agencyId,
        accountId: session.accountId,
        agencyName: session.agencyName,
        accountName: session.accountName,
      }
    })
  } catch (err: any) {
    console.error('Session check error:', err)
    return NextResponse.json({ authenticated: false, error: err?.message }, { status: 500 })
  }
}
