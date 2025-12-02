import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { EmpHeader } from '@/components/emp/emp-header-server'
import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SessionProvider } from '@/contexts/session-context'
import { validateSession } from '@/lib/db/users'

export default async function EmpLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''

  const isReturnPage = ['/emp/success', '/emp/failure', '/emp/pending', '/emp/cancel'].includes(pathname)
  const isLoginPage = pathname === '/emp/login'

  if (isReturnPage || isLoginPage) {
    return (
      <>
        {children}
        <Toaster richColors position="top-right" />
      </>
    )
  }

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('emp_session')?.value

  if (!sessionToken) {
    redirect('/emp/login')
  }

  const session = await validateSession(sessionToken)
  if (!session) {
    redirect('/emp/login')
  }

  return (
    <SessionProvider>
      <div className="min-h-screen bg-background flex flex-col items-center">
        <EmpHeader />
        <main className="w-full max-w-7xl px-4 py-6">
          {children}
        </main>
        <Toaster richColors position="top-right" />
      </div>
    </SessionProvider>
  )
}


