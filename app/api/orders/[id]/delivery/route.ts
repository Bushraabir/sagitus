// app/api/orders/[id]/delivery/route.ts
// Handles admin updates to order delivery status. 
// Uses an atomic PostgreSQL function (confirm_order_and_reduce_stock) to ensure 
// product stock is reduced exactly once when the admin confirms the order.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const DELIVERY_LABELS: Record<string, string> = {
  order_placed:     'Order Placed',
  confirmed:        'Confirmed',
  processing:       'Processing',
  shipped:          'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
}
const VALID_STATUSES = Object.keys(DELIVERY_LABELS)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const body = await request.json()
  const { delivery_status } = body

  if (!delivery_status || !VALID_STATUSES.includes(delivery_status)) {
    return NextResponse.json({ error: 'Invalid delivery_status' }, { status: 400 })
  }

  // Fetch existing order to get user_id for email notification
  const { data: existing } = await auth.supabase
    .from('orders')
    .select('id, user_id')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Call the atomic RPC to update status, append delivery step, and reduce stock (if not already done)
  const { data: rpcData, error: rpcError } = await auth.supabase.rpc('confirm_order_and_reduce_stock', {
    p_order_id: params.id,
    p_new_status: delivery_status,
  })

  if (rpcError) {
    console.error('RPC Error:', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  // Send email notification to customer via Resend (non-fatal)
  try {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const { data: customerProfile } = await auth.supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', existing.user_id)
        .single()

      if (customerProfile?.email) {
        const label = DELIVERY_LABELS[delivery_status]
        const orderId = params.id.slice(0, 8).toUpperCase()

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'Bushal <noreply@bushal.com>',
            to: [customerProfile.email],
            subject: `Order #${orderId} — Status Updated: ${label}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
                <h1 style="color:#f97316; font-size:24px; margin-bottom:8px;">Bushal</h1>
                <hr style="border:none; border-top:1px solid #e2e8f0; margin: 16px 0;" />
                <h2 style="color:#1e293b; font-size:18px;">Order Status Updated</h2>
                <p style="color:#475569;">Hi ${customerProfile.full_name ?? 'Customer'},</p>
                <p style="color:#475569;">Your order <strong>#${orderId}</strong> has been updated to:</p>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; margin:20px 0;">
                  <p style="font-size:20px; font-weight:bold; color:#1e293b; margin:0;">${label}</p>
                </div>
                <p style="color:#475569;">You can track your order status at any time in your <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bushal.com'}/orders" style="color:#f97316;">order history</a>.</p>
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

  return NextResponse.json({
    delivery_status,
    inventory_reduced_now: rpcData?.inventory_reduced_now ?? false,
  })
}