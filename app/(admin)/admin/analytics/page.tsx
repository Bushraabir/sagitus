// app/(admin)/admin/analytics/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import AdminAnalyticsClient from '@/app/components/admin/AdminAnalyticsClient'

export default async function AdminAnalyticsPage() {
  const supabase = createServerClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

  const [
    { data: products },
    { data: orders },
    { data: orderItems },
    { data: expenses },
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, price, cost_price, delivery_charge, stock_quantity, in_stock, category, images, image_url, created_at'),
    supabase
      .from('orders')
      .select('id, total, status, delivery_status, created_at, user_id')
      .order('created_at', { ascending: false }),
    supabase
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit_price'),
    supabase
      .from('product_expenses')
      .select('id, product_id, label, amount, created_at'),
  ])

  const allProducts   = products ?? []
  const allOrders     = orders ?? []
  const allItems      = orderItems ?? []
  const allExpenses   = expenses ?? []

  const fulfilledOrders = allOrders.filter((o) => o.status === 'fulfilled')
  const totalRevenue    = fulfilledOrders.reduce((s, o) => s + Number(o.total), 0)

  const productCostMap: Record<string, number> = {}
  const productDeliveryMap: Record<string, number> = {}
  allProducts.forEach((p) => {
    productCostMap[p.id]     = Number(p.cost_price ?? 0)
    productDeliveryMap[p.id] = Number(p.delivery_charge ?? 0)
  })

  const fulfilledOrderIds = new Set(fulfilledOrders.map((o) => o.id))
  const fulfilledItems    = allItems.filter((i) => fulfilledOrderIds.has(i.order_id))

  const totalCOGS = fulfilledItems.reduce((s, item) => {
    const cost = productCostMap[item.product_id] ?? 0
    return s + cost * item.quantity
  }, 0)

  const totalDeliveryCharges = fulfilledItems.reduce((s, item) => {
    const dc = productDeliveryMap[item.product_id] ?? 0
    return s + dc * item.quantity
  }, 0)

  const totalExtraCosts = allExpenses.reduce((s, e) => s + Number(e.amount), 0)

  const totalProfit = totalRevenue - totalCOGS - totalDeliveryCharges - totalExtraCosts

  const productsAdded30d = allProducts.filter((p) => p.created_at >= thirtyDaysAgoISO).length

  const recentOrders30d   = allOrders.filter((o) => o.created_at >= thirtyDaysAgoISO)
  const recentFulfilled   = recentOrders30d.filter((o) => o.status === 'fulfilled')
  const recentRevenue30d  = recentFulfilled.reduce((s, o) => s + Number(o.total), 0)
  const recentOrderIds    = new Set(recentFulfilled.map((o) => o.id))
  const recentItems       = allItems.filter((i) => recentOrderIds.has(i.order_id))
  const recentCOGS        = recentItems.reduce((s, i) => s + (productCostMap[i.product_id] ?? 0) * i.quantity, 0)
  const recentDelivery    = recentItems.reduce((s, i) => s + (productDeliveryMap[i.product_id] ?? 0) * i.quantity, 0)
  const recentProfit30d   = recentRevenue30d - recentCOGS - recentDelivery

  // Build monthly profit for chart (last 6 months)
  const monthlyData: { label: string; revenue: number; cost: number; profit: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-BD', { month: 'short', year: '2-digit' })
    const mOrders    = allOrders.filter((o) => o.created_at.startsWith(key) && o.status === 'fulfilled')
    const mRevenue   = mOrders.reduce((s, o) => s + Number(o.total), 0)
    const mOrderIds  = new Set(mOrders.map((o) => o.id))
    const mItems     = allItems.filter((i) => mOrderIds.has(i.order_id))
    const mCOGS      = mItems.reduce((s, i) => s + (productCostMap[i.product_id] ?? 0) * i.quantity, 0)
    const mDelivery  = mItems.reduce((s, i) => s + (productDeliveryMap[i.product_id] ?? 0) * i.quantity, 0)
    monthlyData.push({ label, revenue: mRevenue, cost: mCOGS + mDelivery, profit: mRevenue - mCOGS - mDelivery })
  }

  const totalInventoryValue = allProducts.reduce((s, p) => s + p.price * (p.stock_quantity ?? 0), 0)

  return (
    <AdminAnalyticsClient
      summary={{
        totalRevenue,
        totalCOGS,
        totalDeliveryCharges,
        totalExtraCosts,
        totalProfit,
        productsAdded30d,
        soldIn30d: recentItems.reduce((s, i) => s + i.quantity, 0),
        recentProfit30d,
        totalInventoryValue,
        fulfilledOrdersCount: fulfilledOrders.length,
      }}
      monthlyData={monthlyData}
      products={allProducts}
      expenses={allExpenses}
    />
  )
}