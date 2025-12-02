import { NextRequest, NextResponse } from 'next/server'
import { requireSuperOwner } from '@/lib/auth'
import { updateAccount } from '@/lib/db/users'
import { ObjectId } from 'mongodb'

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await requireSuperOwner()

        const { id } = params
        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 })
        }

        const body = await request.json()
        const {
            name,
            agencyId,
            contactEmail,
            returnUrls,
            dynamicDescriptor,
            fallbackDescription
        } = body

        if (!name && !agencyId && !contactEmail && !returnUrls && !dynamicDescriptor && !fallbackDescription) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        const updateData: any = {}
        if (name) updateData.name = name
        if (agencyId) updateData.agencyId = new ObjectId(agencyId)
        if (contactEmail !== undefined) updateData.contactEmail = contactEmail
        if (returnUrls !== undefined) updateData.returnUrls = returnUrls
        if (dynamicDescriptor !== undefined) updateData.dynamicDescriptor = dynamicDescriptor
        if (fallbackDescription !== undefined) updateData.fallbackDescription = fallbackDescription

        const success = await updateAccount(id, updateData)

        if (!success) {
            return NextResponse.json({ error: 'Account not found or update failed' }, { status: 404 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update account error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update account' },
            { status: 500 }
        )
    }
}
