// app/api/expenses/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  // Use requireAdmin helper instead of manual session/role checks.
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const body = await request.json()
  const { label, amount, product_id } = body

  if (!label?.trim() || amount == null || isNaN(Number(amount))) {
    return NextResponse.json({ error: 'label and amount are required' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('product_expenses')
    .insert({ label: label.trim(), amount: Number(amount), product_id: product_id ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}