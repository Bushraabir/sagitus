// app/api/orders/route.ts

import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name, image_url, price))')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: session.user.id,
      total: body.total,
      status: 'pending',
      payment_method: body.payment_method || 'bkash',
      stripe_session_id: body.stripe_session_id ?? null,
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const orderItems = body.items.map((item: { id: string; quantity: number; price: number }) => ({
    order_id: order.id,
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price,
  }))

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Bushal Store <onboarding@resend.dev>',
          to: process.env.ADMIN_EMAIL,
          subject: `New ${order.payment_method.toUpperCase()} Order #${order.id.slice(0, 8).toUpperCase()}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="background: #ea580c; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Order Received! 🎉</h1>
              </div>
              <div style="padding: 24px;">
                <p style="font-size: 16px; color: #334155;">You have a new order from <strong>Bushal</strong>.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                  <tr><td style="padding: 8px 0; color: #64748b;">Order ID:</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">#${order.id.slice(0, 8).toUpperCase()}</td></tr>
                  <tr><td style="padding: 8px 0; color: #64748b;">Payment:</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${order.payment_method === 'cod' ? 'Cash on Delivery' : 'bKash'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #64748b;">Total:</td><td style="padding: 8px 0; color: #ea580c; font-weight: 700; font-size: 18px;">৳${order.total}</td></tr>
                </table>
                <div style="margin-top: 24px; text-align: center;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/orders" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Admin Panel</a>
                </div>
              </div>
            </div>
          `,
        }),
      })
    } catch (emailError) {
      console.error('Failed to send order email:', emailError)
    }
  }

  return NextResponse.json(order, { status: 201 })
}