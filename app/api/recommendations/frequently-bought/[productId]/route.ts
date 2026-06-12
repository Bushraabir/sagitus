// app/api/recommendations/frequently-bought/[productId]/route.ts

/**
 * ============================================================================
 * FREQUENTLY BOUGHT TOGETHER API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint generates "Frequently Bought Together" recommendations
 * for a specific product using the Apriori association rule mining algorithm.
 * 
 * FEATURES:
 * - Fetches historical fulfilled orders from Supabase
 * - Transforms order data into transaction format
 * - Runs Apriori algorithm to find strong product associations
 * - Enriches results with full product details (name, price, image)
 * - Caches results to prevent heavy computation on every request
 * 
 * USAGE:
 * GET /api/recommendations/frequently-bought/[productId]
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "productId": "uuid",
 *   "recommendations": [
 *     {
 *       "product_id": "uuid",
 *       "name": "Product Name",
 *       "price": 1200,
 *       "image_url": "https://...",
 *       "support": 0.05,
 *       "confidence": 0.75,
 *       "lift": 2.5,
 *       "reason": "Bought together 15 times..."
 *     }
 *   ],
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  getFrequentlyBoughtTogether,
  buildTransactionsFromOrders,
  validateTransactions,
} from '@/lib/recommendations/frequentlyBoughtTogether'
import type { Transaction } from '@/lib/recommendations/frequentlyBoughtTogether'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductDetails {
  id: string
  name: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
}

interface EnrichedRecommendation {
  product_id: string
  name: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
  support: number
  confidence: number
  lift: number
  frequency: number
  reason: string
}

interface FBTResponse {
  success: boolean
  productId: string
  recommendations: EnrichedRecommendation[]
  totalTransactionsAnalyzed: number
  generatedAt: string
  error?: string
}

// ─── Cache Configuration ───────────────────────────────────────────────────

const CACHE_TTL = 3600 // 1 hour (FBT data changes less frequently than personalized recs)
const cache = new Map<string, { data: FBTResponse; timestamp: number }>()

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fetch all fulfilled orders with their items from the database
 */
async function fetchFulfilledOrders(supabase: any) {
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      created_at,
      total,
      order_items (
        product_id
      )
    `)
    .eq('status', 'fulfilled')
    .order('created_at', { ascending: false })
    .limit(2000) // Limit to recent 2000 orders for performance

  if (error) {
    console.error('[FBT API] Error fetching orders:', error)
    return []
  }

  return orders ?? []
}

/**
 * Transform Supabase order data into Transaction format for Apriori
 */
function transformOrdersToTransactions(orders: any[]): Transaction[] {
  return orders
    .filter(order => order.order_items && Array.isArray(order.order_items) && order.order_items.length > 0)
    .map(order => ({
      transaction_id: order.id,
      order_id: order.id,
      user_id: order.user_id,
      product_ids: order.order_items.map((item: any) => item.product_id),
      transaction_date: order.created_at,
      total_amount: order.total,
    }))
}

/**
 * Fetch product details for the recommended product IDs
 */
async function fetchProductDetails(supabase: any, productIds: string[]): Promise<ProductDetails[]> {
  if (productIds.length === 0) return []

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, image_url, images, in_stock')
    .in('id', productIds)
    .eq('in_stock', true) // Only recommend products that are in stock
    .is('is_deleted', false)

  if (error) {
    console.error('[FBT API] Error fetching product details:', error)
    return []
  }

  return (products ?? []).map((p: any): ProductDetails => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    images: p.images || [],
    in_stock: p.in_stock,
  }))
}

/**
 * Check cache for existing recommendations
 */
function getCachedFBT(productId: string): FBTResponse | null {
  const cached = cache.get(productId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data
  }
  cache.delete(productId)
  return null
}

/**
 * Store recommendations in cache
 */
function setCachedFBT(productId: string, data: FBTResponse): void {
  cache.set(productId, { data, timestamp: Date.now() })
  
  // Limit cache size
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
}

// ─── Main API Handler ───────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    // 1. Validate product ID
    const productId = params.productId
    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    // 2. Check cache first
    const cached = getCachedFBT(productId)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
          'X-Cache': 'HIT',
        },
      })
    }

    // 3. Initialize Supabase client
    const supabase = await createServerClient()

    // 4. Fetch and transform order data
    const orders = await fetchFulfilledOrders(supabase)
    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        productId,
        recommendations: [],
        totalTransactionsAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        error: 'No historical order data available',
      })
    }

    const transactions = transformOrdersToTransactions(orders)

    // 5. Validate transaction data (optional but good for debugging)
    const validation = validateTransactions(transactions)
    if (!validation.isValid) {
      console.warn('[FBT API] Transaction validation warnings:', validation.warnings)
    }

    // 6. Run Apriori Algorithm
    const recommendations = getFrequentlyBoughtTogether(productId, transactions, {
      minSupport: 0.01,      // At least 1% of transactions
      minConfidence: 0.3,    // At least 30% confidence
      minLift: 1.2,          // At least 20% more likely than random
      maxItemsetSize: 2,     // Only look at pairs
      maxRecommendations: 5, // Return top 5 recommendations
    })

    // 7. Enrich recommendations with product details
    const recommendedProductIds = recommendations.map(r => r.product_id)
    const products = await fetchProductDetails(supabase, recommendedProductIds)
    
    const productMap = new Map(products.map(p => [p.id, p]))

    const enrichedRecommendations: EnrichedRecommendation[] = recommendations
      .map((rec) => {
        const product = productMap.get(rec.product_id)
      
        if (!product) return null
      
        return {
          product_id: rec.product_id,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          images: product.images,
          in_stock: product.in_stock,
          support: rec.support,
          confidence: rec.confidence,
          lift: rec.lift,
          frequency: rec.frequency,
          reason: rec.reason,
        }
      })
      .filter((rec): rec is EnrichedRecommendation => rec !== null)

    // 8. Build response
    const response: FBTResponse = {
      success: true,
      productId,
      recommendations: enrichedRecommendations,
      totalTransactionsAnalyzed: transactions.length,
      generatedAt: new Date().toISOString(),
    }

    // 9. Cache the response
    setCachedFBT(productId, response)

    // 10. Return response
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        'X-Cache': 'MISS',
        'X-Total-Transactions': transactions.length.toString(),
        'X-Recommendations-Count': enrichedRecommendations.length.toString(),
      },
    })

  } catch (error) {
    console.error('[FBT API] Unexpected error:', error)
    
    return NextResponse.json(
      {
        success: false,
        productId: params.productId,
        recommendations: [],
        totalTransactionsAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        error: 'Internal server error while generating recommendations',
      },
      { status: 500 }
    )
  }
}