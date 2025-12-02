import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, LogOut, Database, ExternalLink, Settings, BarChart3, Menu, Users } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { canManageOrganizations } from '@/lib/types/auth'
import { EmpHeaderClient, LogoutButton } from './emp-header-client'

export async function EmpHeader() {
    const session = await getSession()

    if (!session) {
        return null
    }

    const user = {
        name: session.name,
        email: session.email,
        role: session.role,
        agencyName: session.agencyName,
        accountName: session.accountName,
    }

    const canManageOrgs = canManageOrganizations(session.role)

    const baseNavItems = [
        { href: '/emp/upload', label: 'Upload', icon: 'LayoutDashboard' },
        { href: '/emp/analytics', label: 'Analytics', icon: 'BarChart3' },
    ]

    const adminNavItems = canManageOrgs ? [
        { href: '/emp/settings', label: 'Settings', icon: 'Settings' },
        { href: '/emp/admin', label: 'Admin', icon: 'Users' },
    ] : []

    const externalLinks = canManageOrgs ? [
        { href: 'https://emp.staging.merchant.emerchantpay.net/en/payment_transactions', label: 'Transactions' },
        { href: 'https://emp.staging.merchant.emerchantpay.net/en/transaction_attempts', label: 'Attempts' },
    ] : []

    return (
        <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
            {/* Mobile Header - hidden on desktop */}
            <div className="lg:hidden">
                <EmpHeaderClient
                    user={user}
                    baseNavItems={baseNavItems}
                    adminNavItems={adminNavItems}
                    externalLinks={externalLinks}
                />
            </div>

            {/* Desktop Header - hidden on mobile */}
            <div className="hidden lg:block">
                <div className="w-full max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        <Link href="/emp" className="text-lg font-semibold tracking-tight hover:text-primary transition-colors">
                            EMP Portal
                        </Link>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button asChild variant="ghost" size="sm" className="gap-2">
                            <Link href="/emp/upload">
                                <LayoutDashboard className="h-4 w-4" />
                                Upload
                            </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="gap-2">
                            <Link href="/emp/analytics">
                                <BarChart3 className="h-4 w-4" />
                                Analytics
                            </Link>
                        </Button>

                        {canManageOrgs && (
                            <>
                                <Button asChild variant="ghost" size="sm" className="gap-2">
                                    <Link href="/emp/settings">
                                        <Settings className="h-4 w-4" />
                                        Settings
                                    </Link>
                                </Button>
                                <Button asChild variant="ghost" size="sm" className="gap-2">
                                    <Link href="/emp/admin">
                                        <Users className="h-4 w-4" />
                                        Admin
                                    </Link>
                                </Button>
                                <Button asChild variant="ghost" size="sm" className="gap-2">
                                    <a href="https://emp.staging.merchant.emerchantpay.net/en/payment_transactions" target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                        Transactions
                                    </a>
                                </Button>
                                <Button asChild variant="ghost" size="sm" className="gap-2">
                                    <a href="https://emp.staging.merchant.emerchantpay.net/en/transaction_attempts" target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                        Attempts
                                    </a>
                                </Button>
                            </>
                        )}

                        <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                            <div className="text-sm text-right hidden xl:block">
                                <div className="font-medium">{user.name}</div>
                                <div className="text-xs text-muted-foreground">
                                    {user.accountName || user.agencyName || user.role}
                                </div>
                            </div>
                            <LogoutButton />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
