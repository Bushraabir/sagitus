// app/api/products/trending/route.ts

/**
 * ============================================================================
 * TRENDING PRODUCTS API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint identifies and returns trending products using the 
 * Exponential Moving Average (EMA) and weighted trend score algorithms.
 * 
 * FEATURES:
 * - Public access (no authentication required)
 * - Analyzes last 30 days of fulfilled order data
 * - Calculates trend scores, EMAs, and growth percentages
 * - Classifies products as HOT, TRENDING, STABLE, or DECLINING
 * - Supports filtering by trend status and category
 * - Caches results to prevent heavy aggregation on every request
 * 
 * USAGE:
 * GET /api/products/trending?limit=10&status=HOT
 * GET /api/products/trending?limit=5&category=Accessories
 * GET /api/products/trending?includeMetrics=true
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "trendingProducts": [...],
 *   "storeMetrics": { ... },
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  detectTrendingProducts,
  getHotAndTrending,
  getTrendingByCategory,
  getStoreTrendMetrics,
  type DailySales,
  type ProductTrend,
} from '@/lib/analytics/trendingProducts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendingResponse {
  success: boolean
  trendingProducts: ProductTrend[]
  storeMetrics?: {
    hot_count: number
    trending_count: number
    stable_count: number
    declining_count: number
    avg_growth_percentage: number
    store_momentum: string
  }
  totalAnalyzed: number
  generatedAt: string
  error?: string
}

// ─── Cache Configuration ───────────────────────────────────────────────────

const CACHE_TTL = 600 // 10 minutes (Trending data updates frequently but doesn't need real-time)
const cache = new Map<string, { data: TrendingResponse; timestamp: number }>()

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fetch recent sales history (last 30 days) from fulfilled orders
 */
async function fetchRecentSales(supabase: any): Promise<DailySales[]> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('order_items')
    .select(`
      product_id,
      quantity,
      unit_price,
      orders!inner(created_at, status)
    `)
    .gte('orders.created_at', thirtyDaysAgo.toISOString())
    .eq('orders.status', 'fulfilled')

  if (error) {
    console.error('[Trending API] Error fetching sales history:', error)
    return []
  }

  // Aggregate sales by product and date
  const salesMap = new Map<string, DailySales>()

  ;(data ?? []).forEach((item: any) => {
    const date = item.orders.created_at.split('T')[0] // YYYY-MM-DD
    const key = `${item.product_id}::${date}`
    
    const existing = salesMap.get(key)
    if (existing) {
      existing.quantity_sold += item.quantity
      existing.revenue += item.quantity * item.unit_price
    } else {
      salesMap.set(key, {
        date,
        product_id: item.product_id,
        quantity_sold: item.quantity,
        revenue: item.quantity * item.unit_price,
      })
    }
  })

  return Array.from(salesMap.values())
}

/**
 * Fetch all active products from the database
 */
async function fetchActiveProducts(supabase: any) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, price, image_url, images, in_stock')
    .is('is_deleted', false)
    .eq('in_stock', true)

  if (error) {
    console.error('[Trending API] Error fetching products:', error)
    return []
  }

  return data ?? []
}

// ─── Main API Handler ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // 1. Parse Query Parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const statusFilter = searchParams.get('status') as 'HOT' | 'TRENDING' | 'STABLE' | 'DECLINING' | null
    const categoryFilter = searchParams.get('category')
    const includeMetrics = searchParams.get('includeMetrics') === 'true'

    // Validate parameters
    if (limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 50.' },
        { status: 400 }
      )
    }

    // 2. Check Cache
    const cacheKey = `trending:${limit}:${statusFilter || 'all'}:${categoryFilter || 'all'}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=120',
          'X-Cache': 'HIT',
        },
      })
    }

    // 3. Initialize Supabase client
    const supabase = await createServerClient()

    // 4. Fetch Data
    const [salesHistory, products] = await Promise.all([
      fetchRecentSales(supabase),
      fetchActiveProducts(supabase),
    ])

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        trendingProducts: [],
        totalAnalyzed: 0,
        generatedAt: new Date().toISOString(),
      })
    }

    // 5. Calculate Trends
    const allTrends = detectTrendingProducts(salesHistory, products, {
      daysToAnalyze: 7,
      emaPeriod: 3,
      hotThreshold: 2.0,
      trendingThreshold: 1.5,
      minSalesForTrend: 2, // At least 2 sales in 7 days to be considered trending
    })

    // 6. Apply Filters
    let filteredTrends = allTrends

    if (statusFilter) {
      filteredTrends = filteredTrends.filter((t) => t.trend_status === statusFilter)
    }

    if (categoryFilter) {
      filteredTrends = filteredTrends.filter((t) => t.category === categoryFilter)
    }

    // 7. Limit Results
    const limitedTrends = filteredTrends.slice(0, limit)

    // 8. Calculate Store Metrics (Optional)
    let storeMetrics: TrendingResponse['storeMetrics'] | undefined
    if (includeMetrics) {
      const metrics = getStoreTrendMetrics(allTrends)
      storeMetrics = {
        hot_count: metrics.hot_count,
        trending_count: metrics.trending_count,
        stable_count: metrics.stable_count,
        declining_count: metrics.declining_count,
        avg_growth_percentage: metrics.avg_growth_percentage,
        store_momentum: metrics.store_momentum,
      }
    }

    // 9. Build Response
    const response: TrendingResponse = {
      success: true,
      trendingProducts: limitedTrends,
      storeMetrics,
      totalAnalyzed: allTrends.length,
      generatedAt: new Date().toISOString(),
    }

    // 10. Cache the response
    cache.set(cacheKey, { data: response, timestamp: Date.now() })
    
    // Limit cache size
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value
      if (firstKey !== undefined) cache.delete(firstKey)
    }

    // 11. Return response
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=120',
        'X-Cache': 'MISS',
        'X-Total-Analyzed': allTrends.length.toString(),
        'X-Trending-Count': limitedTrends.length.toString(),
      },
    })

  } catch (error) {
    console.error('[Trending API] Unexpected error:', error)
    
    return NextResponse.json(
      {
        success: false,
        trendingProducts: [],
        totalAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        error: 'Internal server error while calculating trending products',
      },
      { status: 500 }
    )
  }
}