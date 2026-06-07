// app/(customer)/profile/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/app/components/layout/Navbar'
import Footer from '@/app/components/layout/Footer'
import ProfileClient from '@/app/components/profile/ProfileClient'
import { formatPrice } from '@/app/lib/utils/formatPrice'

export default async function ProfilePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: orders }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('orders')
      .select(`id, total, status, delivery_status, created_at, order_items(id, quantity, unit_price, products(name, image_url, images))`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (profile?.role === 'admin') redirect('/admin')

  const totalOrders     = (orders ?? []).length
  const totalSpent      = (orders ?? []).filter((o) => o.status === 'fulfilled').reduce((s, o) => s + Number(o.total), 0)
  const pendingOrders   = (orders ?? []).filter((o) => o.status === 'pending').length
  const deliveredOrders = (orders ?? []).filter((o) => o.delivery_status === 'delivered').length

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <ProfileClient
        profile={profile}
        orders={orders ?? []}
        stats={{ totalOrders, totalSpent, pendingOrders, deliveredOrders }}
      />
      <Footer />
    </div>
  )
}