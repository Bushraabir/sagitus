// app/api/orders/[id]/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const DELIVERY_LABELS: Record<string, string> = {
  order_placed:     'Order Placed',
  confirmed:        'Order Confirmed',
  processing:       'Processing Your Order',
  shipped:          'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  cancelled:        'Order Cancelled',
}
const VALID_STATUSES = Object.keys(DELIVERY_LABELS)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 🔒 AUDIT FIX: Use requireAdmin helper instead of manual session/role checks.
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const body = await request.json()
  const { delivery_status } = body

  if (!delivery_status || !VALID_STATUSES.includes(delivery_status)) {
    return NextResponse.json({ error: 'Invalid delivery_status' }, { status: 400 })
  }

  const { data: existing } = await auth.supabase
    .from('orders').select('id, delivery_steps, user_id').eq('id', params.id).single()
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const existingSteps: any[] = Array.isArray(existing.delivery_steps) ? existing.delivery_steps : []
  const newStep = { status: delivery_status, label: DELIVERY_LABELS[delivery_status], timestamp: new Date().toISOString() }
  const updatedSteps = [...existingSteps, newStep]

  const { data: updated, error } = await auth.supabase
    .from('orders')
    .update({
      delivery_status,
      delivery_steps: updatedSteps,
      status: delivery_status === 'delivered' ? 'fulfilled' : delivery_status === 'cancelled' ? 'cancelled' : 'pending',
    })
    .eq('id', params.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  //  Removed manual notification insert.
  // The DB trigger 'notify_on_order_status_change' automatically handles customer notifications.

  // Email notification (non-fatal)
  try {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const { data: customerProfile } = await auth.supabase
        .from('profiles').select('email, full_name').eq('id', existing.user_id).single()
      const customerEmail = customerProfile?.email
      const customerName  = customerProfile?.full_name ?? 'Customer'
      if (customerEmail) {
        const label = DELIVERY_LABELS[delivery_status]
        const orderId = params.id.slice(0, 8).toUpperCase()
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'Bushal <noreply@Bushal.com>',
            to: [customerEmail],
            subject: `Order #${orderId} — Status Updated: ${label}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
                <h1 style="color:#f97316; font-size:24px; margin-bottom:8px;">Bushal</h1>
                <hr style="border:none; border-top:1px solid #e2e8f0; margin: 16px 0;" />
                <h2 style="color:#1e293b; font-size:18px;">Order Status Updated</h2>
                <p style="color:#475569;">Hi ${customerName},</p>
                <p style="color:#475569;">Your order <strong>#${orderId}</strong> has been updated to:</p>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; margin:20px 0;">
                  <p style="font-size:20px; font-weight:bold; color:#1e293b; margin:0;">${label}</p>
                </div>
                <p style="color:#475569;">Track your order at <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://Bushal.com'}/orders" style="color:#f97316;">Bushal.com/orders</a>.</p>
                <p style="color:#94a3b8; font-size:13px; margin-top:32px;">— The Bushal Team</p>
              </div>
            `,
          }),
        })
      }
    }
  } catch (emailErr) {
    console.error('Email notification failed:', emailErr)
  }

  return NextResponse.json({ delivery_status: updated.delivery_status, delivery_steps: updated.delivery_steps })
}