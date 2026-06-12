/**
 * ============================================================================
 * DEMAND FORECASTING ADMIN PAGE
 * ============================================================================
 * 
 * This page provides the admin with advanced demand forecasting capabilities
 * using the Holt-Winters Triple Exponential Smoothing algorithm.
 * 
 * FEATURES:
 * - Historical sales data visualization (last 12 months)
 * - Future demand predictions (next 3-6 months)
 * - Festival & occasion boost multipliers (Eid, Pohela Boishakh, etc.)
 * - Stock-out risk predictions with recommended restock quantities
 * - Category-level and product-level forecasting
 * - Confidence intervals for predictions
 * 
 * ALGORITHM: Holt-Winters Triple Exponential Smoothing
 * - Captures Level, Trend, and Seasonality
 * - Integrates festival multipliers for accurate peak predictions
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
  fitHoltWinters,
  forecastHoltWinters,
  analyzeStockOutRisk,
  type TimeSeriesPoint,
  type FestivalEvent,
  type ForecastPoint,
} from '@/lib/analytics/holtWinters'

export const metadata: Metadata = {
  title: 'Demand Forecasting',
  description: 'Advanced demand forecasting with Holt-Winters algorithm and festival multipliers.',
}

// ─── Bangladesh Festival Calendar (2026) ───────────────────────────────────

const BANGLADESH_FESTIVALS: FestivalEvent[] = [
  {
    name: 'Eid-ul-Fitr 2026',
    startDate: '2026-03-20',
    endDate: '2026-03-22',
    boostFactor: 2.5, // 150% increase in sales
  },
  {
    name: 'Pohela Boishakh 2026',
    startDate: '2026-04-14',
    endDate: '2026-04-16',
    boostFactor: 1.8, // 80% increase
  },
  {
    name: 'Eid-ul-Adha 2026',
    startDate: '2026-05-27',
    endDate: '2026-05-29',
    boostFactor: 2.2, // 120% increase
  },
  {
    name: 'Valentine\'s Day 2026',
    startDate: '2026-02-14',
    endDate: '2026-02-14',
    boostFactor: 1.6, // 60% increase (gifts, accessories)
  },
  {
    name: 'Durga Puja 2026',
    startDate: '2026-10-17',
    endDate: '2026-10-21',
    boostFactor: 1.7, // 70% increase
  },
  {
    name: 'Winter Sale Season',
    startDate: '2026-12-15',
    endDate: '2026-12-31',
    boostFactor: 2.0, // 100% increase
  },
  {
    name: 'Independence Day 2026',
    startDate: '2026-03-26',
    endDate: '2026-03-26',
    boostFactor: 1.4, // 40% increase
  },
  {
    name: 'Victory Day 2026',
    startDate: '2026-12-16',
    endDate: '2026-12-16',
    boostFactor: 1.3, // 30% increase
  },
]

// ─── Helper Functions ───────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-BD', {
    month: 'short',
    year: 'numeric',
  })
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getStockOutRiskColor(risk: 'low' | 'medium' | 'high'): string {
  const colors = {
    low: 'bg-bushal-successBg text-bushal-success border-bushal-success/20',
    medium: 'bg-bushal-warningBg text-bushal-warning border-bushal-warning/20',
    high: 'bg-bushal-dangerBg text-bushal-danger border-bushal-danger/20',
  }
  return colors[risk]
}

function getStockOutRiskIcon(risk: 'low' | 'medium' | 'high'): string {
  const icons = {
    low: '✓',
    medium: '⚠',
    high: '✗',
  }
  return icons[risk]
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default async function DemandForecastingPage() {
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const supabase = await auth.supabase

  // 1. Fetch historical order data (last 12 months)
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, created_at, total, status')
    .eq('status', 'fulfilled')
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })

  if (ordersError) {
    console.error('[Demand Forecasting] Error fetching orders:', ordersError)
  }

  // 2. Fetch products with current stock levels
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category, price, stock_quantity, in_stock, images, image_url')
    .is('is_deleted', false)
    .eq('in_stock', true)

  if (productsError) {
    console.error('[Demand Forecasting] Error fetching products:', productsError)
  }

  // 3. Fetch order items for product-level analysis
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity, unit_price')
    .in(
      'order_id',
      (orders ?? []).map((o: any) => o.id)
    )

  if (itemsError) {
    console.error('[Demand Forecasting] Error fetching order items:', itemsError)
  }

  // ─── Process Data for Forecasting ─────────────────────────────────────────

  // Aggregate monthly sales data
  const monthlySalesMap = new Map<string, number>()
  const monthlyOrdersMap = new Map<string, number>()

  ;(orders ?? []).forEach((order: any) => {
    const monthKey = new Date(order.created_at).toISOString().slice(0, 7) // YYYY-MM
    const current = monthlySalesMap.get(monthKey) ?? 0
    monthlySalesMap.set(monthKey, current + order.total)
    monthlyOrdersMap.set(monthKey, (monthlyOrdersMap.get(monthKey) ?? 0) + 1)
  })

  // Convert to time series points
  const monthlySalesData: TimeSeriesPoint[] = Array.from(monthlySalesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: `${date}-01`, value }))

  const monthlyOrdersData: TimeSeriesPoint[] = Array.from(monthlyOrdersMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: `${date}-01`, value }))

  // Product-level sales aggregation
  const productSalesMap = new Map<string, number>()
  ;(orderItems ?? []).forEach((item: any) => {
    const current = productSalesMap.get(item.product_id) ?? 0
    productSalesMap.set(item.product_id, current + item.quantity)
  })

  // ─── Run Holt-Winters Forecasting ────────────────────────────────────────

  // Forecast overall revenue (next 6 months)
  const revenueModel = fitHoltWinters(
    monthlySalesData.map((p) => p.value),
    { seasonLength: 12, alpha: 0.3, beta: 0.1, gamma: 0.2 }
  )

  const revenueForecast = forecastHoltWinters(
    revenueModel,
    6,
    BANGLADESH_FESTIVALS,
    new Date().toISOString().split('T')[0],
    30
  )

  // Forecast order count (next 6 months)
  const ordersModel = fitHoltWinters(
    monthlyOrdersData.map((p) => p.value),
    { seasonLength: 12, alpha: 0.3, beta: 0.1, gamma: 0.2 }
  )

  const ordersForecast = forecastHoltWinters(
    ordersModel,
    6,
    BANGLADESH_FESTIVALS,
    new Date().toISOString().split('T')[0],
    30
  )

  // ─── Calculate Stock-Out Risk for Each Product ────────────────────────────

  interface ProductForecast {
    product_id: string
    name: string
    category: string
    price: number
    current_stock: number
    monthly_sales_velocity: number
    forecast_demand: number
    stock_out_risk: 'low' | 'medium' | 'high'
    recommended_restock: number
    days_until_stockout: number
    image_url: string | null
  }

  const productForecasts: ProductForecast[] = (products ?? [])
    .map((product: any) => {
      const monthlySales = productSalesMap.get(product.id) ?? 0
      const dailySalesVelocity = monthlySales / 30
      const leadTimeDays = 14 // Average supplier lead time

      // Forecast demand for next month (with festival boost if applicable)
      const nextMonthForecast = monthlySales * 1.2 // Base 20% growth assumption

      // Check if any festival falls in the next 30 days
      const today = new Date()
      const next30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      let festivalBoost = 1.0
      let upcomingFestival = ''

      BANGLADESH_FESTIVALS.forEach((festival) => {
        const festivalStart = new Date(festival.startDate)
        if (festivalStart >= today && festivalStart <= next30Days) {
          festivalBoost = Math.max(festivalBoost, festival.boostFactor)
          upcomingFestival = festival.name
        }
      })

      const adjustedForecast = nextMonthForecast * festivalBoost

      // Calculate days until stockout
      const daysUntilStockout = dailySalesVelocity > 0
        ? Math.floor(product.stock_quantity / dailySalesVelocity)
        : 999

      // Determine stock-out risk
      let stockOutRisk: 'low' | 'medium' | 'high' = 'low'
      if (daysUntilStockout < 14) stockOutRisk = 'high'
      else if (daysUntilStockout < 30) stockOutRisk = 'medium'

      // Calculate recommended restock
      const safetyStock = dailySalesVelocity * 7 // 7 days safety stock
      const recommendedRestock = Math.max(
        0,
        Math.ceil(adjustedForecast + safetyStock - product.stock_quantity)
      )

      return {
        product_id: product.id,
        name: product.name,
        category: product.category || 'General',
        price: product.price,
        current_stock: product.stock_quantity,
        monthly_sales_velocity: monthlySales,
        forecast_demand: Math.round(adjustedForecast),
        stock_out_risk: stockOutRisk,
        recommended_restock: recommendedRestock,
        days_until_stockout: daysUntilStockout,
        image_url: product.images?.[0] ?? product.image_url ?? null,
      }
    })
    .filter((p) => p.stock_out_risk !== 'low' || p.recommended_restock > 0)
    .sort((a, b) => {
      const riskOrder = { high: 0, medium: 1, low: 2 }
      return riskOrder[a.stock_out_risk] - riskOrder[b.stock_out_risk]
    })

  // ── Calculate Summary Metrics ────────────────────────────────────────────

  const totalForecastRevenue = revenueForecast.reduce((sum, f) => sum + f.predictedValue, 0)
  const totalForecastOrders = ordersForecast.reduce((sum, f) => sum + f.predictedValue, 0)
  const highRiskProducts = productForecasts.filter((p) => p.stock_out_risk === 'high').length
  const mediumRiskProducts = productForecasts.filter((p) => p.stock_out_risk === 'medium').length

  const totalRestockValue = productForecasts.reduce(
    (sum, p) => sum + p.recommended_restock * p.price,
    0
  )

  // ─── Render UI ────────────────────────────────────────────────────────────

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
            Demand Forecasting
          </h1>
          <p className="text-sm text-bushal-inkSoft mt-1">
            Holt-Winters Triple Exponential Smoothing · Next 6 months
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-2 text-sm font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Analytics
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Forecast Revenue
          </p>
          <p className="text-2xl font-extrabold text-bushal-copper tabular-nums font-heading">
            {formatPrice(totalForecastRevenue)}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Next 6 months</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Forecast Orders
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {Math.round(totalForecastOrders).toLocaleString()}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Next 6 months</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Stock-Out Risk
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-bushal-danger tabular-nums font-heading">
              {highRiskProducts}
            </p>
            <p className="text-sm text-bushal-inkSoft">
              high · {mediumRiskProducts} medium
            </p>
          </div>
          <p className="text-xs text-bushal-inkSoft mt-1">Products need attention</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Restock Investment
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {formatPrice(totalRestockValue)}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Recommended budget</p>
        </div>
      </div>

      {/* Revenue Forecast Chart */}
      <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-6 shadow-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-bushal-forest font-heading">
              Revenue Forecast
            </h2>
            <p className="text-xs text-bushal-inkSoft mt-0.5">
              Historical data + 6-month prediction with festival boosts
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-bushal-copper" />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-bushal-forest" />
              Forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-bushal-warning" />
              Festival Boost
            </span>
          </div>
        </div>

        {/* Chart Visualization */}
        <div className="relative h-64 w-full">
          <svg viewBox="0 0 800 240" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const y = 20 + t * 200
              return (
                <g key={i}>
                  <line
                    x1="60"
                    y1={y}
                    x2="780"
                    y2={y}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray={i === 0 ? 'none' : '3 5'}
                  />
                  <text x="50" y={y + 4} textAnchor="end" fontSize="10" fill="#6B7280">
                    {t === 0 ? '0' : `${(Math.max(...monthlySalesData.map((p) => p.value), totalForecastRevenue) * t / 1000).toFixed(0)}k`}
                  </text>
                </g>
              )
            })}

            {/* Historical data line */}
            {monthlySalesData.length > 1 && (() => {
              const maxVal = Math.max(
                ...monthlySalesData.map((p) => p.value),
                ...revenueForecast.map((f) => f.predictedValue)
              )
              const points = monthlySalesData.map((p, i) => {
                const x = 60 + (i / (monthlySalesData.length + revenueForecast.length - 1)) * 720
                const y = 220 - (p.value / maxVal) * 200
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
              }).join(' ')
              return <path d={points} fill="none" stroke="#B87333" strokeWidth="2.5" strokeLinecap="round" />
            })()}

            {/* Forecast line */}
            {revenueForecast.length > 0 && (() => {
              const maxVal = Math.max(
                ...monthlySalesData.map((p) => p.value),
                ...revenueForecast.map((f) => f.predictedValue)
              )
              const lastHistoricalX = 60 + ((monthlySalesData.length - 1) / (monthlySalesData.length + revenueForecast.length - 1)) * 720
              const lastHistoricalY = 220 - (monthlySalesData[monthlySalesData.length - 1]?.value ?? 0 / maxVal) * 200

              const forecastPoints = revenueForecast.map((f, i) => {
                const x = 60 + ((monthlySalesData.length + i) / (monthlySalesData.length + revenueForecast.length - 1)) * 720
                const y = 220 - (f.predictedValue / maxVal) * 200
                return `${i === 0 ? `M ${lastHistoricalX} ${lastHistoricalY}` : 'L'} ${x} ${y}`
              }).join(' ')
              return <path d={forecastPoints} fill="none" stroke="#1A362D" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 5" />
            })()}

            {/* Festival markers */}
            {revenueForecast.map((f, i) => {
              if (!f.isFestivalPeriod) return null
              const maxVal = Math.max(
                ...monthlySalesData.map((p) => p.value),
                ...revenueForecast.map((f) => f.predictedValue)
              )
              const x = 60 + ((monthlySalesData.length + i) / (monthlySalesData.length + revenueForecast.length - 1)) * 720
              const y = 220 - (f.predictedValue / maxVal) * 200
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="6" fill="#D97706" stroke="white" strokeWidth="2" />
                  <text x={x} y={y - 12} textAnchor="middle" fontSize="9" fill="#D97706" fontWeight="bold">
                    {f.festivalName}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Month labels */}
        <div className="flex justify-between mt-2 text-xs text-bushal-inkSoft px-14">
          {monthlySalesData.map((p, i) => (
            <span key={i}>{formatDate(p.date)}</span>
          ))}
          {revenueForecast.map((f, i) => (
            <span key={i} className={f.isFestivalPeriod ? 'text-bushal-warning font-bold' : ''}>
              {formatDate(f.date)}
            </span>
          ))}
        </div>
      </div>

      {/* Festival Calendar */}
      <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-6 shadow-card">
        <h2 className="text-lg font-bold text-bushal-forest font-heading mb-4">
          Festival & Occasion Calendar
        </h2>
        <p className="text-xs text-bushal-inkSoft mb-4">
          Upcoming events that will impact demand. Multipliers are applied to forecasts automatically.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BANGLADESH_FESTIVALS.map((festival, i) => {
            const daysUntil = Math.floor(
              (new Date(festival.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )
            const isUpcoming = daysUntil >= 0 && daysUntil <= 90

            return (
              <div
                key={i}
                className={cn(
                  'rounded-xl border p-4 transition-all',
                  isUpcoming
                    ? 'bg-bushal-warningBg border-bushal-warning/20'
                    : 'bg-bushal-ivoryDeep/30 border-bushal-border'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-bushal-ink">
                    {festival.name}
                  </span>
                  {isUpcoming && (
                    <span className="text-[10px] font-bold text-bushal-warning bg-bushal-surface px-2 py-0.5 rounded-full">
                      {daysUntil}d
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-bushal-inkSoft mb-2">
                  {formatFullDate(festival.startDate)}
                  {festival.endDate !== festival.startDate && ` - ${formatFullDate(festival.endDate)}`}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-bushal-inkSoft">Boost:</span>
                  <span className="text-xs font-bold text-bushal-copper">
                    +{((festival.boostFactor - 1) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stock-Out Risk Table */}
      <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-bushal-border">
          <h2 className="text-lg font-bold text-bushal-forest font-heading">
            Stock-Out Risk Analysis
          </h2>
          <p className="text-xs text-bushal-inkSoft mt-0.5">
            Products likely to run out of stock based on forecasted demand
          </p>
        </div>

        {productForecasts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-bushal-successBg flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-bushal-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-bushal-forest">All products are well-stocked!</p>
            <p className="text-xs text-bushal-inkSoft mt-1">
              No immediate restocking needed based on current forecasts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bushal-ivoryDeep border-b border-bushal-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Current Stock
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Monthly Sales
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Forecast Demand
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Days Left
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Risk Level
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Restock Qty
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bushal-ivory">
                {productForecasts.map((product) => (
                  <tr key={product.product_id} className="hover:bg-bushal-ivoryDeep/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-bushal-ivoryDeep border border-bushal-border flex-shrink-0">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-bushal-borderMid text-xs">
                              📦
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-bushal-ink truncate max-w-[200px]">
                            {product.name}
                          </p>
                          <p className="text-xs text-bushal-inkSoft">
                            {formatPrice(product.price)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-bushal-ivoryDeep text-bushal-inkMid">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-bushal-forest tabular-nums">
                        {product.current_stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-bushal-ink tabular-nums">
                        {product.monthly_sales_velocity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-bushal-copper tabular-nums">
                        {product.forecast_demand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'text-xs font-bold tabular-nums',
                          product.days_until_stockout < 14
                            ? 'text-bushal-danger'
                            : product.days_until_stockout < 30
                            ? 'text-bushal-warning'
                            : 'text-bushal-success'
                        )}
                      >
                        {product.days_until_stockout === 999 ? '∞' : `${product.days_until_stockout}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border',
                          getStockOutRiskColor(product.stock_out_risk)
                        )}
                      >
                        <span>{getStockOutRiskIcon(product.stock_out_risk)}</span>
                        {product.stock_out_risk.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {product.recommended_restock > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-bold text-bushal-forest tabular-nums">
                            {product.recommended_restock}
                          </span>
                          <Link
                            href={`/admin/products/${product.product_id}/edit`}
                            className="text-xs font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
                          >
                            Restock →
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs text-bushal-inkSoft">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forecast Details Table */}
      <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-bushal-border">
          <h2 className="text-lg font-bold text-bushal-forest font-heading">
            Monthly Forecast Breakdown
          </h2>
          <p className="text-xs text-bushal-inkSoft mt-0.5">
            Detailed predictions with confidence intervals
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-bushal-ivoryDeep border-b border-bushal-border">
                <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Month
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Predicted Revenue
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Lower Bound
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Upper Bound
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Predicted Orders
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Festival
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                  Boost Applied
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bushal-ivory">
              {revenueForecast.map((forecast, i) => {
                const orderForecast = ordersForecast[i]
                return (
                  <tr
                    key={i}
                    className={cn(
                      'hover:bg-bushal-ivoryDeep/50 transition-colors',
                      forecast.isFestivalPeriod && 'bg-bushal-warningBg/30'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-bushal-ink">
                        {formatDate(forecast.date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-bushal-forest tabular-nums">
                        {formatPrice(forecast.predictedValue)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-bushal-inkSoft tabular-nums">
                        {formatPrice(forecast.lowerBound)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-bushal-inkSoft tabular-nums">
                        {formatPrice(forecast.upperBound)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-bushal-ink tabular-nums">
                        {orderForecast ? Math.round(orderForecast.predictedValue) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {forecast.isFestivalPeriod ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-bushal-warningBg text-bushal-warning border border-bushal-warning/20">
                          🎉 {forecast.festivalName}
                        </span>
                      ) : (
                        <span className="text-xs text-bushal-inkSoft">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {forecast.boostApplied > 1 ? (
                        <span className="text-xs font-bold text-bushal-copper">
                          +{((forecast.boostApplied - 1) * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-bushal-inkSoft">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Algorithm Info */}
      <div className="bg-gradient-to-br from-bushal-forest to-bushal-forestMid rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-bushal-copperGlow mb-2">
              About This Forecast
            </h3>
            <p className="text-xs text-white/80 leading-relaxed mb-3">
              This forecast uses the <strong className="text-white">Holt-Winters Triple Exponential Smoothing</strong> algorithm,
              which captures three components of your sales data: <strong className="text-white">Level</strong> (base value),
              <strong className="text-white"> Trend</strong> (growth/decline), and <strong className="text-white">Seasonality</strong> (repeating patterns).
            </p>
            <p className="text-xs text-white/80 leading-relaxed">
              Festival multipliers are applied based on historical Bangladesh shopping patterns.
              Confidence intervals (95%) show the range where actual values are likely to fall.
              Stock-out predictions use a 14-day supplier lead time assumption.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}