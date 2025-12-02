import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession } from '@/lib/db/users'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('emp_session')?.value
    
    if (token) {
      await deleteSession(token)
    }
    
    const res = NextResponse.json({ ok: true })
    res.cookies.set('emp_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return res
  } catch (err: any) {
    console.error('Logout error:', err)
    const res = NextResponse.json({ ok: true })
    res.cookies.set('emp_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return res
  }
}


