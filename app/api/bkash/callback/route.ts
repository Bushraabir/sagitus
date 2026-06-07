// app/api/bkash/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { bkashExecutePayment, bkashQueryPayment } from '@/app/lib/bkash'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const paymentID = searchParams.get('paymentID')
  const status    = searchParams.get('status')
  const orderId   = searchParams.get('orderId')
  const origin    = new URL(request.url).origin

  if (status === 'cancel' || status === 'failure') {
    if (orderId) {
      const supabase = createServerClient()
      await supabase.from('order_items').delete().eq('order_id', orderId)
      await supabase.from('orders').delete().eq('id', orderId)
    }
    return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=${status}`)
  }

  if (!paymentID || !orderId) {
    return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=missing`)
  }

  const executeRes = await bkashExecutePayment(paymentID)

  if (executeRes.statusCode !== '0000' && executeRes.transactionStatus !== 'Completed') {
    const queryRes = await bkashQueryPayment(paymentID)
    if (queryRes.transactionStatus !== 'Completed') {
      const supabase = createServerClient()
      await supabase
        .from('orders')
        .update({ status: 'cancelled', bkash_payment_id: paymentID })
        .eq('id', orderId)
      return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=execute`)
    }
  }

  const supabase = createServerClient()

  const { data: order } = await supabase
    .from('orders')
    .update({
      status:           'fulfilled',
      delivery_status:  'order_placed',
      delivery_steps:   [{ status: 'order_placed', label: 'Order Placed', timestamp: new Date().toISOString() }],
      bkash_payment_id: paymentID,
      bkash_trx_id:     executeRes.trxID,
    })
    .eq('id', orderId)
    .select(`
      id,
      total,
      bkash_trx_id,
      user_id,
      order_items (
        quantity,
        unit_price,
        products ( name )
      )
    `)
    .single()

  // Send confirmation emails
  if (order) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .single()

    const customerEmail = profile?.email
    const customerName  = profile?.full_name ?? 'Customer'
    const orderId8      = order.id.slice(0, 8).toUpperCase()
    const total         = `৳${Number(order.total).toFixed(2)}`
    const adminEmail    = process.env.ADMIN_EMAIL!
    const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? origin

    const itemRows = (order.order_items ?? [])
      .map((i: any) => `
        <tr>
          <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; color:#334155; font-size:14px;">${i.products?.name ?? 'Product'}</td>
          <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; color:#334155; font-size:14px; text-align:center;">${i.quantity}</td>
          <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; color:#334155; font-size:14px; text-align:right;">৳${Number(i.unit_price * i.quantity).toFixed(2)}</td>
        </tr>`)
      .join('')

    const customerHtml = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:#f97316;padding:28px 32px;">
          <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Sagitus</h1>
          <p style="color:#fff7ed;margin:4px 0 0;font-size:13px;">Bangladesh's Premium Marketplace</p>
        </div>
        <div style="padding:32px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
            <div style="width:48px;height:48px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;">✅</div>
            <div>
              <h2 style="margin:0;color:#0f172a;font-size:20px;">Order Confirmed!</h2>
              <p style="margin:2px 0 0;color:#94a3b8;font-size:13px;">Order #${orderId8}</p>
            </div>
          </div>

          <p style="color:#475569;font-size:15px;line-height:1.6;">Hi <strong>${customerName}</strong>,<br>Thank you for shopping with Sagitus. Your payment was received and your order is being prepared.</p>

          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 0;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Item</th>
                <th style="padding:10px 0;text-align:center;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
                <th style="padding:10px 0;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:12px 0 0;font-weight:700;color:#0f172a;font-size:15px;">Total Paid</td>
                <td style="padding:12px 0 0;font-weight:800;color:#f97316;font-size:18px;text-align:right;">${total}</td>
              </tr>
            </tfoot>
          </table>

          ${order.bkash_trx_id ? `<p style="color:#94a3b8;font-size:13px;">bKash TxnID: <span style="font-family:monospace;color:#475569;">${order.bkash_trx_id}</span></p>` : ''}

          <a href="${siteUrl}/orders/${order.id}" style="display:inline-block;margin-top:8px;background:#f97316;color:#ffffff;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;">
            Track My Order →
          </a>

          <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #f1f5f9;padding-top:16px;">
            Questions? Reply to this email or contact us at support@sagitus.com
          </p>
        </div>
      </div>`

    const adminHtml = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#f97316;">🛒 New Order Received — #${orderId8}</h2>
        <p><strong>Customer:</strong> ${customerName} (${customerEmail ?? 'no email'})</p>
        <p><strong>Total:</strong> ${total}</p>
        ${order.bkash_trx_id ? `<p><strong>bKash TxnID:</strong> <code>${order.bkash_trx_id}</code></p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead><tr style="background:#f8fafc;"><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <a href="${siteUrl}/admin/orders" style="display:inline-block;background:#1e293b;color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;">View in Admin Panel →</a>
      </div>`

    try {
      const emailsToSend = []

      if (customerEmail) {
        emailsToSend.push(
          resend.emails.send({
            from:    'Sagitus <onboarding@resend.dev>',
            to:      customerEmail,
            subject: `✅ Order Confirmed — #${orderId8}`,
            html:    customerHtml,
          })
        )
      }

      emailsToSend.push(
        resend.emails.send({
          from:    'Sagitus <onboarding@resend.dev>',
          to:      adminEmail,
          subject: `🛒 New Order #${orderId8} — ${total}`,
          html:    adminHtml,
        })
      )

      await Promise.all(emailsToSend)
    } catch (emailErr) {
      console.error('Email send failed:', emailErr)
    }
  }

  return NextResponse.redirect(`${origin}/thank-you?orderId=${orderId}`)
}