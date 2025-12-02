import { NextRequest, NextResponse } from 'next/server'
import { requireSuperOwner } from '@/lib/auth'
import { updateAgency } from '@/lib/db/users'
import { ObjectId } from 'mongodb'

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        await requireSuperOwner()

        const { id } = params
        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid agency ID' }, { status: 400 })
        }

        const body = await request.json()
        const { name } = body

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        const success = await updateAgency(id, { name })

        if (!success) {
            return NextResponse.json({ error: 'Agency not found or update failed' }, { status: 404 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update agency error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update agency' },
            { status: 500 }
        )
    }
}
