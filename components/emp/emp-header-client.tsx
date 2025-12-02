"use client"

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, LogOut, Database, ExternalLink, Settings, BarChart3, Menu, Users } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { useAsyncAction } from '@/hooks/use-async-action'
import { usePathname, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface NavItem {
    href: string
    label: string
    icon: string
}

interface User {
    name: string
    email: string
    role: string
    agencyName?: string
    accountName?: string
}

interface Props {
    user: User
    baseNavItems: NavItem[]
    adminNavItems: NavItem[]
    externalLinks: { href: string; label: string }[]
}

const iconMap = {
    LayoutDashboard,
    BarChart3,
    Settings,
    Users,
}

export function EmpHeaderClient({ user, baseNavItems, adminNavItems, externalLinks }: Props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    const logoutAction = useAsyncAction(
        async () => {
            await fetch('/api/emp/auth/logout', { method: 'POST' })
            router.push('/emp/login')
            router.refresh()
        },
        {
            errorMessage: 'Logout failed',
        }
    )

    const isActive = (href: string) => {
        return pathname?.startsWith(href)
    }

    const allNavItems = [...baseNavItems, ...adminNavItems]

    return (
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
                    </SheetHeader>

                    <div className="flex flex-col gap-2 mt-6">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Navigation
                        </div>
                        {allNavItems.map((item) => {
                            const Icon = iconMap[item.icon as keyof typeof iconMap]
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

                        {externalLinks.length > 0 && (
                            <>
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
                            </>
                        )}

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
    )
}

// Separate logout button for desktop (server component can't handle onClick)
export function LogoutButton() {
    const router = useRouter()
    const logoutAction = useAsyncAction(
        async () => {
            await fetch('/api/emp/auth/logout', { method: 'POST' })
            router.push('/emp/login')
            router.refresh()
        },
        {
            errorMessage: 'Logout failed',
        }
    )

    return (
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
    )
}
