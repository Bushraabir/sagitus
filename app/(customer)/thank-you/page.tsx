// app/(customer)/thank-you/page.tsx
import Link from 'next/link'
import Navbar from '@/app/components/layout/Navbar'
import { createServerClient } from '@/lib/supabase/server'

interface Props {
  searchParams: { orderId?: string }
}

export default async function ThankYouPage({ searchParams }: Props) {
  let order = null

  if (searchParams.orderId) {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('id', searchParams.orderId)
      .single()
    order = data
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h1 className="text-4xl font-bold text-gray-900 mb-4">Order Confirmed!</h1>
        <p className="text-lg text-gray-600 mb-4">
          Thank you for shopping with Bushal.
        </p>

        {order && (
          <div className="bg-white rounded-xl shadow p-6 mb-8 text-left space-y-2">
            <p className="text-sm text-gray-500">
              Order ID: <span className="font-mono text-gray-800">{order.id.slice(0, 8).toUpperCase()}</span>
            </p>
            {order.bkash_trx_id && (
              <p className="text-sm text-gray-500">
                bKash TxnID: <span className="font-mono text-gray-800">{order.bkash_trx_id}</span>
              </p>
            )}
            <p className="text-sm text-gray-500">
              Amount Paid: <span className="font-semibold text-gray-900">৳{order.total}</span>
            </p>
          </div>
        )}

        <p className="text-gray-500 mb-10">
          The admin has been notified and will process your order shortly.
        </p>

        <Link href="/dashboard"
          className="inline-block bg-orange-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-orange-600 transition text-lg">
          Continue Shopping
        </Link>
      </main>
    </div>
  )
}