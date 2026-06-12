/**
 * ============================================================================
 * CUSTOMER SEGMENTATION API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint provides K-Means clustering-based customer segmentation.
 * It analyzes customer purchasing behavior to divide them into 5 distinct segments:
 * VIP, Loyal, Normal, High Risk, and Fake Orders.
 * 
 * FEATURES:
 * - Admin-only authentication
 * - Fetches 12 months of fulfilled order history
 * - Prepares customer metrics (Total Spent, Frequency, Variance)
 * - Runs K-Means clustering algorithm
 * - Returns segmented customers with confidence scores and discount recommendations
 * - Provides category-specific discount recommendations based on affinity lift
 * 
 * USAGE:
 * GET /api/analytics/customer-segments?limit=50
 * GET /api/analytics/customer-segments?segment=VIP
 * GET /api/analytics/customer-segments?includeRecommendations=true
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "segments": [...],
 *   "summary": {...},
 *   "recommendations": [...],
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import {
  segmentCustomers,
  prepareCustomerMetrics,
  generateSegmentSummary,
  recommendCategoryDiscounts,
  type CustomerSegment,
  type SegmentType,
} from '@/lib/analytics/customerSegmentation'

// ── Main API Handler ───────────────────────────────────────────────────────

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
    const limit = parseInt(searchParams.get('limit') || '100')
    const segmentFilter = searchParams.get('segment') as SegmentType | null
    const includeRecommendations = searchParams.get('includeRecommendations') === 'true'

    // Validate parameters
    if (limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 500.' },
        { status: 400 }
      )
    }

    // 3. Fetch Historical Orders (Last 12 Months)
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, user_id, total, created_at')
      .eq('status', 'fulfilled')
      .gte('created_at', twelveMonthsAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000) // Limit to prevent memory issues

    if (ordersError) {
      console.error('[Customer Segments API] Error fetching orders:', ordersError)
      return NextResponse.json(
        { error: 'Failed to fetch order history' },
        { status: 500 }
      )
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        success: true,
        segments: [],
        summary: [],
        recommendations: [],
        totalCustomers: 0,
        generatedAt: new Date().toISOString(),
      })
    }

    // 4. Prepare Customer Metrics
    const rawOrders = orders.map((o: any) => ({
      user_id: o.user_id,
      total: o.total,
      created_at: o.created_at,
    }))

    const customerMetrics = prepareCustomerMetrics(rawOrders)

    // 5. Run K-Means Clustering
    const segments = segmentCustomers(customerMetrics, {
      k: 5,
      maxIterations: 100,
      tolerance: 0.0001,
    })

    // 6. Apply Segment Filter if Provided
    let filteredSegments = segments
    if (segmentFilter) {
      filteredSegments = segments.filter((s) => s.segment === segmentFilter)
    }

    // 7. Limit Results
    const limitedSegments = filteredSegments.slice(0, limit)

    // 8. Generate Segment Summaries
    const summaries = generateSegmentSummary(segments)

    // 9. Fetch Customer Profiles for Enrichment
    const userIds = limitedSegments.map((s) => s.user_id)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    if (profilesError) {
      console.error('[Customer Segments API] Error fetching profiles:', profilesError)
    }

    // 10. Enrich Segments with Profile Data
    const profileMap = new Map<string, { name: string; email: string }>()
    ;(profiles ?? []).forEach((p: any) => {
      profileMap.set(p.id, {
        name: p.full_name ?? 'Anonymous',
        email: p.email ?? 'No email',
      })
    })

    const enrichedSegments = limitedSegments.map((seg) => ({
      ...seg,
      customer_name: profileMap.get(seg.user_id)?.name ?? 'Anonymous',
      customer_email: profileMap.get(seg.user_id)?.email ?? 'No email',
    }))

    // 11. Generate Category Discount Recommendations (Optional)
    let recommendations: Array<{
      segment: SegmentType
      category: string
      recommended_discount: number
      reasoning: string
    }> = []

    if (includeRecommendations) {
      // Mock global category sales data (in production, fetch from order_items + products)
      const globalCategorySales: Record<string, number> = {
        'Accessories': 45000,
        'Clothing': 120000,
        'Electronics': 85000,
        'Home': 32000,
        'Beauty': 28000,
      }
      const allCategories = Object.keys(globalCategorySales)

      recommendations = recommendCategoryDiscounts(
        segments,
        allCategories,
        globalCategorySales
      )
    }

    // 12. Build Response
    return NextResponse.json({
      success: true,
      segments: enrichedSegments,
      summary: summaries,
      recommendations,
      totalCustomers: segments.length,
      filteredCount: enrichedSegments.length,
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Customer Segments API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while generating customer segments.',
      },
      { status: 500 }
    )
  }
}