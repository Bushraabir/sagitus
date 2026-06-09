// app/api/bkash/callback/route.ts
// Notifies admins of new confirmed orders via in-app notification
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { bkashExecutePayment } from '@/app/lib/bkash'
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

  if (!paymentID || !orderId) return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=missing`)

  const supabase = createServerClient()
  
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('status, user_id, total, bkash_invoice')
    .eq('id', orderId)
    .single()

  if (existingOrder?.status === 'fulfilled') return NextResponse.redirect(`${origin}/thank-you?orderId=${orderId}`)
  if (existingOrder?.status === 'cancelled')  return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=cancelled`)

  const executeRes = await bkashExecutePayment(paymentID)

  if (!executeRes || executeRes.statusCode !== '0000' || executeRes.transactionStatus !== 'Completed') {
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    return NextResponse.redirect(`${origin}/cart?bkash=failed&reason=execute_failed`)
  }

  // Idempotency check to prevent double-fulfillment on bKash retries
  const { data: alreadyFulfilled } = await supabase
    .from('orders')
    .select('id')
    .eq('bkash_invoice', existingOrder?.bkash_invoice)
    .eq('status', 'fulfilled')
    .maybeSingle()

  if (alreadyFulfilled) {
    return NextResponse.redirect(`${origin}/thank-you?orderId=${orderId}`)
  }

  await supabase.from('orders')
    .update({ 
      status: 'fulfilled', 
      delivery_status: 'confirmed', 
      bkash_payment_id: paymentID, 
      bkash_trx_id: executeRes.trxID 
    })
    .eq('id', orderId)


  // KEEP THE EMAIL LOGIC (Triggers don't send emails)
  if (existingOrder?.user_id) {
    const { data: profile } = await supabase
      .from('profiles').select('full_name, email').eq('id', existingOrder.user_id).single()
    
    const customerName = profile?.full_name ?? 'A customer'

    try {
      if (process.env.RESEND_API_KEY && profile?.email) {
        await resend.emails.send({
          from: 'Bushal <noreply@Bushal.com>',
          to: [profile.email],
          subject: `Order Confirmed — #${orderId.slice(0, 8).toUpperCase()}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
              <h1 style="color:#ea580c;">Order Confirmed ✓</h1>
              <p>Hi ${customerName},</p>
              <p>Your bKash payment was successful. Order <strong>#${orderId.slice(0, 8).toUpperCase()}</strong> is being processed.</p>
              <p style="color:#64748b;font-size:13px;">— The Bushal Team</p>
            </div>
          `,
        })
      }
    } catch (emailErr) {
      console.error('Email failed:', emailErr)
    }
  }

  return NextResponse.redirect(`${origin}/thank-you?orderId=${orderId}`)
}