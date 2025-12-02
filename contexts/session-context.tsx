"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface SessionUser {
  userId: string
  email: string
  name: string
  role: 'superOwner' | 'agencyAdmin' | 'agencyViewer' | 'accountAdmin' | 'accountViewer'
  agencyId?: string
  accountId?: string
  agencyName?: string
  accountName?: string
}

interface SessionContextType {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  canWrite: boolean
  canManageOrgs: boolean
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
  canWrite: false,
  canManageOrgs: false,
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await fetch('/api/emp/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user) {
          setUser(data.user)
        } else {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/emp/auth/logout', { method: 'POST' })
    } catch {
    } finally {
      setUser(null)
      window.location.href = '/emp/login'
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const canWrite = user?.role === 'superOwner'
  const canManageOrgs = user?.role === 'superOwner'

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout, canWrite, canManageOrgs }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}

export function useRequireSession() {
  const session = useSession()
  
  useEffect(() => {
    if (!session.loading && !session.user) {
      window.location.href = '/emp/login'
    }
  }, [session.loading, session.user])
  
  return session
}
