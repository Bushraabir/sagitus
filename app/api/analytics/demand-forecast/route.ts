/**
 * ============================================================================
 * DEMAND FORECASTING API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint provides on-demand Holt-Winters demand forecasting.
 * It can generate forecasts for either the overall store revenue or 
 * specific products based on their historical sales velocity.
 * 
 * FEATURES:
 * - Admin-only authentication
 * - Overall store revenue forecasting (monthly aggregation)
 * - Product-specific demand forecasting (units sold aggregation)
 * - Integration with Bangladesh festival calendar for sales boosts
 * - Stock-out risk analysis and restock recommendations
 * 
 * USAGE:
 * GET /api/analytics/demand-forecast?periods=6
 * GET /api/analytics/demand-forecast?product_id=uuid&periods=3
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "forecastType": "product" | "store_revenue",
 *   "historicalData": [...],
 *   "forecast": [...],
 *   "stockOutRisk": "low" | "medium" | "high",
 *   "recommendedRestock": 50,
 *   "festivalsApplied": [...]
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import {
  generateDemandForecast,
  type TimeSeriesPoint,
  type FestivalEvent,
  type DemandForecastResult,
} from '@/lib/analytics/holtWinters'

// ─── Bangladesh Festival Calendar (Dynamic for current/upcoming year) ──────

function getUpcomingFestivals(): FestivalEvent[] {
  const currentYear = new Date().getFullYear()
  
  // Note: In a production app, these dates would be fetched from a database
  // or an external calendar API, as Islamic holidays shift yearly.
  return [
    {
      name: 'Eid-ul-Fitr',
      startDate: `${currentYear}-03-20`,
      endDate: `${currentYear}-03-22`,
      boostFactor: 2.5,
    },
    {
      name: 'Pohela Boishakh',
      startDate: `${currentYear}-04-14`,
      endDate: `${currentYear}-04-16`,
      boostFactor: 1.8,
    },
    {
      name: 'Eid-ul-Adha',
      startDate: `${currentYear}-05-27`,
      endDate: `${currentYear}-05-29`,
      boostFactor: 2.2,
    },
    {
      name: 'Valentine\'s Day',
      startDate: `${currentYear}-02-14`,
      endDate: `${currentYear}-02-14`,
      boostFactor: 1.6,
    },
    {
      name: 'Durga Puja',
      startDate: `${currentYear}-10-17`,
      endDate: `${currentYear}-10-21`,
      boostFactor: 1.7,
    },
    {
      name: 'Winter Sale Season',
      startDate: `${currentYear}-12-15`,
      endDate: `${currentYear}-12-31`,
      boostFactor: 2.0,
    },
    {
      name: 'Independence Day',
      startDate: `${currentYear}-03-26`,
      endDate: `${currentYear}-03-26`,
      boostFactor: 1.4,
    },
    {
      name: 'Victory Day',
      startDate: `${currentYear}-12-16`,
      endDate: `${currentYear}-12-16`,
      boostFactor: 1.3,
    },
  ]
}

// ─── Helper: Aggregate Data by Month ────────────────────────────────────────

function aggregateByMonth(
  records: { date: string; value: number }[]
): TimeSeriesPoint[] {
  const monthlyMap = new Map<string, number>()

  records.forEach((record) => {
    // Extract YYYY-MM from ISO date string
    const monthKey = record.date.slice(0, 7)
    const current = monthlyMap.get(monthKey) ?? 0
    monthlyMap.set(monthKey, current + record.value)
  })

  // Convert to sorted array of TimeSeriesPoint
  return Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: `${date}-01`, value }))
}

// ─── Main API Handler ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // 1. Authentication - Ensure user is an admin
    const auth = await requireAdmin()
    if (!auth.success) {
      return auth.response
    }

    const supabase = await auth.supabase

    // 2. Parse Query Parameters
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')
    const periodsToForecast = parseInt(searchParams.get('periods') || '6')
    const leadTimeDays = parseInt(searchParams.get('lead_time') || '14')

    // Validate parameters
    if (periodsToForecast < 1 || periodsToForecast > 24) {
      return NextResponse.json(
        { error: 'Invalid periods parameter. Must be between 1 and 24.' },
        { status: 400 }
      )
    }

    // 3. Fetch Historical Data
    let historicalData: TimeSeriesPoint[] = []
    let currentStock = 0
    let productName = 'Overall Store'
    let forecastType: 'product' | 'store_revenue' = 'store_revenue'

    if (productId) {
      // ─ Product-Specific Forecast ──
      forecastType = 'product'

      // Fetch product details for current stock
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('name, stock_quantity, in_stock')
        .eq('id', productId)
        .is('is_deleted', false)
        .single()

      if (productError || !product) {
        return NextResponse.json(
          { error: 'Product not found or deleted.' },
          { status: 404 }
        )
      }

      productName = product.name
      currentStock = product.stock_quantity

      // Fetch historical sales for this specific product
      // We look at fulfilled orders from the last 24 months
      const twentyFourMonthsAgo = new Date()
      twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24)

      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('quantity, created_at, orders!inner(status, created_at)')
        .eq('product_id', productId)
        .eq('orders.status', 'fulfilled')
        .gte('orders.created_at', twentyFourMonthsAgo.toISOString())

      if (itemsError) {
        console.error('[Demand Forecast API] Error fetching order items:', itemsError)
        return NextResponse.json(
          { error: 'Failed to fetch historical sales data.' },
          { status: 500 }
        )
      }

      // Aggregate units sold by month
      const salesRecords = (orderItems ?? []).map((item: any) => ({
        date: item.orders.created_at,
        value: item.quantity,
      }))

      historicalData = aggregateByMonth(salesRecords)
    } else {
      // ─ Overall Store Revenue Forecast ──
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 24)

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total, created_at')
        .eq('status', 'fulfilled')
        .gte('created_at', twelveMonthsAgo.toISOString())

      if (ordersError) {
        console.error('[Demand Forecast API] Error fetching orders:', ordersError)
        return NextResponse.json(
          { error: 'Failed to fetch historical order data.' },
          { status: 500 }
        )
      }

      // Aggregate revenue by month
      const revenueRecords = (orders ?? []).map((order: any) => ({
        date: order.created_at,
        value: order.total,
      }))

      historicalData = aggregateByMonth(revenueRecords)
    }

    // 4. Validate Historical Data
    if (historicalData.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient historical data. Need at least 3 months of data to generate a forecast.',
          historicalData,
        },
        { status: 422 }
      )
    }

    // 5. Get Festival Calendar
    const festivals = getUpcomingFestivals()

    // 6. Run Holt-Winters Forecasting
    const forecastResult: DemandForecastResult = generateDemandForecast(
      historicalData,
      {
        seasonLength: 12, // Monthly seasonality
        alpha: 0.3,       // Level smoothing
        beta: 0.1,        // Trend smoothing
        gamma: 0.2,       // Seasonal smoothing
        additive: true,   // Additive seasonality
      },
      periodsToForecast,
      festivals,
      currentStock,
      leadTimeDays
    )

    // 7. Build Response
    return NextResponse.json({
      success: true,
      forecastType,
      productName,
      currentStock,
      historicalData,
      forecast: forecastResult.forecast,
      stockOutRisk: forecastResult.stockOutRisk,
      recommendedRestock: forecastResult.recommendedRestock,
      festivalsApplied: festivals.filter((f) => {
        const festivalDate = new Date(f.startDate)
        const today = new Date()
        const forecastEndDate = new Date()
        forecastEndDate.setMonth(forecastEndDate.getMonth() + periodsToForecast)
        return festivalDate >= today && festivalDate <= forecastEndDate
      }),
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Demand Forecast API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while generating forecast.',
      },
      { status: 500 }
    )
  }
}