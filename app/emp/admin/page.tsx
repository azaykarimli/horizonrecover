"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Loader2, Pencil, Key, MoreHorizontal, RefreshCw } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { useRequireSession } from '@/contexts/session-context'

export default function AdminPage() {
  const session = useRequireSession()
  const [users, setUsers] = useState<any[]>([])
  const [agencies, setAgencies] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false)
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })

  const [editAgencyDialogOpen, setEditAgencyDialogOpen] = useState(false)
  const [selectedAgency, setSelectedAgency] = useState<any>(null)

  const [editAccountDialogOpen, setEditAccountDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<any>(null)

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'agencyViewer',
    agencyId: '',
    accountId: '',
  })

  const [newAgencyDialogOpen, setNewAgencyDialogOpen] = useState(false)
  const [newAgency, setNewAgency] = useState({ name: '', slug: '' })

  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', slug: '', agencyId: '' })

  useEffect(() => {
    if (!session.loading && session.user?.role !== 'superOwner') {
      window.location.href = '/emp'
      return
    }

    if (session.user?.role === 'superOwner') {
      loadData()
    }
  }, [session.loading, session.user])

  async function loadData() {
    try {
      const [usersRes, agenciesRes, accountsRes] = await Promise.all([
        fetch('/api/emp/admin/users'),
        fetch('/api/emp/admin/agencies'),
        fetch('/api/emp/admin/accounts')
      ])

      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users || [])
      }
      if (agenciesRes.ok) {
        const data = await agenciesRes.json()
        setAgencies(data.agencies || [])
      }
      if (accountsRes.ok) {
        const data = await accountsRes.json()
        setAccounts(data.accounts || [])
      }
    } catch (error) {
      console.error('Failed to load data', error)
      toast.error('Failed to load admin data')
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshAnalytics() {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/emp/admin/refresh', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh analytics')
      }

      toast.success('Analytics refreshed successfully')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsRefreshing(false)
    }
  }

  async function createUser() {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/emp/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      toast.success('User created successfully')
      setUserDialogOpen(false)
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'agencyViewer',
        agencyId: '',
        accountId: '',
      })
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updateUser() {
    if (!selectedUser || !selectedUser.name || !selectedUser.email) {
      toast.error('Name and Email are required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/emp/admin/users/${selectedUser._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedUser.name,
          email: selectedUser.email,
          role: selectedUser.role,
          agencyId: selectedUser.agencyId,
          accountId: selectedUser.accountId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update user')
      }

      toast.success('User updated successfully')
      setEditUserDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function changePassword() {
    if (!passwordForm.password || passwordForm.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/emp/admin/users/${selectedUser._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordForm.password
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update password')
      }

      toast.success('Password updated successfully')
      setChangePasswordDialogOpen(false)
      setPasswordForm({ password: '', confirmPassword: '' })
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updateAgency() {
    if (!selectedAgency || !selectedAgency.name) {
      toast.error('Name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/emp/admin/agencies/${selectedAgency._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedAgency.name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update agency')
      }

      toast.success('Agency updated successfully')
      setEditAgencyDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updateAccount() {
    if (!selectedAccount || !selectedAccount.name) {
      toast.error('Name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/emp/admin/accounts/${selectedAccount._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedAccount.name,
          agencyId: selectedAccount.agencyId,
          filenamePattern: selectedAccount.filenamePattern,
          contactEmail: selectedAccount.contactEmail,
          returnUrls: selectedAccount.returnUrls,
          dynamicDescriptor: selectedAccount.dynamicDescriptor,
          fallbackDescription: selectedAccount.fallbackDescription,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update account')
      }

      toast.success('Account updated successfully')
      setEditAccountDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function createAgency() {
    if (!newAgency.name || !newAgency.slug) {
      toast.error('Name and Slug are required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/emp/admin/agencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgency),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create agency')
      }

      toast.success('Agency created successfully')
      setNewAgencyDialogOpen(false)
      setNewAgency({ name: '', slug: '' })
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function createAccount() {
    if (!newAccount.name || !newAccount.slug || !newAccount.agencyId) {
      toast.error('Name, Slug, and Agency are required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/emp/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create account')
      }

      toast.success('Account created successfully')
      setNewAccountDialogOpen(false)
      setNewAccount({ name: '', slug: '', agencyId: '' })
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function openEditDialog(user: any) {
    setSelectedUser({ ...user })
    setEditUserDialogOpen(true)
  }

  function openPasswordDialog(user: any) {
    setSelectedUser(user)
    setPasswordForm({ password: '', confirmPassword: '' })
    setChangePasswordDialogOpen(true)
  }

  function openEditAgencyDialog(agency: any) {
    setSelectedAgency({ ...agency })
    setEditAgencyDialogOpen(true)
  }

  function openEditAccountDialog(account: any) {
    setSelectedAccount({ ...account })
    setEditAccountDialogOpen(true)
  }

  function getAgencyName(id: string) {
    return agencies.find(a => a._id === id)?.name || id
  }

  function getAccountName(id: string) {
    return accounts.find(a => a._id === id)?.name || id
  }

  const filteredAccounts = newUser.agencyId
    ? accounts.filter(a => a.agencyId === newUser.agencyId)
    : []

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        </div>
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="agencies">Agencies</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>Manage system users and their roles</CardDescription>
                  </div>
                  <div className="h-10 w-24 bg-muted animate-pulse rounded-md" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <Button
          variant="outline"
          onClick={refreshAnalytics}
          disabled={isRefreshing}
          className="gap-2"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Analytics
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="agencies">Agencies</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage user accounts and permissions</CardDescription>
              </div>
              <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>Add a new user with specific permissions</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="userName">Name</Label>
                        <Input
                          id="userName"
                          value={newUser.name}
                          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                          placeholder="John Doe"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="userEmail">Email</Label>
                        <Input
                          id="userEmail"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userPassword">Password</Label>
                      <Input
                        id="userPassword"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="Minimum 6 characters"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(v) => setNewUser({ ...newUser, role: v, agencyId: '', accountId: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="superOwner">Super Owner (Full Access)</SelectItem>
                          <SelectItem value="agencyAdmin">Agency Admin</SelectItem>
                          <SelectItem value="agencyViewer">Agency Viewer</SelectItem>
                          <SelectItem value="accountAdmin">Account Admin</SelectItem>
                          <SelectItem value="accountViewer">Account Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(newUser.role === 'agencyAdmin' || newUser.role === 'agencyViewer' ||
                      newUser.role === 'accountAdmin' || newUser.role === 'accountViewer') && (
                        <div className="space-y-2">
                          <Label>Agency</Label>
                          <Select
                            value={newUser.agencyId}
                            onValueChange={(v) => setNewUser({ ...newUser, agencyId: v, accountId: '' })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select agency" />
                            </SelectTrigger>
                            <SelectContent>
                              {agencies.map((agency) => (
                                <SelectItem key={agency._id} value={agency._id}>{agency.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    {(newUser.role === 'accountAdmin' || newUser.role === 'accountViewer') && newUser.agencyId && (
                      <div className="space-y-2">
                        <Label>Account</Label>
                        <Select value={newUser.accountId} onValueChange={(v) => setNewUser({ ...newUser, accountId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredAccounts.map((account) => (
                              <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancel</Button>
                    <Button onClick={createUser} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create User
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Name</th>
                      <th className="p-3 text-left font-medium">Email</th>
                      <th className="p-3 text-left font-medium">Role</th>
                      <th className="p-3 text-left font-medium">Organization</th>
                      <th className="p-3 text-left font-medium">Last Login</th>
                      <th className="p-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id} className="border-b">
                        <td className="p-3 font-medium">{u.name}</td>
                        <td className="p-3 text-muted-foreground">{u.email}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${u.role === 'superOwner' ? 'bg-purple-100 text-purple-700' :
                            u.role.includes('Admin') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {u.accountId ? getAccountName(u.accountId) : u.agencyId ? getAgencyName(u.agencyId) : '-'}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openEditDialog(u)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit User
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openPasswordDialog(u)}>
                                <Key className="mr-2 h-4 w-4" />
                                Change Password
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No users yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Edit User Dialog */}
          <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription>Update user details and permissions</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 px-6">
                {selectedUser && (
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="editName">Name</Label>
                        <Input
                          id="editName"
                          value={selectedUser.name}
                          onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editEmail">Email</Label>
                        <Input
                          id="editEmail"
                          type="email"
                          value={selectedUser.email}
                          onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={selectedUser.role}
                        onValueChange={(v) => setSelectedUser({ ...selectedUser, role: v, agencyId: '', accountId: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="superOwner">Super Owner (Full Access)</SelectItem>
                          <SelectItem value="agencyAdmin">Agency Admin</SelectItem>
                          <SelectItem value="agencyViewer">Agency Viewer</SelectItem>
                          <SelectItem value="accountAdmin">Account Admin</SelectItem>
                          <SelectItem value="accountViewer">Account Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(selectedUser.role === 'agencyAdmin' || selectedUser.role === 'agencyViewer' ||
                      selectedUser.role === 'accountAdmin' || selectedUser.role === 'accountViewer') && (
                        <div className="space-y-2">
                          <Label>Agency</Label>
                          <Select
                            value={selectedUser.agencyId || ''}
                            onValueChange={(v) => setSelectedUser({ ...selectedUser, agencyId: v, accountId: '' })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select agency" />
                            </SelectTrigger>
                            <SelectContent>
                              {agencies.map((agency) => (
                                <SelectItem key={agency._id} value={agency._id}>{agency.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    {(selectedUser.role === 'accountAdmin' || selectedUser.role === 'accountViewer') && selectedUser.agencyId && (
                      <div className="space-y-2">
                        <Label>Account</Label>
                        <Select
                          value={selectedUser.accountId || ''}
                          onValueChange={(v) => setSelectedUser({ ...selectedUser, accountId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.filter(a => a.agencyId === selectedUser.agencyId).map((account) => (
                              <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
              <DialogFooter className="px-6 py-4">
                <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>Cancel</Button>
                <Button onClick={updateUser} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Change Password Dialog */}
          <Dialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>
                  Set a new password for <strong>{selectedUser?.name}</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChangePasswordDialogOpen(false)}>Cancel</Button>
                <Button onClick={changePassword} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Update Password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="agencies">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Agencies</CardTitle>
                <CardDescription>Manage agencies and their configurations</CardDescription>
              </div>
              <Dialog open={newAgencyDialogOpen} onOpenChange={setNewAgencyDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Agency
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Agency</DialogTitle>
                    <DialogDescription>Add a new agency to the system</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="newAgencyName">Name</Label>
                      <Input
                        id="newAgencyName"
                        value={newAgency.name}
                        onChange={(e) => setNewAgency({ ...newAgency, name: e.target.value })}
                        placeholder="Agency Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newAgencySlug">Slug</Label>
                      <Input
                        id="newAgencySlug"
                        value={newAgency.slug}
                        onChange={(e) => setNewAgency({ ...newAgency, slug: e.target.value })}
                        placeholder="agency-slug"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setNewAgencyDialogOpen(false)}>Cancel</Button>
                    <Button onClick={createAgency} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create Agency
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Name</th>
                      <th className="p-3 text-left font-medium">Code</th>
                      <th className="p-3 text-left font-medium">Accounts</th>
                      <th className="p-3 text-left font-medium">Created</th>
                      <th className="p-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencies.map((a) => (
                      <tr key={a._id} className="border-b">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3 text-muted-foreground">{a.code}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {accounts.filter(acc => acc.agencyId === a._id).length}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditAgencyDialog(a)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>


          {/* Edit Agency Dialog */}
          <Dialog open={editAgencyDialogOpen} onOpenChange={setEditAgencyDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Agency</DialogTitle>
                <DialogDescription>Update agency details</DialogDescription>
              </DialogHeader>
              {selectedAgency && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">Name</Label>
                    <Input
                      id="agencyName"
                      value={selectedAgency.name}
                      onChange={(e) => setSelectedAgency({ ...selectedAgency, name: e.target.value })}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditAgencyDialogOpen(false)}>Cancel</Button>
                <Button onClick={updateAgency} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>Manage accounts and their configurations</CardDescription>
              </div>
              <Dialog open={newAccountDialogOpen} onOpenChange={setNewAccountDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Account</DialogTitle>
                    <DialogDescription>Add a new account to an agency</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="newAccountName">Name</Label>
                      <Input
                        id="newAccountName"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                        placeholder="Account Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newAccountSlug">Slug</Label>
                      <Input
                        id="newAccountSlug"
                        value={newAccount.slug}
                        onChange={(e) => setNewAccount({ ...newAccount, slug: e.target.value })}
                        placeholder="account-slug"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Agency</Label>
                      <Select
                        value={newAccount.agencyId}
                        onValueChange={(v) => setNewAccount({ ...newAccount, agencyId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          {agencies.map((agency) => (
                            <SelectItem key={agency._id} value={agency._id}>{agency.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setNewAccountDialogOpen(false)}>Cancel</Button>
                    <Button onClick={createAccount} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create Account
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Name</th>
                      <th className="p-3 text-left font-medium">Agency</th>
                      <th className="p-3 text-left font-medium">Code</th>
                      <th className="p-3 text-left font-medium">Created</th>
                      <th className="p-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a._id} className="border-b">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3 text-muted-foreground">
                          {getAgencyName(a.agencyId)}
                        </td>
                        <td className="p-3 text-muted-foreground">{a.code}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditAccountDialog(a)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>


          {/* Edit Account Dialog */}
          <Dialog open={editAccountDialogOpen} onOpenChange={setEditAccountDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>Edit Account</DialogTitle>
                <DialogDescription>Update account details and settings</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 px-6">
                {selectedAccount && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="accountName">Name</Label>
                      <Input
                        id="accountName"
                        value={selectedAccount.name}
                        onChange={(e) => setSelectedAccount({ ...selectedAccount, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Agency</Label>
                      <Select
                        value={selectedAccount.agencyId}
                        onValueChange={(v) => setSelectedAccount({ ...selectedAccount, agencyId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          {agencies.map((agency) => (
                            <SelectItem key={agency._id} value={agency._id}>{agency.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="flex w-full justify-between p-0 font-medium hover:bg-transparent">
                          Dynamic Company Settings
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">

                        <div className="space-y-2">
                          <Label htmlFor="contactEmail">Contact Email</Label>
                          <Input
                            id="contactEmail"
                            value={selectedAccount.contactEmail || ''}
                            onChange={(e) => setSelectedAccount({ ...selectedAccount, contactEmail: e.target.value })}
                            placeholder="support@example.com"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="fallbackDescription">Fallback Description</Label>
                          <Input
                            id="fallbackDescription"
                            value={selectedAccount.fallbackDescription || ''}
                            onChange={(e) => setSelectedAccount({ ...selectedAccount, fallbackDescription: e.target.value })}
                            placeholder="Description to use if missing in CSV"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Merchant Name</Label>
                            <Input
                              value={selectedAccount.dynamicDescriptor?.merchantName || ''}
                              onChange={(e) => setSelectedAccount({
                                ...selectedAccount,
                                dynamicDescriptor: { ...selectedAccount.dynamicDescriptor, merchantName: e.target.value }
                              })}
                              placeholder="Merchant Name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Merchant URL</Label>
                            <Input
                              value={selectedAccount.dynamicDescriptor?.merchantUrl || ''}
                              onChange={(e) => setSelectedAccount({
                                ...selectedAccount,
                                dynamicDescriptor: { ...selectedAccount.dynamicDescriptor, merchantUrl: e.target.value }
                              })}
                              placeholder="https://example.com"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Return URL Base</Label>
                          <Input
                            value={selectedAccount.returnUrls?.baseUrl || ''}
                            onChange={(e) => setSelectedAccount({
                              ...selectedAccount,
                              returnUrls: { ...selectedAccount.returnUrls, baseUrl: e.target.value }
                            })}
                            placeholder="https://example.com"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </ScrollArea>
              <DialogFooter className="px-6 py-4">
                <Button variant="outline" onClick={() => setEditAccountDialogOpen(false)}>Cancel</Button>
                <Button onClick={updateAccount} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs >
    </div >
  )
}
