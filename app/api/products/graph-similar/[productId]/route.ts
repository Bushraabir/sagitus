// app/api/products/graph-similar/[productId]/route.ts

/**
 * ============================================================================
 * GRAPH-BASED SIMILAR PRODUCTS API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint uses PageRank and Random Walk with Restart (RWR) algorithms
 * to find products similar to a given product. It builds a product graph from
 * co-purchase data and category relationships, then runs graph algorithms to
 * identify the most relevant similar products.
 * 
 * FEATURES:
 * - Public access (no authentication required)
 * - Builds product graph from historical order data
 * - Uses RWR for similarity scoring
 * - Uses PageRank for popularity boost
 * - Returns hybrid recommendations with detailed metrics
 * - Caches results for performance
 * 
 * USAGE:
 * GET /api/products/graph-similar/[productId]?limit=10&alpha=0.7
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
 *       "score": 0.85,
 *       "rwrProbability": 0.92,
 *       "pageRankScore": 0.73,
 *       "category": "Accessories"
 *     }
 *   ],
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  buildProductGraph,
  hybridGraphRecommendations,
  type ProductGraph,
} from '@/lib/recommendations/productGraph'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RequestParams {
  params: {
    productId: string
  }
}

interface GraphRecommendation {
  productId: string
  name: string
  price: number
  image_url: string | null
  images: string[]
  category: string
  in_stock: boolean
  score: number
  rwrProbability: number
  pageRankScore: number
}

interface GraphResponse {
  success: boolean
  productId: string
  recommendations: GraphRecommendation[]
  totalProductsAnalyzed: number
  totalEdges: number
  generatedAt: string
  error?: string
}

// Explicit row shapes for Supabase query results.
// Without these, `.select()` on an `any`-typed client infers `{}`,
// which is what caused the "Property 'name'/'price'/... does not exist
// on type '{}'" errors at Ln 292-297.
interface ProductRow {
  id: string
  name: string
  category: string | null
  price: number
  image_url: string | null
  images: string[] | null
  in_stock: boolean
}

interface OrderRow {
  id: string
}

interface OrderItemRow {
  order_id: string
  product_id: string
  quantity: number
}

// ─── Cache Configuration ───────────────────────────────────────────────────

const CACHE_TTL = 1800 // 30 minutes
const cache = new Map<string, { data: GraphResponse; timestamp: number }>()

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fetch all products from the database
 */
async function fetchAllProducts(supabase: any): Promise<ProductRow[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price, image_url, images, in_stock')
    .is('is_deleted', false)
    .eq('in_stock', true)

  if (error) {
    console.error('[Graph API] Error fetching products:', error)
    return []
  }

  return (products ?? []) as ProductRow[]
}

/**
 * Fetch all fulfilled order items for co-purchase analysis
 */
async function fetchOrderItems(supabase: any): Promise<OrderItemRow[]> {
  // First get all fulfilled order IDs
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'fulfilled')

  if (ordersError) {
    console.error('[Graph API] Error fetching orders:', ordersError)
    return []
  }

  if (!orders || orders.length === 0) return []

  const typedOrders = orders as OrderRow[]

  // Then get all items from those orders
  const orderIds = typedOrders.map((o) => o.id)
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity')
    .in('order_id', orderIds)

  if (itemsError) {
    console.error('[Graph API] Error fetching order items:', itemsError)
    return []
  }

  return (items ?? []) as OrderItemRow[]
}

/**
 * Check cache for existing recommendations
 */
function getCachedRecommendations(productId: string, limit: number): GraphResponse | null {
  const cacheKey = `graph:${productId}:${limit}`
  const cached = cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data
  }
  
  cache.delete(cacheKey)
  return null
}

/**
 * Store recommendations in cache
 */
function setCachedRecommendations(productId: string, limit: number, data: GraphResponse): void {
  const cacheKey = `graph:${productId}:${limit}`
  cache.set(cacheKey, { data, timestamp: Date.now() })
  
  // Limit cache size
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
}

// ─── Main API Handler ──────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: RequestParams
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

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const alpha = parseFloat(searchParams.get('alpha') || '0.7')

    // Validate parameters
    if (limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 50.' },
        { status: 400 }
      )
    }

    if (alpha < 0 || alpha > 1) {
      return NextResponse.json(
        { error: 'Invalid alpha parameter. Must be between 0 and 1.' },
        { status: 400 }
      )
    }

    // 3. Check cache first
    const cached = getCachedRecommendations(productId, limit)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      })
    }

    // 4. Initialize Supabase client
    const supabase = await createServerClient()

    // 5. Fetch data
    const [products, orderItems] = await Promise.all([
      fetchAllProducts(supabase),
      fetchOrderItems(supabase),
    ])

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        productId,
        recommendations: [],
        totalProductsAnalyzed: 0,
        totalEdges: 0,
        generatedAt: new Date().toISOString(),
        error: 'No products available',
      })
    }

    // 6. Verify the target product exists
    const targetProduct = products.find((p) => p.id === productId)
    if (!targetProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // 7. Build product graph
    const graph: ProductGraph = buildProductGraph(
      orderItems.map((item) => ({
        order_id: item.order_id,
        product_id: item.product_id,
        quantity: item.quantity,
      })),
      products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || 'General',
        price: p.price,
        in_stock: p.in_stock,
      })),
      {
        dampingFactor: 0.85,
        restartProbability: 0.15,
        maxIterations: 50,
        tolerance: 1e-6,
        coPurchaseWeight: 1.0,
        categoryWeight: 0.3,
      }
    )

    // 8. Get hybrid recommendations
    const recommendations = hybridGraphRecommendations(
      graph,
      productId,
      limit,
      alpha,
      {
        dampingFactor: 0.85,
        restartProbability: 0.15,
        maxIterations: 50,
        tolerance: 1e-6,
      }
    )

    // 9. Enrich recommendations with product details
    const productMap = new Map<string, ProductRow>(products.map((p) => [p.id, p]))

    const enrichedRecommendations: GraphRecommendation[] = recommendations
      .filter((rec) => productMap.has(rec.productId))
      .map((rec) => {
        const product = productMap.get(rec.productId)!
        return {
          productId: rec.productId,
          name: product.name,
          price: product.price,
          image_url: product.image_url || null,
          images: product.images || [],
          category: product.category || 'General',
          in_stock: product.in_stock,
          score: rec.score,
          rwrProbability: rec.rwrProbability,
          pageRankScore: rec.pageRankScore,
        }
      })

    // 10. Build response
    const response: GraphResponse = {
      success: true,
      productId,
      recommendations: enrichedRecommendations,
      totalProductsAnalyzed: products.length,
      totalEdges: graph.edges.length,
      generatedAt: new Date().toISOString(),
    }

    // 11. Cache the response
    setCachedRecommendations(productId, limit, response)

    // 12. Return response
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300',
        'X-Cache': 'MISS',
        'X-Total-Products': products.length.toString(),
        'X-Total-Edges': graph.edges.length.toString(),
        'X-Recommendations-Count': enrichedRecommendations.length.toString(),
      },
    })

  } catch (error) {
    console.error('[Graph API] Unexpected error:', error)
    
    return NextResponse.json(
      {
        success: false,
        productId: params.productId ?? '',
        recommendations: [],
        totalProductsAnalyzed: 0,
        totalEdges: 0,
        generatedAt: new Date().toISOString(),
        error: 'Internal server error while generating recommendations',
      },
      { status: 500 }
    )
  }
}