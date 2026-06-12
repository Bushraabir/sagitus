// app/api/search/autocomplete/route.ts

/**
 * ============================================================================
 * SEARCH AUTOCOMPLETE API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint provides fast, prefix-based search suggestions using the
 * Trie (Prefix Tree) data structure implemented in File #24.
 * 
 * FEATURES:
 * - Public access (no authentication required)
 * - Builds an in-memory Trie from active product catalog
 * - Supports case-insensitive prefix matching
 * - Filters out-of-stock products by default
 * - Includes category-based suggestions
 * - Optimized for low latency (O(m) search time where m = query length)
 * - Implements short-term caching to prevent redundant Trie rebuilds
 * 
 * USAGE:
 * GET /api/search/autocomplete?q=sh&limit=5
 * GET /api/search/autocomplete?q=accessories&includeCategories=true
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "query": "sh",
 *   "suggestions": [
 *     {
 *       "id": "uuid",
 *       "name": "Shirt",
 *       "category": "Clothing",
 *       "price": 1200,
 *       "image_url": "https://...",
 *       "in_stock": true
 *     }
 *   ],
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { ProductSearchTrie, type TrieNodeData } from '@/lib/search/trie'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutocompleteSuggestion {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null |undefined
  in_stock: boolean
}

interface AutocompleteResponse {
  success: boolean
  query: string
  suggestions: AutocompleteSuggestion[]
  totalProductsIndexed: number
  generatedAt: string
  error?: string
}

// ─── Cache Configuration ───────────────────────────────────────────────────

// Module-level cache for the Trie to avoid rebuilding on every request.
// In a production environment with frequent product updates, this would be 
// replaced by Redis or invalidated via webhooks.
let cachedTrie: ProductSearchTrie | null = null
let cachedProductsCount = 0
let lastCacheTime = 0
const CACHE_TTL = 300_000 // 5 minutes

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fetch all active products from the database
 */
async function fetchActiveProducts(supabase: any): Promise<TrieNodeData[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, price, image_url, in_stock')
    .is('is_deleted', false)
    .eq('in_stock', true) // Only index in-stock products for better UX
    .limit(5000) // Prevent memory issues with massive catalogs

  if (error) {
    console.error('[Search Autocomplete] Error fetching products:', error)
    return []
  }

  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    price: p.price,
    image_url: p.image_url || null,
    in_stock: p.in_stock,
    popularity: 100, // Default popularity; could be enhanced with sales data
  }))
}

/**
 * Get or rebuild the Trie cache
 */
async function getOrBuildTrie(supabase: any): Promise<ProductSearchTrie> {
  const now = Date.now()
  
  // Return cached Trie if still valid
  if (cachedTrie && cachedProductsCount > 0 && (now - lastCacheTime) < CACHE_TTL) {
    return cachedTrie
  }

  // Fetch products and build new Trie
  const products = await fetchActiveProducts(supabase)
  
  const trie = new ProductSearchTrie({
    maxSuggestions: 10,
    minPrefixLength: 2,
    caseSensitive: false,
  })

  trie.addProducts(products)
  
  // Update cache
  cachedTrie = trie
  cachedProductsCount = products.length
  lastCacheTime = now

  return trie
}

// ─── Main API Handler ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // 1. Parse Query Parameters
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''
    const limit = parseInt(searchParams.get('limit') || '8')
    const includeCategories = searchParams.get('includeCategories') === 'true'
    const inStockOnly = searchParams.get('inStockOnly') !== 'false' // Default true

    // Validate parameters
    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        query,
        suggestions: [],
        totalProductsIndexed: cachedProductsCount,
        generatedAt: new Date().toISOString(),
      })
    }

    if (limit < 1 || limit > 20) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 20.' },
        { status: 400 }
      )
    }

    // 2. Initialize Supabase client
    const supabase = await createServerClient()

    // 3. Get Trie (from cache or rebuild)
    const trie = await getOrBuildTrie(supabase)

    // 4. Search the Trie
    const results = trie.search(query, {
      limit,
      includeCategories,
      inStockOnly,
    })

    // 5. Map results to response format
    const suggestions: AutocompleteSuggestion[] = results.map((r) => ({
      id: r.data.id,
      name: r.data.name,
      category: r.data.category || 'General',
      price: (r.data as any).price ?? 0,
      image_url: r.data.image_url,
      in_stock: r.data.in_stock,
    }))

    // 6. Build Response
    const response: AutocompleteResponse = {
      success: true,
      query,
      suggestions,
      totalProductsIndexed: cachedProductsCount,
      generatedAt: new Date().toISOString(),
    }

    // 7. Return response with caching headers
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'X-Total-Indexed': cachedProductsCount.toString(),
        'X-Result-Count': suggestions.length.toString(),
      },
    })

  } catch (error) {
    console.error('[Search Autocomplete] Unexpected error:', error)
    
    return NextResponse.json(
      {
        success: false,
        query: '',
        suggestions: [],
        totalProductsIndexed: 0,
        generatedAt: new Date().toISOString(),
        error: 'Internal server error while processing autocomplete',
      },
      { status: 500 }
    )
  }
}