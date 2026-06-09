// app/api/categories/[id]/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  //  AUDIT FIX: Use requireAdmin helper instead of manual session/role checks.
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const { error } = await auth.supabase
    .from('categories')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}