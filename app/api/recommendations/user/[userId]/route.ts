// app/api/recommendations/user/[userId]/route.ts
/*
 * ============================================================================
 * PERSONALIZED RECOMMENDATIONS API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint generates personalized product recommendations for a user
 * using collaborative filtering algorithms (Cosine Similarity, KNN, SVD).
 * 
 * FEATURES:
 * - Fetches user purchase history from Supabase
 * - Uses collaborative filtering to find similar users
 * - Returns top N recommended products with scores
 * - Handles cold start (new users with no history)
 * - Caches results for performance
 * 
 * USAGE:
 * GET /api/recommendations/user/[userId]?limit=10&useHybrid=true
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "userId": "uuid",
 *   "recommendations": [...],
 *   "algorithm": "hybrid",
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import {
  getRecommendationsForUser,
  getCollaborativeRecommendations,
  getHybridRecommendations,
  handleColdStart,
  buildUserItemMatrix,
  findKNNSimilarUsers,
} from '@/lib/recommendations/collaborativeFiltering'
import type { UserPurchase, ProductInfo, Recommendation } from '@/lib/recommendations/collaborativeFiltering'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RequestParams {
  params: {
    userId: string
  }
}

interface RecommendationResponse {
  success: boolean
  userId: string
  recommendations: Recommendation[]
  algorithm: string
  similarUsersCount?: number
  totalProductsAnalyzed: number
  generatedAt: string
  error?: string
}

// Minimal shape we actually read from the `orders` table.
// Declaring this explicitly is what fixes the
// "Property 'user_id'/'created_at' does not exist on type '{}'" errors —
// without it, Supabase's generic client falls back to inferring `{}`
// for each row in `orders`.
interface OrderRow {
  id: string
  user_id: string
  created_at: string
  total: number
  status: string
}

interface OrderItemRow {
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
}

interface ProductRow {
  id: string
  name: string
  category: string | null
  price: number
  image_url: string | null
  images: string[] | null
  in_stock: boolean
  stock_quantity: number | null
}

// ─── Cache Configuration ───────────────────────────────────────────────────

const CACHE_TTL = 1800 // 30 minutes
const cache = new Map<string, { data: RecommendationResponse; timestamp: number }>()

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fetch all user purchases from the database
 */
async function fetchUserPurchases(supabase: any): Promise<UserPurchase[]> {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, created_at, total, status')
    .eq('status', 'fulfilled')
    .order('created_at', { ascending: false })
    .limit(1000) // Limit to recent orders for performance

  if (ordersError) {
    console.error('[Recommendations] Error fetching orders:', ordersError)
    return []
  }

  if (!orders || orders.length === 0) return []

  // Cast the rows to the explicit OrderRow shape so TS knows
  // `o.id`, `o.user_id`, and `o.created_at` exist below.
  const typedOrders = orders as OrderRow[]

  // Fetch order items for these orders
  const orderIds = typedOrders.map((o) => o.id)
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity, unit_price')
    .in('order_id', orderIds)

  if (itemsError) {
    console.error('[Recommendations] Error fetching order items:', itemsError)
    return []
  }

  // Map orders to purchases
  const orderMap = new Map<string, OrderRow>(typedOrders.map((o) => [o.id, o]))

  const typedOrderItems = (orderItems ?? []) as OrderItemRow[]

  return typedOrderItems.map((item): UserPurchase => {
    const order = orderMap.get(item.order_id)
    return {
      user_id: order?.user_id ?? '',
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      order_date: order?.created_at ?? new Date().toISOString(),
    }
  })
}

/**
 * Fetch all products from the database
 */
async function fetchAllProducts(supabase: any): Promise<ProductInfo[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price, image_url, images, in_stock, stock_quantity')
    .eq('in_stock', true)
    .is('is_deleted', false)
    .limit(500)

  if (error) {
    console.error('[Recommendations] Error fetching products:', error)
    return []
  }

  const typedProducts = (products ?? []) as ProductRow[]

  return typedProducts.map((p): ProductInfo => ({
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    price: p.price,
    image_url: p.image_url || null,
    images: p.images || [],
    in_stock: p.in_stock,
  }))
}

/**
 * Check cache for existing recommendations
 */
function getCachedRecommendations(userId: string, limit: number): RecommendationResponse | null {
  const cacheKey = `${userId}:${limit}`
  const cached = cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data
  }
  
  // Remove expired cache
  cache.delete(cacheKey)
  return null
}

/**
 * Store recommendations in cache
 */
function setCachedRecommendations(userId: string, limit: number, data: RecommendationResponse): void {
  const cacheKey = `${userId}:${limit}`
  cache.set(cacheKey, { data, timestamp: Date.now() })
  
  // Limit cache size to prevent memory leaks
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
}

// ─── Main API Handler ───────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: RequestParams
) {
  try {
    // 1. Authentication - Ensure user is authenticated
    const auth = await requireAuth()
    if (!auth.success) {
      return auth.response
    }

    // 2. Authorization - Users can only fetch their own recommendations
    // (Admins can fetch for any user)
    const requestedUserId = params.userId as string
    const { data: profile } = await (await auth.supabase)
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single()

    const isAdmin = profile?.role === 'admin'
    if (!isAdmin && auth.userId !== requestedUserId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only fetch your own recommendations' },
        { status: 403 }
      )
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const useHybrid = searchParams.get('useHybrid') !== 'false'
    const enableDiversity = searchParams.get('diversity') !== 'false'
    const k = parseInt(searchParams.get('k') || '5')

    // Validate parameters
    if (limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 50.' },
        { status: 400 }
      )
    }

    // 4. Check cache first
    const cached = getCachedRecommendations(requestedUserId, limit)
    if (cached) {
      return NextResponse.json(cached)
    }

    // 5. Fetch data from database
    const [purchases, products] = await Promise.all([
      fetchUserPurchases(auth.supabase),
      fetchAllProducts(auth.supabase),
    ])

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        userId: requestedUserId,
        recommendations: [],
        algorithm: 'none',
        totalProductsAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        error: 'No products available',
      })
    }

    // 6. Generate recommendations
    let recommendations: Recommendation[]
    let algorithm = 'unknown'
    let similarUsersCount = 0

    // Check if user has purchase history
    const userPurchases = purchases.filter(p => p.user_id === requestedUserId)

    if (userPurchases.length === 0) {
      // Cold start: use fallback strategy
      recommendations = handleColdStart(purchases, products, limit)
      algorithm = 'cold_start_fallback'
    } else if (useHybrid) {
      // Use hybrid approach (CF + SVD)
      recommendations = getHybridRecommendations(
        requestedUserId,
        purchases,
        products,
        k,
        limit
      )
      algorithm = 'hybrid_cf_svd'
      
      // Count similar users for metadata
      const { userVectors } = buildUserItemMatrix(purchases)
      const similarUsers = findKNNSimilarUsers(requestedUserId, userVectors, k)
      similarUsersCount = similarUsers.length
    } else {
      // Use pure collaborative filtering
      recommendations = getCollaborativeRecommendations(
        requestedUserId,
        purchases,
        products,
        k,
        limit
      )
      algorithm = 'collaborative_filtering'
      
      const { userVectors } = buildUserItemMatrix(purchases)
      const similarUsers = findKNNSimilarUsers(requestedUserId, userVectors, k)
      similarUsersCount = similarUsers.length
    }

    // 7. Build response
    const response: RecommendationResponse = {
      success: true,
      userId: requestedUserId,
      recommendations,
      algorithm,
      similarUsersCount,
      totalProductsAnalyzed: products.length,
      generatedAt: new Date().toISOString(),
    }

    // 8. Cache the response
    setCachedRecommendations(requestedUserId, limit, response)

    // 9. Return response with appropriate headers
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=300`,
        'X-Recommendation-Algorithm': algorithm,
        'X-Total-Products': products.length.toString(),
        'X-Similar-Users': similarUsersCount.toString(),
      },
    })

  } catch (error) {
    console.error('[Recommendations API] Unexpected error:', error)
    
    return NextResponse.json(
      {
        success: false,
        userId: params.userId,
        recommendations: [],
        algorithm: 'error',
        totalProductsAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        error: 'Internal server error while generating recommendations',
      },
      { status: 500 }
    )
  }
}

// ─── POST Handler (For triggering recommendation refresh) ───────────────────

export async function POST(
  request: NextRequest,
  { params }: RequestParams
) {
  try {
    // 1. Authentication
    const auth = await requireAuth()
    if (!auth.success) {
      return auth.response
    }

    // 2. Authorization
    const requestedUserId = params.userId as string
    const { data: profile } = await (await auth.supabase)
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single()

    const isAdmin = profile?.role === 'admin'
    if (!isAdmin && auth.userId !== requestedUserId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // 3. Clear cache for this user
    const cacheKeys = Array.from(cache.keys())
    cacheKeys.forEach(key => {
      if (key.startsWith(`${requestedUserId}:`)) {
        cache.delete(key)
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Recommendation cache cleared. Next request will generate fresh recommendations.',
      userId: requestedUserId,
    })

  } catch (error) {
    console.error('[Recommendations API] Error clearing cache:', error)
    return NextResponse.json(
      { error: 'Failed to clear recommendation cache' },
      { status: 500 }
    )
  }
}