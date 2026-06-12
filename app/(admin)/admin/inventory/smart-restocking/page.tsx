/**
 * ============================================================================
 * SMART INVENTORY RESTOCKING - ADMIN PAGE
 * ============================================================================
 * 
 * This page provides the admin with AI-powered inventory restocking 
 * recommendations using advanced statistical algorithms:
 * 
 * 1. Reorder Point (ROP) = Lead Time Demand + Safety Stock
 * 2. Safety Stock = Z-score × σ_d × √(Lead Time)
 * 3. Economic Order Quantity (EOQ) = ((2 × D × S) / H)
 * 4. Lead Time Demand = Avg Daily Sales × Lead Time
 * 
 * FEATURES:
 * - Real-time stock-out risk analysis
 * - Urgency classification (Critical/High/Medium/Low)
 * - Financial impact projections
 * - Supplier lead time integration
 * - Service level configuration
 * - One-click restock actions
 * 
 * ALGORITHM: Statistical Inventory Management with Z-score modeling
 * ============================================================================
 */

import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'
import {
  generateRestockRecommendations,
  calculateTotalRestockInvestment,
  calculateStockoutRiskCost,
  type ProductSalesData,
  type SupplierConfig,
  type RestockConfig,
  type RestockRecommendation,
} from '@/lib/inventory/smartRestocking'

export const metadata: Metadata = {
  title: 'Smart Restocking',
  description: 'AI-powered inventory restocking predictions using statistical demand modeling.',
}

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_RESTOCK_CONFIG: RestockConfig = {
  service_level: 0.95,        // 95% service level (Z = 1.645)
  review_period_days: 7,      // Weekly inventory reviews
  annual_holding_cost_pct: 0.25, // 25% of unit cost per year
  fixed_order_cost: 150,      // ৳150 average shipping/processing per order
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function getUrgencyConfig(urgency: string) {
  const configs = {
    critical: {
      color: 'text-bushal-danger',
      bg: 'bg-bushal-dangerBg',
      border: 'border-bushal-danger/20',
      dot: 'bg-bushal-danger',
      icon: '🔴',
      label: 'CRITICAL',
      description: 'Will stock out before new order arrives',
    },
    high: {
      color: 'text-bushal-warning',
      bg: 'bg-bushal-warningBg',
      border: 'border-bushal-warning/20',
      dot: 'bg-bushal-warning',
      icon: '',
      label: 'HIGH',
      description: 'Stock out within lead time + 7 days',
    },
    medium: {
      color: 'text-bushal-copper',
      bg: 'bg-bushal-copper/10',
      border: 'border-bushal-copper/20',
      dot: 'bg-bushal-copper',
      icon: '',
      label: 'MEDIUM',
      description: 'Stock out within lead time + 14 days',
    },
    low: {
      color: 'text-bushal-forest',
      bg: 'bg-bushal-forest/10',
      border: 'border-bushal-forest/20',
      dot: 'bg-bushal-forest',
      icon: '🟢',
      label: 'LOW',
      description: 'Healthy but approaching review threshold',
    },
    none: {
      color: 'text-bushal-inkSoft',
      bg: 'bg-bushal-ivoryDeep',
      border: 'border-bushal-border',
      dot: 'bg-bushal-inkSoft',
      icon: '⚪',
      label: 'NONE',
      description: 'No action required',
    },
  }
  return configs[urgency as keyof typeof configs] ?? configs.none
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default async function SmartRestockingPage() {
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const supabase = await auth.supabase

  // 1. Fetch all active products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category, price, stock_quantity, in_stock, images, image_url, cost_price, created_at')
    .is('is_deleted', false)
    .order('stock_quantity', { ascending: true })

  if (productsError) {
    console.error('[Smart Restocking] Error fetching products:', productsError)
  }

  // 2. Fetch historical order items (last 90 days for sales velocity)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('product_id, quantity, created_at, orders!inner(status, created_at)')
    .eq('orders.status', 'fulfilled')
    .gte('orders.created_at', ninetyDaysAgo.toISOString())

  if (itemsError) {
    console.error('[Smart Restocking] Error fetching order items:', itemsError)
  }

  // 3. Build sales history per product
  const productSalesMap = new Map<string, Array<{ date: string; quantity_sold: number }>>()

  ;(orderItems ?? []).forEach((item: any) => {
    const productId = item.product_id
    const date = item.orders.created_at.split('T')[0]
    const quantity = item.quantity

    if (!productSalesMap.has(productId)) {
      productSalesMap.set(productId, [])
    }
    productSalesMap.get(productId)!.push({ date, quantity_sold: quantity })
  })

  // 4. Build ProductSalesData array
  const productSalesData: ProductSalesData[] = (products ?? []).map((product: any) => ({
    product_id: product.id,
    product_name: product.name,
    current_stock: product.stock_quantity ?? 0,
    unit_cost: product.cost_price ?? product.price * 0.6, // Estimate if no cost_price
    daily_sales_history: productSalesMap.get(product.id) ?? [],
  }))

  // 5. Build SupplierConfig map (using default lead times by category)
  const suppliers = new Map<string, SupplierConfig>()
  const categoryLeadTimes: Record<string, number> = {
    'Accessories': 10,
    'Clothing': 14,
    'Electronics': 21,
    'Home': 18,
    'Beauty': 12,
    'General': 14,
  }

  productSalesData.forEach((product) => {
    const category = (products ?? []).find((p: any) => p.id === product.product_id)?.category ?? 'General'
    suppliers.set(product.product_id, {
      product_id: product.product_id,
      lead_time_days: categoryLeadTimes[category] ?? 14,
      order_cost: DEFAULT_RESTOCK_CONFIG.fixed_order_cost,
      min_order_quantity: 10,
    })
  })

  // 6. Generate Restock Recommendations
  const recommendations = generateRestockRecommendations(
    productSalesData,
    suppliers,
    DEFAULT_RESTOCK_CONFIG
  )

  // 7. Calculate Financial Summaries
  const investmentSummary = calculateTotalRestockInvestment(recommendations)
  
  // Estimate average selling price for stockout risk calculation
  const avgSellingPrice = (products ?? []).length > 0
    ? (products ?? []).reduce((sum: number, p: any) => sum + p.price, 0) / (products ?? []).length
    : 0
  
  const potentialLostRevenue = calculateStockoutRiskCost(recommendations, avgSellingPrice)

  // 8. Filter and categorize recommendations
  const criticalItems = recommendations.filter((r) => r.urgency === 'critical')
  const highItems = recommendations.filter((r) => r.urgency === 'high')
  const mediumItems = recommendations.filter((r) => r.urgency === 'medium')
  const lowItems = recommendations.filter((r) => r.urgency === 'low')
  const healthyItems = recommendations.filter((r) => r.urgency === 'none')

  // 9. Build product image map
  const productImageMap = new Map<string, string | null>()
  ;(products ?? []).forEach((p: any) => {
    const img = (Array.isArray(p.images) && p.images[0]) || p.image_url || null
    productImageMap.set(p.id, img)
  })

  const productCategoryMap = new Map<string, string>()
  ;(products ?? []).forEach((p: any) => {
    productCategoryMap.set(p.id, p.category ?? 'General')
  })

  // ─── Render UI ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bushal-success animate-pulse" />
            <span className="text-[10px] font-bold text-bushal-success uppercase tracking-widest">
              Live · AI-Powered
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-bushal-forest tracking-tight font-heading">
            Smart Inventory Restocking
          </h1>
          <p className="text-sm text-bushal-inkSoft mt-1">
            Statistical demand modeling · 95% service level · {DEFAULT_RESTOCK_CONFIG.review_period_days}-day review cycle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Products
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Critical Items
          </p>
          <p className="text-2xl font-extrabold text-bushal-danger tabular-nums font-heading">
            {criticalItems.length}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Immediate action required</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            High Priority
          </p>
          <p className="text-2xl font-extrabold text-bushal-warning tabular-nums font-heading">
            {highItems.length}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Restock within 7 days</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Restock Investment
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {formatPrice(investmentSummary.total_cost)}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">{investmentSummary.total_units} units total</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Potential Lost Revenue
          </p>
          <p className="text-2xl font-extrabold text-bushal-copper tabular-nums font-heading">
            {formatPrice(potentialLostRevenue)}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">If critical items stock out</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Healthy Stock
          </p>
          <p className="text-2xl font-extrabold text-bushal-success tabular-nums font-heading">
            {healthyItems.length}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">No action needed</p>
        </div>
      </div>

      {/* Algorithm Info Banner */}
      <div className="bg-gradient-to-br from-bushal-forest to-bushal-forestMid rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-bushal-copperGlow mb-2">
              About This Analysis
            </h3>
            <p className="text-xs text-white/80 leading-relaxed mb-3">
              This system uses <strong className="text-white">statistical inventory management</strong> algorithms to predict 
              when products will run out of stock. It calculates the <strong className="text-white">Reorder Point (ROP)</strong> using 
              lead time demand and safety stock, and recommends the <strong className="text-white">Economic Order Quantity (EOQ)</strong> 
              to minimize total inventory costs.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Service Level</p>
                <p className="text-white/60">{(DEFAULT_RESTOCK_CONFIG.service_level * 100).toFixed(0)}% (Z=1.645)</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Review Period</p>
                <p className="text-white/60">{DEFAULT_RESTOCK_CONFIG.review_period_days} days</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Holding Cost</p>
                <p className="text-white/60">{(DEFAULT_RESTOCK_CONFIG.annual_holding_cost_pct * 100).toFixed(0)}% / year</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Order Cost</p>
                <p className="text-white/60">{formatPrice(DEFAULT_RESTOCK_CONFIG.fixed_order_cost)} / order</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Critical & High Priority Items */}
      {(criticalItems.length > 0 || highItems.length > 0) && (
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-bushal-border bg-bushal-dangerBg/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bushal-danger/10 text-bushal-danger flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-bushal-forest">
                  Urgent Restock Required
                </h2>
                <p className="text-xs text-bushal-inkSoft">
                  {criticalItems.length + highItems.length} products need immediate attention
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bushal-ivoryDeep border-b border-bushal-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Product
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Current Stock
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Reorder Point
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Safety Stock
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Days Left
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Urgency
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Restock Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Est. Cost
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bushal-ivory">
                {[...criticalItems, ...highItems].map((rec) => {
                  const urgency = getUrgencyConfig(rec.urgency)
                  const image = productImageMap.get(rec.product_id)
                  const category = productCategoryMap.get(rec.product_id) ?? 'General'
                  const isCritical = rec.urgency === 'critical'

                  return (
                    <tr
                      key={rec.product_id}
                      className={cn(
                        'hover:bg-bushal-ivoryDeep/50 transition-colors',
                        isCritical && 'bg-bushal-dangerBg/20'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-bushal-ivoryDeep border border-bushal-border flex-shrink-0">
                            {image ? (
                              <img src={image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-bushal-borderMid text-xs">
                                📦
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-bushal-ink truncate max-w-[200px]">
                              {rec.product_name}
                            </p>
                            <p className="text-xs text-bushal-inkSoft">{category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'text-sm font-bold tabular-nums',
                          rec.current_stock === 0 ? 'text-bushal-danger' : 'text-bushal-forest'
                        )}>
                          {rec.current_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-bushal-ink tabular-nums">
                          {rec.reorder_point}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-bushal-inkSoft tabular-nums">
                          {rec.safety_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'text-xs font-bold tabular-nums px-2 py-1 rounded-full',
                          rec.days_until_stockout < 7
                            ? 'bg-bushal-dangerBg text-bushal-danger'
                            : rec.days_until_stockout < 14
                            ? 'bg-bushal-warningBg text-bushal-warning'
                            : 'bg-bushal-ivoryDeep text-bushal-inkSoft'
                        )}>
                          {rec.days_until_stockout === 999 ? '∞' : `${rec.days_until_stockout}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border',
                          urgency.bg, urgency.color, urgency.border
                        )}>
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'currentColor' }} />
                          {urgency.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-bushal-forest tabular-nums">
                          {rec.recommended_order_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-bushal-copper tabular-nums">
                          {formatPrice(rec.estimated_cost)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/products/${rec.product_id}/edit`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
                        >
                          Restock →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Medium & Low Priority Items */}
      {(mediumItems.length > 0 || lowItems.length > 0) && (
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-bushal-border bg-bushal-ivoryDeep/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bushal-copper/10 text-bushal-copper flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-bushal-forest">
                  Planned Restocking
                </h2>
                <p className="text-xs text-bushal-inkSoft">
                  {mediumItems.length + lowItems.length} products can wait for next review cycle
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bushal-ivoryDeep/50 border-b border-bushal-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Product
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Current Stock
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Reorder Point
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    EOQ
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Days Left
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Urgency
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Restock Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Est. Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bushal-ivory">
                {[...mediumItems, ...lowItems].map((rec) => {
                  const urgency = getUrgencyConfig(rec.urgency)
                  const image = productImageMap.get(rec.product_id)
                  const category = productCategoryMap.get(rec.product_id) ?? 'General'

                  return (
                    <tr key={rec.product_id} className="hover:bg-bushal-ivoryDeep/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-bushal-ivoryDeep border border-bushal-border flex-shrink-0">
                            {image ? (
                              <img src={image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-bushal-borderMid text-xs">
                                📦
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-bushal-ink truncate max-w-[200px]">
                              {rec.product_name}
                            </p>
                            <p className="text-xs text-bushal-inkSoft">{category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-bushal-forest tabular-nums">
                          {rec.current_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-bushal-ink tabular-nums">
                          {rec.reorder_point}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-bushal-inkSoft tabular-nums">
                          {rec.eoq}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold text-bushal-inkSoft tabular-nums">
                          {rec.days_until_stockout === 999 ? '∞' : `${rec.days_until_stockout}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border',
                          urgency.bg, urgency.color, urgency.border
                        )}>
                          {urgency.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-bushal-forest tabular-nums">
                          {rec.recommended_order_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-bushal-copper tabular-nums">
                          {formatPrice(rec.estimated_cost)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Healthy Stock Summary */}
      {healthyItems.length > 0 && (
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-bushal-success/10 text-bushal-success flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-bushal-forest">
                Healthy Inventory
              </h2>
              <p className="text-xs text-bushal-inkSoft">
                {healthyItems.length} products are well-stocked
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {healthyItems.slice(0, 12).map((rec) => {
              const image = productImageMap.get(rec.product_id)
              return (
                <div key={rec.product_id} className="bg-bushal-successBg/30 rounded-xl p-3 border border-bushal-success/10">
                  <div className="flex items-center gap-2 mb-2">
                    {image && (
                      <img src={image} alt="" className="w-6 h-6 rounded object-cover" />
                    )}
                    <p className="text-xs font-semibold text-bushal-ink truncate">
                      {rec.product_name}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-bushal-success tabular-nums">
                    {rec.current_stock} units
                  </p>
                  <p className="text-[10px] text-bushal-inkSoft">
                    {rec.days_until_stockout}d supply
                  </p>
                </div>
              )
            })}
            {healthyItems.length > 12 && (
              <div className="bg-bushal-ivoryDeep rounded-xl p-3 border border-bushal-border flex items-center justify-center">
                <p className="text-xs font-semibold text-bushal-inkSoft">
                  +{healthyItems.length - 12} more
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Metrics Explanation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-6 shadow-card">
          <h3 className="text-sm font-bold text-bushal-forest mb-4">
            Key Metrics Explained
          </h3>
          <div className="space-y-4">
            <div className="border-l-2 border-bushal-copper pl-4">
              <p className="text-xs font-bold text-bushal-forest uppercase tracking-wide">
                Reorder Point (ROP)
              </p>
              <p className="text-xs text-bushal-inkSoft mt-1">
                The inventory level at which a new order should be placed.
                <br />
                <span className="font-mono text-bushal-copper">ROP = Lead Time Demand + Safety Stock</span>
              </p>
            </div>
            <div className="border-l-2 border-bushal-forest pl-4">
              <p className="text-xs font-bold text-bushal-forest uppercase tracking-wide">
                Safety Stock (SS)
              </p>
              <p className="text-xs text-bushal-inkSoft mt-1">
                Buffer stock to protect against demand variability.
                <br />
                <span className="font-mono text-bushal-forest">SS = Z × σ_d × √(Lead Time)</span>
              </p>
            </div>
            <div className="border-l-2 border-bushal-success pl-4">
              <p className="text-xs font-bold text-bushal-forest uppercase tracking-wide">
                Economic Order Quantity (EOQ)
              </p>
              <p className="text-xs text-bushal-inkSoft mt-1">
                Optimal order size to minimize total costs.
                <br />
                <span className="font-mono text-bushal-success">EOQ = √((2 × D × S) / H)</span>
              </p>
            </div>
            <div className="border-l-2 border-bushal-warning pl-4">
              <p className="text-xs font-bold text-bushal-forest uppercase tracking-wide">
                Lead Time Demand (LTD)
              </p>
              <p className="text-xs text-bushal-inkSoft mt-1">
                Expected demand during supplier delivery period.
                <br />
                <span className="font-mono text-bushal-warning">LTD = Avg Daily Sales × Lead Time</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-6 shadow-card">
          <h3 className="text-sm font-bold text-bushal-forest mb-4">
            Urgency Classification
          </h3>
          <div className="space-y-3">
            {['critical', 'high', 'medium', 'low', 'none'].map((urgency) => {
              const config = getUrgencyConfig(urgency)
              return (
                <div key={urgency} className="flex items-start gap-3">
                  <span className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm flex-shrink-0',
                    config.bg, config.border
                  )}>
                    {config.icon}
                  </span>
                  <div className="flex-1">
                    <p className={cn('text-xs font-bold uppercase tracking-wide', config.color)}>
                      {config.label}
                    </p>
                    <p className="text-xs text-bushal-inkSoft mt-0.5">
                      {config.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="text-center text-xs text-bushal-inkSoft">
        <p>
          Analysis based on {productSalesData.length} products · {DEFAULT_RESTOCK_CONFIG.review_period_days}-day review cycle · {(DEFAULT_RESTOCK_CONFIG.service_level * 100).toFixed(0)}% service level
        </p>
        <p className="mt-1">
          Last updated: {formatDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}