// lib/inventory/smartRestocking.ts

/**
 * ============================================================================
 * SMART INVENTORY RESTOCKING & PREDICTION SYSTEM
 * ============================================================================
 * 
 * This module implements advanced inventory management algorithms to predict
 * stock-outs and calculate optimal restock quantities. It uses statistical
 * modeling to account for demand variability and supplier lead times.
 * 
 * KEY ALGORITHMS & FORMULAS:
 * 
 * 1. Reorder Point (ROP):
 *    The inventory level at which a new order should be placed.
 *    ROP = Lead Time Demand + Safety Stock
 * 
 * 2. Lead Time Demand (LTD):
 *    Expected demand during the supplier's delivery period.
 *    LTD = Average Daily Sales × Lead Time (days)
 * 
 * 3. Safety Stock (SS):
 *    Buffer stock to protect against demand variability and lead time fluctuations.
 *    SS = Z-score × σ_d × √(Lead Time)
 *    Where:
 *    - Z-score: Statistical multiplier for desired service level (e.g., 1.65 for 95%)
 *    - σ_d: Standard deviation of daily sales (demand variability)
 *    - Lead Time: Supplier delivery time in days
 * 
 * 4. Economic Order Quantity (EOQ):
 *    The ideal order quantity a company should purchase to minimize inventory costs.
 *    EOQ = √((2 × D × S) / H)
 *    Where:
 *    - D: Annual demand (units)
 *    - S: Fixed cost per order (shipping, processing)
 *    - H: Annual holding cost per unit
 * 
 * 5. Target Stock Level (Order-Up-To Level):
 *    The maximum inventory level to aim for after restocking.
 *    Target = ROP + (Average Daily Sales × Review Period)
 * 
 * USAGE:
 * const recommendations = generateRestockRecommendations(products, salesHistory, suppliers);
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface DailySalesRecord {
  date: string // ISO date string (YYYY-MM-DD)
  quantity_sold: number
}

export interface ProductSalesData {
  product_id: string
  product_name: string
  current_stock: number
  unit_cost: number // Cost price per unit
  daily_sales_history: DailySalesRecord[] // Last 30-90 days of sales
}

export interface SupplierConfig {
  product_id: string
  lead_time_days: number // Average days from order to delivery
  order_cost: number // Fixed cost per order (shipping, admin)
  min_order_quantity: number // Supplier's minimum order requirement
}

export interface HoldingCostConfig {
  annual_holding_cost_percentage: number // e.g., 0.25 for 25% of unit cost
  service_level: number // e.g., 0.95 for 95% service level
  review_period_days: number // Days between inventory reviews (e.g., 7 for weekly)
}

export interface RestockRecommendation {
  product_id: string
  product_name: string
  current_stock: number
  reorder_point: number
  safety_stock: number
  lead_time_demand: number
  recommended_order_quantity: number
  eoq: number // Economic Order Quantity
  days_until_stockout: number
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'none'
  estimated_cost: number
  reasoning: string
}

export interface RestockConfig {
  service_level: number // 0.0 to 1.0 (e.g., 0.95 = 95% service level)
  review_period_days: number
  annual_holding_cost_pct: number // e.g., 0.25 = 25%
  fixed_order_cost: number // Default fixed cost if not specified per supplier
}

// ─── Z-Score Lookup Table ───────────────────────────────────────────────────

/**
 * Standard normal distribution Z-scores for common service levels.
 * Maps a desired service level (probability of not stocking out) to its Z-score.
 */
const Z_SCORE_TABLE: Record<number, number> = {
  0.50: 0.000,
  0.75: 0.674,
  0.80: 0.842,
  0.85: 1.036,
  0.90: 1.282,
  0.95: 1.645,
  0.97: 1.881,
  0.98: 2.054,
  0.99: 2.326,
  0.995: 2.576,
  0.999: 3.090,
}

/**
 * Get the Z-score for a given service level.
 * Falls back to the closest available Z-score if exact match isn't found.
 */
function getZScore(serviceLevel: number): number {
  // Clamp between 0.5 and 0.999
  const clamped = Math.max(0.5, Math.min(0.999, serviceLevel))
  
  // Exact match
  if (Z_SCORE_TABLE[clamped]) return Z_SCORE_TABLE[clamped]
  
  // Find closest match
  const keys = Object.keys(Z_SCORE_TABLE).map(Number).sort((a, b) => a - b)
  let closest = keys[0]
  let minDiff = Math.abs(clamped - closest)
  
  for (const key of keys) {
    const diff = Math.abs(clamped - key)
    if (diff < minDiff) {
      minDiff = diff
      closest = key
    }
  }
  
  return Z_SCORE_TABLE[closest]
}

// ─── Statistical Helper Functions ───────────────────────────────────────────

/**
 * Calculate the arithmetic mean (average) of an array of numbers.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate the standard deviation of an array of numbers.
 * Uses population standard deviation formula.
 * σ = (Σ(x - μ)² / N)
 */
function standardDeviation(values: number[], avg?: number): number {
  if (values.length === 0) return 0
  const mu = avg ?? mean(values)
  const squaredDiffs = values.map(val => Math.pow(val - mu, 2))
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
  return Math.sqrt(variance)
}

// ─── Core Inventory Algorithms ──────────────────────────────────────────────

/**
 * Calculate Average Daily Sales (ADS) from historical data.
 * Handles gaps in data by dividing total sales by total days in history.
 */
export function calculateAverageDailySales(history: DailySalesRecord[]): number {
  if (history.length === 0) return 0
  
  const totalSold = history.reduce((sum, record) => sum + record.quantity_sold, 0)
  
  // Calculate actual time span in days
  const dates = history.map(r => new Date(r.date).getTime()).sort((a, b) => a - b)
  const daysSpan = Math.max(1, Math.ceil((dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)) + 1)
  
  return totalSold / daysSpan
}

/**
 * Calculate the standard deviation of daily sales (σ_d).
 * This measures demand variability, crucial for safety stock calculations.
 */
export function calculateDemandVariability(history: DailySalesRecord[]): number {
  if (history.length === 0) return 0
  const dailyQuantities = history.map(r => r.quantity_sold)
  return standardDeviation(dailyQuantities)
}

/**
 * Calculate Lead Time Demand (LTD).
 * The expected number of units sold while waiting for a supplier delivery.
 * LTD = Average Daily Sales × Lead Time (days)
 */
export function calculateLeadTimeDemand(
  avgDailySales: number,
  leadTimeDays: number
): number {
  return avgDailySales * leadTimeDays
}

/**
 * Calculate Safety Stock (SS).
 * Buffer inventory to protect against demand spikes during lead time.
 * SS = Z-score × σ_d × √(Lead Time)
 */
export function calculateSafetyStock(
  serviceLevel: number,
  demandStdDev: number,
  leadTimeDays: number
): number {
  const zScore = getZScore(serviceLevel)
  // If lead time is 0 or 1, sqrt is 1. We use max(1, ...) to avoid 0.
  const leadTimeFactor = Math.sqrt(Math.max(1, leadTimeDays))
  return zScore * demandStdDev * leadTimeFactor
}

/**
 * Calculate Reorder Point (ROP).
 * The inventory level that triggers a new purchase order.
 * ROP = Lead Time Demand + Safety Stock
 */
export function calculateReorderPoint(
  avgDailySales: number,
  leadTimeDays: number,
  serviceLevel: number,
  demandStdDev: number
): number {
  const ltd = calculateLeadTimeDemand(avgDailySales, leadTimeDays)
  const ss = calculateSafetyStock(serviceLevel, demandStdDev, leadTimeDays)
  return Math.ceil(ltd + ss) // Round up to ensure we don't under-order
}

/**
 * Calculate Economic Order Quantity (EOQ).
 * The optimal order size that minimizes total inventory costs (ordering + holding).
 * EOQ = √((2 × D × S) / H)
 * 
 * @param annualDemand - Total units sold per year
 * @param orderCost - Fixed cost per order (shipping, processing)
 * @param holdingCostPerUnit - Annual cost to hold one unit in inventory
 */
export function calculateEOQ(
  annualDemand: number,
  orderCost: number,
  holdingCostPerUnit: number
): number {
  if (holdingCostPerUnit <= 0 || orderCost <= 0) return 0
  
  const numerator = 2 * annualDemand * orderCost
  const denominator = holdingCostPerUnit
  
  return Math.round(Math.sqrt(numerator / denominator))
}

/**
 * Calculate days until current stock runs out based on average sales velocity.
 */
export function calculateDaysUntilStockout(
  currentStock: number,
  avgDailySales: number
): number {
  if (avgDailySales <= 0) return 999 // Effectively infinite
  return Math.floor(currentStock / avgDailySales)
}

// ─── Main Recommendation Engine ─────────────────────────────────────────────

/**
 * Generate smart restock recommendations for a list of products.
 * 
 * This function analyzes sales history, supplier lead times, and desired
 * service levels to determine which products need restocking and in what
 * quantities.
 * 
 * @param products - Array of products with current stock and sales history
 * @param suppliers - Map of product_id to supplier configuration
 * @param config - Global inventory configuration (service level, holding costs, etc.)
 * @returns Array of RestockRecommendation objects sorted by urgency
 */
export function generateRestockRecommendations(
  products: ProductSalesData[],
  suppliers: Map<string, SupplierConfig>,
  config: RestockConfig
): RestockRecommendation[] {
  const recommendations: RestockRecommendation[] = []
  const zScore = getZScore(config.service_level)

  for (const product of products) {
    // 1. Calculate sales metrics
    const avgDailySales = calculateAverageDailySales(product.daily_sales_history)
    const demandStdDev = calculateDemandVariability(product.daily_sales_history)
    const annualDemand = avgDailySales * 365
    
    // 2. Get supplier config (use defaults if not found)
    const supplier = suppliers.get(product.product_id) ?? {
      product_id: product.product_id,
      lead_time_days: 14, // Default 2 weeks
      order_cost: config.fixed_order_cost,
      min_order_quantity: 10,
    }

    // 3. Calculate holding cost per unit per year
    const holdingCostPerUnit = product.unit_cost * config.annual_holding_cost_pct

    // 4. Calculate core inventory metrics
    const leadTimeDemand = calculateLeadTimeDemand(avgDailySales, supplier.lead_time_days)
    const safetyStock = calculateSafetyStock(config.service_level, demandStdDev, supplier.lead_time_days)
    const reorderPoint = calculateReorderPoint(avgDailySales, supplier.lead_time_days, config.service_level, demandStdDev)
    const daysUntilStockout = calculateDaysUntilStockout(product.current_stock, avgDailySales)

    // 5. Calculate Economic Order Quantity (EOQ)
    const eoq = calculateEOQ(annualDemand, supplier.order_cost, holdingCostPerUnit)

    // 6. Determine if restock is needed
    const needsRestock = product.current_stock <= reorderPoint
    
    // 7. Calculate recommended order quantity
    let recommendedQty = 0
    let reasoning = ''
    
    if (needsRestock) {
      // Target stock level: Cover lead time + review period + safety stock
      const targetStockLevel = reorderPoint + (avgDailySales * config.review_period_days)
      const deficit = targetStockLevel - product.current_stock
      
      // Use the maximum of EOQ or the deficit to ensure cost efficiency
      recommendedQty = Math.max(eoq, deficit, supplier.min_order_quantity)
      
      // Round up to nearest min_order_quantity multiple
      if (supplier.min_order_quantity > 1) {
        recommendedQty = Math.ceil(recommendedQty / supplier.min_order_quantity) * supplier.min_order_quantity
      }

      reasoning = `Stock (${product.current_stock}) is below Reorder Point (${reorderPoint}). ` +
                  `Lead time demand is ${leadTimeDemand.toFixed(1)} units. ` +
                  `Safety stock buffer is ${safetyStock.toFixed(1)} units (Z=${zScore}).`
    } else {
      // Even if not urgent, suggest EOQ for cost optimization if stock is getting low
      const bufferDays = daysUntilStockout - supplier.lead_time_days
      if (bufferDays <= config.review_period_days && avgDailySales > 0) {
        recommendedQty = Math.max(eoq, supplier.min_order_quantity)
        reasoning = `Stock is healthy but approaching review threshold. EOQ suggests ordering ${eoq} units for cost efficiency.`
      } else {
        reasoning = `Stock is healthy. No immediate action required.`
      }
    }

    // 8. Determine urgency level
    let urgency: RestockRecommendation['urgency'] = 'none'
    if (needsRestock) {
      if (daysUntilStockout <= supplier.lead_time_days) {
        urgency = 'critical' // Will stock out before new order arrives!
      } else if (daysUntilStockout <= supplier.lead_time_days + 7) {
        urgency = 'high'
      } else if (daysUntilStockout <= supplier.lead_time_days + 14) {
        urgency = 'medium'
      } else {
        urgency = 'low'
      }
    }

    // 9. Calculate estimated cost
    const estimatedCost = recommendedQty * product.unit_cost

    recommendations.push({
      product_id: product.product_id,
      product_name: product.product_name,
      current_stock: product.current_stock,
      reorder_point: Math.round(reorderPoint),
      safety_stock: Math.round(safetyStock),
      lead_time_demand: Math.round(leadTimeDemand),
      recommended_order_quantity: recommendedQty,
      eoq: Math.round(eoq),
      days_until_stockout: daysUntilStockout,
      urgency,
      estimated_cost: estimatedCost,
      reasoning,
    })
  }

  // Sort by urgency (critical first), then by days until stockout
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
  recommendations.sort((a, b) => {
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    }
    return a.days_until_stockout - b.days_until_stockout
  })

  return recommendations
}

/**
 * Calculate the total investment required for a list of restock recommendations.
 */
export function calculateTotalRestockInvestment(
  recommendations: RestockRecommendation[]
): { total_cost: number; total_units: number; critical_items: number } {
  let total_cost = 0
  let total_units = 0
  let critical_items = 0

  for (const rec of recommendations) {
    if (rec.urgency !== 'none' && rec.recommended_order_quantity > 0) {
      total_cost += rec.estimated_cost
      total_units += rec.recommended_order_quantity
      if (rec.urgency === 'critical') critical_items++
    }
  }

  return { total_cost, total_units, critical_items }
}

/**
 * Simulate the financial impact of not restocking critical items.
 * Calculates potential lost revenue based on stockout duration.
 */
export function calculateStockoutRiskCost(
  recommendations: RestockRecommendation[],
  avg_selling_price: number // Average selling price per unit
): number {
  let total_lost_revenue = 0

  for (const rec of recommendations) {
    if (rec.urgency === 'critical' || rec.urgency === 'high') {
      // Estimate days out of stock if we don't order
      const days_out = Math.max(0, rec.days_until_stockout - 14) // Assume 14 day lead time
      // Lost sales = days out * daily demand * selling price
      // We approximate daily demand from lead_time_demand / 14
      const daily_demand = rec.lead_time_demand / 14
      total_lost_revenue += days_out * daily_demand * avg_selling_price
    }
  }

  return total_lost_revenue
}
