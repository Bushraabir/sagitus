// app/(customer)/thank-you/page.tsx
import { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/app/components/layout/Navbar'
import BottomNav from '@/app/components/layout/BottomNav'
import PageWrapper from '@/app/components/layout/PageWrapper'
import { createServerClient } from '@/lib/supabase/server'
import { formatPrice } from '@/app/lib/utils/formatPrice'

interface Props {
  searchParams: { orderId?: string }
}

export const metadata: Metadata = {
  title: 'Order Confirmed',
  description: 'Your order has been successfully placed. Track your delivery status on Bushal.',
  robots: { index: false, follow: false },
}

export default async function ThankYouPage({ searchParams }: Props) {
  let order = null
  let customerName = 'Valued Customer'

  if (searchParams.orderId) {
    const supabase = await createServerClient()
    // Fetch the order
    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('id', searchParams.orderId)
      .single()
    
    order = orderData

    // Fetch the customer's profile using the user_id from the order
    if (orderData?.user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', orderData.user_id)
        .single()
      
      if (profileData?.full_name) {
        // Use first name only for a more personal touch
        customerName = profileData.full_name.split(' ')[0]
      }
    }
  }

  return (
    <div className="min-h-screen bg-bushal-ivory">
      <Navbar />
      <PageWrapper maxWidth="2xl" withBottomNav={false} className="py-16 md:py-24 text-center">
        {/* Large Taka Sign Decorative Element */}
        <div className="relative mb-8 animate-fade-up">
          <p className="font-heading italic text-[10rem] md:text-[14rem] text-bushal-copper/10 leading-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
            ৳
          </p>
          <div className="relative z-10 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-bushal-forest/5 border border-bushal-copper/20 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-10 h-10 text-bushal-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Elegant Typography Confirmation */}
        <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h1 className="font-heading text-4xl md:text-5xl text-bushal-forest mt-4 tracking-tight">
            Thank you, <span className="italic text-bushal-copper">{customerName}</span>.
          </h1>
          <p className="font-heading italic text-bushal-inkSoft text-xl md:text-2xl mt-3">
            Your order is on its way.
          </p>
        </div>

        {/* Order Details Card */}
        {order && (
          <div className="bg-bushal-surface rounded-2xl border border-bushal-border shadow-card p-6 md:p-8 mt-12 text-left space-y-4 animate-fade-up max-w-md mx-auto" style={{ animationDelay: '200ms' }}>
            <div className="flex justify-between items-center pb-4 border-b border-bushal-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-bushal-inkSoft">Order ID</span>
              <span className="font-mono font-bold text-bushal-forest text-sm">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            {order.bkash_trx_id && (
              <div className="flex justify-between items-center pb-4 border-b border-bushal-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-bushal-inkSoft">Transaction</span>
                <span className="font-mono text-xs text-bushal-inkMid">{order.bkash_trx_id}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-bushal-inkSoft">Total Paid</span>
              <span className="font-heading text-2xl font-bold text-bushal-copper">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        )}

        <p className="text-bushal-inkSoft/80 mb-10 mt-8 text-sm md:text-base animate-fade-up" style={{ animationDelay: '300ms' }}>
          We've sent a confirmation email with all the details. <br className="hidden md:block" />
          You can track its status anytime in your dashboard.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '400ms' }}>
          <Link
            href="/dashboard"
            className="group relative inline-flex items-center gap-2 bg-bushal-forest text-bushal-ivory text-sm font-semibold font-body px-8 py-3.5 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-bushal-forest/30 hover:-translate-y-0.5 active:scale-95"
          >
            <span className="relative z-10">Continue Shopping</span>
            <div className="absolute inset-0 bg-gradient-to-r from-bushal-forestMid to-bushal-forest opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 text-bushal-inkMid hover:text-bushal-forest text-sm font-medium font-body px-6 py-3.5 rounded-xl border border-bushal-border hover:border-bushal-forest/30 hover:bg-bushal-surface transition-all duration-300"
          >
            <span>View All Orders</span>
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </PageWrapper>
      <BottomNav />
    </div>
  )
}