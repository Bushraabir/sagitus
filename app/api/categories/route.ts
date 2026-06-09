// app/api/categories/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  // Use requireAdmin helper instead of manual session/role checks.
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const body = await request.json()
  const { name, slug, description } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data: category, error } = await auth.supabase
    .from('categories')
    .insert({
      name: name.trim(),
      slug: slug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: description ?? null
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category }, { status: 201 })
}