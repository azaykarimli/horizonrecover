"use client"

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, LogOut, Database, ExternalLink, Settings, BarChart3, Menu, Users, Building2, User } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-breakpoint'
import { useAsyncAction } from '@/hooks/use-async-action'
import { usePathname } from 'next/navigation'
import { useSession } from '@/contexts/session-context'
import { Badge } from '@/components/ui/badge'

export function EmpHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const { user, canManageOrgs, logout } = useSession()

  const logoutAction = useAsyncAction(
    async () => {
      await logout()
    },
    {
      errorMessage: 'Logout failed',
    }
  )

  const baseNavItems = [
    { href: '/emp/upload', label: 'Upload', icon: LayoutDashboard },
    { href: '/emp/analytics', label: 'Analytics', icon: BarChart3 },
  ]

  const adminNavItems = canManageOrgs ? [
    { href: '/emp/settings', label: 'Settings', icon: Settings },
    { href: '/emp/admin', label: 'Admin', icon: Users },
  ] : []

  const navItems = [...baseNavItems, ...adminNavItems]

  const externalLinks = canManageOrgs ? [
    { href: 'https://emp.staging.merchant.emerchantpay.net/en/payment_transactions', label: 'Transactions' },
    { href: 'https://emp.staging.merchant.emerchantpay.net/en/transaction_attempts', label: 'Attempts' },
  ] : []

  const isActive = (href: string) => {
    return pathname?.startsWith(href)
  }

  if (isMobile) {
    return (
      <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <Link href="/emp" className="text-lg font-semibold tracking-tight">
              EMP Portal
            </Link>
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md h-9 w-9 hover:bg-accent hover:text-accent-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  EMP Portal
                </SheetTitle>
                {user && (
                  <div className="text-sm text-muted-foreground mt-2">
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="text-xs">{user.email}</div>
                    {user.accountName && (
                      <Badge variant="outline" className="mt-1 text-xs">{user.accountName}</Badge>
                    )}
                    {user.agencyName && !user.accountName && (
                      <Badge variant="outline" className="mt-1 text-xs">{user.agencyName}</Badge>
                    )}
                  </div>
                )}
              </SheetHeader>

              <div className="flex flex-col gap-2 mt-6">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Navigation
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Button
                      key={item.href}
                      asChild
                      variant={isActive(item.href) ? "secondary" : "ghost"}
                      className="justify-start gap-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  )
                })}

                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">
                  External Links
                </div>
                {externalLinks.map((link) => (
                  <Button
                    key={link.href}
                    asChild
                    variant="ghost"
                    className="justify-start gap-2"
                  >
                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      {link.label}
                    </a>
                  </Button>
                ))}

                <div className="border-t my-4" />

                <Button
                  variant="outline"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    logoutAction.execute()
                  }}
                  disabled={logoutAction.isLoading}
                  className="justify-start gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {logoutAction.isLoading ? 'Logging out…' : 'Logout'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    )
  }

  return (
    <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="w-full max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <Link href="/emp" className="text-lg font-semibold tracking-tight hover:text-primary transition-colors">
            EMP Portal
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {baseNavItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.href}
                asChild
                variant={isActive(item.href) ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Link href={item.href}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            )
          })}

          {/* Admin nav items - always rendered to prevent layout shift */}
          <Button
            asChild
            variant={isActive('/emp/settings') ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            style={{ visibility: canManageOrgs ? 'visible' : 'hidden' }}
          >
            <Link href="/emp/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button
            asChild
            variant={isActive('/emp/admin') ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            style={{ visibility: canManageOrgs ? 'visible' : 'hidden' }}
          >
            <Link href="/emp/admin">
              <Users className="h-4 w-4" />
              Admin
            </Link>
          </Button>

          {/* External links - always rendered to prevent layout shift */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-2"
            style={{ visibility: canManageOrgs ? 'visible' : 'hidden' }}
          >
            <a href="https://emp.staging.merchant.emerchantpay.net/en/payment_transactions" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Transactions
            </a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-2"
            style={{ visibility: canManageOrgs ? 'visible' : 'hidden' }}
          >
            <a href="https://emp.staging.merchant.emerchantpay.net/en/transaction_attempts" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Attempts
            </a>
          </Button>

          {user && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l">
              <div className="text-sm text-right hidden lg:block">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">
                  {user.accountName || user.agencyName || user.role}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => logoutAction.execute()}
                disabled={logoutAction.isLoading}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{logoutAction.isLoading ? 'Logging out…' : 'Logout'}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
