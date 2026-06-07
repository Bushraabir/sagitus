// app/api/expenses/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { label, amount, product_id } = body

  if (!label?.trim() || amount == null || isNaN(Number(amount))) {
    return NextResponse.json({ error: 'label and amount are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('product_expenses')
    .insert({ label: label.trim(), amount: Number(amount), product_id: product_id ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}