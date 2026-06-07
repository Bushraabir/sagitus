// app/(customer)/orders/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/app/components/layout/Navbar'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { formatDate } from '@/app/lib/utils/formatDate'
import { cn } from '@/app/lib/utils/cn'

const STATUS_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  order_placed: { label: 'Order Placed', icon: '📋', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmed: { label: 'Confirmed', icon: '✅', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  processing: { label: 'Processing', icon: '⚙️', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  shipped: { label: 'Shipped', icon: '📦', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  out_for_delivery: { label: 'Out for Delivery', icon: '🚚', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  delivered: { label: 'Delivered', icon: '🎉', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', icon: '❌', color: 'bg-rose-50 text-rose-600 border-rose-200' },
  pending: { label: 'Pending', icon: '⏳', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  fulfilled: { label: 'Delivered', icon: '🎉', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export default async function CustomerOrdersPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(id, quantity, unit_price, products(name, image_url, images))')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">My Orders</h1>
        <p className="text-slate-500 text-sm mb-8">{(orders ?? []).length} orders placed</p>

        {(!orders || orders.length === 0) ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <p className="text-3xl mb-3">🛍️</p>
            <p className="font-semibold text-slate-700 mb-1">No orders yet</p>
            <p className="text-sm text-slate-400 mb-6">Start shopping and your orders will appear here.</p>
            <Link href="/dashboard" className="inline-block bg-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-700 transition-all">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const ds = order.delivery_status ?? order.status
              const display = STATUS_DISPLAY[ds] ?? { label: ds, icon: '📦', color: 'bg-slate-100 text-slate-700' }
              const items = order.order_items ?? []
              const firstProduct = items[0]?.products

              return (
                <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', display.color)}>
                      {display.icon} {display.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    {firstProduct && (
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100">
                        {((Array.isArray(firstProduct.images) && firstProduct.images[0]) || firstProduct.image_url) ? (
                          <img
                            src={(Array.isArray(firstProduct.images) && firstProduct.images[0]) || firstProduct.image_url!}
                            alt={firstProduct.name}
                            className="w-full h-full object-cover"
                          />
                        ) : <div className="w-full h-full bg-slate-100" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        {firstProduct?.name ?? 'Product'}
                        {items.length > 1 && <span className="text-slate-400"> +{items.length - 1} more</span>}
                      </p>
                      <p className="text-sm font-bold text-slate-900">{formatPrice(order.total)}</p>
                    </div>
                  </div>

                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-orange-50 text-orange-600 text-sm font-semibold hover:bg-orange-100 transition-colors"
                  >
                    Track Order
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}