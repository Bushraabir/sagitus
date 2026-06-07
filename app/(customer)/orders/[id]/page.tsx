// app/(customer)/orders/[id]/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Navbar from '@/app/components/layout/Navbar'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { formatDate } from '@/app/lib/utils/formatDate'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'

const ALL_STEPS = [
  { key: 'order_placed',     label: 'Order Placed',    icon: '📋', description: 'We received your order and payment' },
  { key: 'confirmed',        label: 'Confirmed',        icon: '✅', description: 'Order confirmed by our team' },
  { key: 'processing',       label: 'Processing',       icon: '⚙️', description: 'Being packed and prepared' },
  { key: 'shipped',          label: 'Shipped',          icon: '📦', description: 'On its way from our warehouse' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚', description: 'Your delivery rider is nearby' },
  { key: 'delivered',        label: 'Delivered',        icon: '🎉', description: 'Successfully delivered to you' },
]

interface Props {
  params: { id: string }
}

export default async function OrderTrackingPage({ params }: Props) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: order } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        quantity,
        unit_price,
        products ( name, image_url, images )
      )
    `)
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()

  if (!order) notFound()

  const deliveryStatus = order.delivery_status ?? 'order_placed'
  const isCancelled = deliveryStatus === 'cancelled'
  const currentStepIdx = ALL_STEPS.findIndex((s) => s.key === deliveryStatus)

  const deliverySteps: Array<{ status: string; timestamp: string; label: string }> =
    Array.isArray(order.delivery_steps) ? order.delivery_steps : []

  const getStepTimestamp = (key: string) => {
    const found = deliverySteps.find((s) => s.status === key)
    return found ? formatDate(found.timestamp) : null
  }

  const items = order.order_items ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-14">
        {/* Back link */}
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          My Orders
        </Link>

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs font-mono text-slate-400 mb-1">#{order.id.slice(0, 8).toUpperCase()}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Track Your Order</h1>
          <p className="text-slate-500 text-sm mt-1">Placed on {formatDate(order.created_at)}</p>
        </div>

        {/* Delivery Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 mb-5">
          <h2 className="text-base font-bold text-slate-900 mb-6">Delivery Status</h2>

          {isCancelled ? (
            <div className="flex items-center gap-4 p-4 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-3xl">❌</span>
              <div>
                <p className="font-bold text-rose-700">Order Cancelled</p>
                <p className="text-sm text-rose-500 mt-0.5">This order has been cancelled. Contact support if you need help.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {ALL_STEPS.map((step, i) => {
                const isDone = i <= currentStepIdx
                const isCurrent = step.key === deliveryStatus
                const isLast = i === ALL_STEPS.length - 1
                const timestamp = getStepTimestamp(step.key)

                return (
                  <div key={step.key} className="flex gap-4">
                    {/* Connector column */}
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 border-2 transition-all duration-500',
                        isCurrent  ? 'border-orange-500 bg-orange-500 shadow-lg shadow-orange-500/30 scale-110' :
                        isDone     ? 'border-emerald-400 bg-emerald-400' :
                                     'border-slate-200 bg-white'
                      )}>
                        {isDone ? (
                          isCurrent ? (
                            <span>{step.icon}</span>
                          ) : (
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )
                        ) : (
                          <span className="text-slate-300 text-xs font-bold">{i + 1}</span>
                        )}
                      </div>
                      {!isLast && (
                        <div className={cn(
                          'w-0.5 flex-1 min-h-[28px] my-1 rounded-full transition-all duration-500',
                          isDone && !isCurrent ? 'bg-emerald-400' :
                          isCurrent           ? 'bg-gradient-to-b from-orange-400 to-slate-200' :
                                                'bg-slate-200'
                        )} />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn('pb-6 flex-1', isLast && 'pb-0')}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={cn(
                            'font-semibold text-sm transition-colors',
                            isCurrent ? 'text-orange-600' :
                            isDone    ? 'text-emerald-700' :
                                        'text-slate-400'
                          )}>
                            {step.label}
                            {isCurrent && (
                              <span className="ml-2 text-[10px] font-bold text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded-full">
                                CURRENT
                              </span>
                            )}
                          </p>
                          <p className={cn(
                            'text-xs mt-0.5',
                            isDone ? 'text-slate-500' : 'text-slate-300'
                          )}>
                            {step.description}
                          </p>
                        </div>
                        {timestamp && (
                          <p className="text-[11px] text-slate-400 flex-shrink-0 mt-0.5">{timestamp}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Order items */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 mb-5">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Items ({items.length})
          </h2>
          <div className="space-y-3">
            {items.map((item: any) => {
              const img = (Array.isArray(item.products?.images) && item.products.images[0]) || item.products?.image_url
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0">
                    {img ? (
                      <img src={img} alt={item.products?.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">📦</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.products?.name ?? 'Product'}</p>
                    <p className="text-xs text-slate-400">Qty: {item.quantity} × {formatPrice(item.unit_price)}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 flex-shrink-0">
                    {formatPrice(item.quantity * item.unit_price)}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Total Paid</p>
            <p className="text-lg font-extrabold text-slate-900">{formatPrice(order.total)}</p>
          </div>

          {order.bkash_trx_id && (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-400">bKash TxnID</p>
              <p className="text-xs font-mono font-semibold text-slate-700">{order.bkash_trx_id}</p>
            </div>
          )}
        </div>

        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-orange-600 text-white font-semibold text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20"
        >
          Continue Shopping
        </Link>
      </main>
    </div>
  )
}