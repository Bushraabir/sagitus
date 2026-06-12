/**
 * ============================================================================
 * SMART RESTOCK ALERTS API ENDPOINT
 * ============================================================================
 * 
 * This API endpoint calculates and returns smart inventory restocking 
 * recommendations for the admin panel. It uses the statistical inventory 
 * management engine (File #12) to analyze sales velocity, demand variability,
 * and supplier lead times.
 * 
 * FEATURES:
 * - Admin-only authentication
 * - Analyzes last 90 days of fulfilled order history
 * - Calculates Reorder Points, Safety Stock, and EOQ
 * - Classifies urgency (Critical, High, Medium, Low)
 * - Returns financial impact projections (Total Investment, Lost Revenue)
 * 
 * USAGE:
 * GET /api/inventory/restock-alerts
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "recommendations": [...],
 *   "summary": {
 *     "total_cost": 150000,
 *     "total_units": 450,
 *     "critical_items": 3
 *   },
 *   "generatedAt": "timestamp"
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import {
  generateRestockRecommendations,
  calculateTotalRestockInvestment,
  calculateStockoutRiskCost,
  type ProductSalesData,
  type SupplierConfig,
  type RestockConfig,
} from '@/lib/inventory/smartRestocking'

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_RESTOCK_CONFIG: RestockConfig = {
  service_level: 0.95,        // 95% service level (Z = 1.645)
  review_period_days: 7,      // Weekly inventory reviews
  annual_holding_cost_pct: 0.25, // 25% of unit cost per year
  fixed_order_cost: 150,      // 150 average shipping/processing per order
}

// ─── Supplier Lead Time Mapping (by Category) ───────────────────────────────
// In a full system, this would come from a `suppliers` table. 
// For now, we use realistic defaults based on product categories in Bangladesh.

const CATEGORY_LEAD_TIMES: Record<string, number> = {
  'Accessories': 10,
  'Clothing': 14,
  'Electronics': 21,
  'Home': 18,
  'Beauty': 12,
  'General': 14,
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

    // 2. Fetch all active products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, category, price, stock_quantity, in_stock, cost_price')
      .is('is_deleted', false)
      .order('stock_quantity', { ascending: true })

    if (productsError) {
      console.error('[Restock API] Error fetching products:', productsError)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        recommendations: [],
        summary: { total_cost: 0, total_units: 0, critical_items: 0 },
        generatedAt: new Date().toISOString(),
      })
    }

    // 3. Fetch historical order items (last 90 days for sales velocity)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('product_id, quantity, created_at, orders!inner(status, created_at)')
      .eq('orders.status', 'fulfilled')
      .gte('orders.created_at', ninetyDaysAgo.toISOString())

    if (itemsError) {
      console.error('[Restock API] Error fetching order items:', itemsError)
      return NextResponse.json({ error: 'Failed to fetch order history' }, { status: 500 })
    }

    // 4. Build Sales History Map
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

    // 5. Build ProductSalesData Array
    const productSalesData: ProductSalesData[] = products.map((product: any) => ({
      product_id: product.id,
      product_name: product.name,
      current_stock: product.stock_quantity ?? 0,
      unit_cost: product.cost_price ?? product.price * 0.6, // Estimate cost if missing
      daily_sales_history: productSalesMap.get(product.id) ?? [],
    }))

    // 6. Build SupplierConfig Map
    const suppliers = new Map<string, SupplierConfig>()
    
    productSalesData.forEach((product) => {
      // Find original product to get category
      const originalProduct = products.find(p => p.id === product.product_id)
      const category = originalProduct?.category ?? 'General'
      
      suppliers.set(product.product_id, {
        product_id: product.product_id,
        lead_time_days: CATEGORY_LEAD_TIMES[category] ?? 14,
        order_cost: DEFAULT_RESTOCK_CONFIG.fixed_order_cost,
        min_order_quantity: 10,
      })
    })

    // 7. Generate Recommendations
    const recommendations = generateRestockRecommendations(
      productSalesData,
      suppliers,
      DEFAULT_RESTOCK_CONFIG
    )

    // 8. Calculate Financial Summaries
    const investmentSummary = calculateTotalRestockInvestment(recommendations)
    
    // Estimate average selling price for stockout risk calculation
    const avgSellingPrice = products.reduce((sum, p) => sum + p.price, 0) / products.length
    const potentialLostRevenue = calculateStockoutRiskCost(recommendations, avgSellingPrice)

    // 9. Build Response
    return NextResponse.json({
      success: true,
      recommendations,
      summary: {
        ...investmentSummary,
        potential_lost_revenue: potentialLostRevenue,
        total_products_analyzed: products.length,
        service_level: DEFAULT_RESTOCK_CONFIG.service_level,
      },
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Restock API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while calculating restock alerts.',
      },
      { status: 500 }
    )
  }
}