// app/(admin)/admin/orders/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { formatDate } from '@/app/lib/utils/formatDate'
import Link from 'next/link'
import AdminOrdersClient from '@/app/components/admin/AdminOrderClient'

export default async function AdminOrdersPage() {
  const supabase = createServerClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      total,
      status,
      delivery_status,
      delivery_steps,
      bkash_trx_id,
      bkash_invoice,
      created_at,
      user_id,
      order_items (
        id,
        quantity,
        unit_price,
        products ( name, image_url, images )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) console.error('Orders error:', error)

  const userIds = Array.from(new Set((orders ?? []).map((o) => o.user_id)))
  let profilesMap: Record<string, { full_name: string | null; email: string | null; phone: string | null }> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds)

    profiles?.forEach((p) => {
      profilesMap[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone ?? null }
    })
  }

  const enrichedOrders = (orders ?? []).map((o) => ({
  ...o,
  order_items: (o.order_items ?? []) as any[],
  customer: profilesMap[o.user_id] ?? { full_name: null, email: null, phone: null },
})) as any[]

  return <AdminOrdersClient orders={enrichedOrders} />
}