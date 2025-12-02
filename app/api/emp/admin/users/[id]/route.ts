import { NextRequest, NextResponse } from 'next/server'
import { requireSuperOwner } from '@/lib/auth'
import { updateUser, hashPassword, findUserById } from '@/lib/db/users'
import { ObjectId } from 'mongodb'

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await requireSuperOwner()

        const { id } = params
        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
        }

        const body = await request.json()
        const { name, email, role, agencyId, accountId, password } = body

        // Validate email if provided
        if (email && !email.includes('@')) {
            return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
        }

        const updateData: any = {}
        if (name) updateData.name = name
        if (email) updateData.email = email.toLowerCase()
        if (role) updateData.role = role

        // Handle organization links
        if (agencyId !== undefined) {
            updateData.agencyId = agencyId ? new ObjectId(agencyId) : null
        }
        if (accountId !== undefined) {
            updateData.accountId = accountId ? new ObjectId(accountId) : null
        }

        // Handle password update
        if (password) {
            if (password.length < 6) {
                return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
            }
            updateData.passwordHash = await hashPassword(password)
        }

        const success = await updateUser(id, updateData)

        if (!success) {
            return NextResponse.json({ error: 'User not found or update failed' }, { status: 404 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update user error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update user' },
            { status: 500 }
        )
    }
}
