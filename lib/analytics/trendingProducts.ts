// lib/analytics/trendingProducts.ts

/**
 * ============================================================================
 * TRENDING PRODUCTS DETECTION - Exponential Moving Average (EMA)
 * ============================================================================
 * 
 * This module identifies trending products by analyzing sales velocity over
 * recent time periods using Exponential Moving Average (EMA) calculations.
 * 
 * The EMA gives more weight to recent sales data, making it highly responsive
 * to sudden spikes in demand (viral products, flash sales, seasonal trends).
 * 
 * KEY ALGORITHMS:
 * 
 * 1. Exponential Moving Average (EMA):
 *    EMA_today = (Value_today × k) + (EMA_yesterday × (1 - k))
 *    Where k = 2 / (N + 1) is the smoothing factor
 *    
 * 2. Trend Score Calculation:
 *    trend_score = 0.7 × (today_sales) + 0.2 × (yesterday_sales) + 0.1 × (2_days_ago_sales)
 *    
 *    This weighted formula emphasizes recent performance while still considering
 *    the short-term trajectory.
 * 
 * 3. Trend Classification:
 *    - HOT: Trend score > 2× average, EMA rising sharply
 *    - TRENDING: Trend score > 1.5× average, EMA rising
 *    - STABLE: Trend score near average, EMA flat
 *    - DECLINING: Trend score < average, EMA falling
 * 
 * USAGE:
 * const trending = detectTrendingProducts(salesHistory, products, { days: 7 });
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface DailySales {
  date: string // ISO date string (YYYY-MM-DD)
  product_id: string
  quantity_sold: number
  revenue: number
}

export interface ProductTrend {
  product_id: string
  product_name: string
  category: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
  
  // Sales metrics
  today_sales: number
  yesterday_sales: number
  two_days_ago_sales: number
  seven_day_total: number
  thirty_day_total: number
  
  // Trend calculations
  trend_score: number
  ema_3day: number
  ema_7day: number
  trend_velocity: number // Rate of change
  
  // Classification
  trend_status: 'HOT' | 'TRENDING' | 'STABLE' | 'DECLINING'
  trend_rank: number
  
  // Insights
  growth_percentage: number
  days_in_trend: number
  peak_sales_day: string
}

export interface TrendingConfig {
  daysToAnalyze: number // Default: 7
  emaPeriod: number // Default: 3
  hotThreshold: number // Default: 2.0 (2x average)
  trendingThreshold: number // Default: 1.5
  minSalesForTrend: number // Default: 3
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Calculate Exponential Moving Average (EMA)
 * 
 * Formula: EMA = (Value × k) + (EMA_prev × (1 - k))
 * Where k = 2 / (period + 1)
 * 
 * @param values - Array of numerical values (most recent last)
 * @param period - EMA period (e.g., 3 for 3-day EMA)
 * @returns The most recent EMA value
 */
export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  
  const k = 2 / (period + 1)
  
  // Initialize EMA with SMA of first 'period' values
  let ema = values.slice(0, period).reduce((sum, val) => sum + val, 0) / Math.min(period, values.length)
  
  // Calculate EMA for remaining values
  for (let i = period; i < values.length; i++) {
    ema = (values[i] * k) + (ema * (1 - k))
  }
  
  return ema
}

/**
 * Calculate Trend Score using weighted recent sales
 * 
 * Formula: trend_score = 0.7(today) + 0.2(yesterday) + 0.1(2_days_ago)
 * 
 * This heavily weights today's performance while still considering
 * the short-term trajectory to detect momentum.
 * 
 * @param today - Sales today
 * @param yesterday - Sales yesterday
 * @param twoDaysAgo - Sales 2 days ago
 * @returns Weighted trend score
 */
export function calculateTrendScore(
  today: number,
  yesterday: number,
  twoDaysAgo: number
): number {
  return (0.7 * today) + (0.2 * yesterday) + (0.1 * twoDaysAgo)
}

/**
 * Calculate growth percentage between two values
 */
export function calculateGrowthPercentage(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/**
 * Get date string N days ago from a reference date
 */
export function getDaysAgoDate(daysAgo: number, referenceDate: Date = new Date()): string {
  const date = new Date(referenceDate)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().split('T')[0]
}

// ─── Core Trending Detection ────────────────────────────────────────────────

/**
 * Detect trending products from sales history
 * 
 * @param salesHistory - Array of daily sales records
 * @param products - Product catalog
 * @param config - Trending detection configuration
 * @returns Array of products sorted by trend score
 */
export function detectTrendingProducts(
  salesHistory: DailySales[],
  products: Array<{
    id: string
    name: string
    category: string
    price: number
    image_url: string | null
    images: string[]
    in_stock: boolean
  }>,
  config: Partial<TrendingConfig> = {}
): ProductTrend[] {
  const cfg: TrendingConfig = {
    daysToAnalyze: config.daysToAnalyze ?? 7,
    emaPeriod: config.emaPeriod ?? 3,
    hotThreshold: config.hotThreshold ?? 2.0,
    trendingThreshold: config.trendingThreshold ?? 1.5,
    minSalesForTrend: config.minSalesForTrend ?? 3,
  }
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  // Build product sales map
  const productSalesMap = new Map<string, DailySales[]>()
  
  salesHistory.forEach((sale) => {
    if (!productSalesMap.has(sale.product_id)) {
      productSalesMap.set(sale.product_id, [])
    }
    productSalesMap.get(sale.product_id)!.push(sale)
  })
  
  // Calculate metrics for each product
  const trends: ProductTrend[] = []
  
  products.forEach((product) => {
    const sales = productSalesMap.get(product.id) ?? []
    
    // Sort sales by date (most recent first)
    sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    
    // Get sales for specific days
    const todaySales = sales.find((s) => s.date === todayStr)?.quantity_sold ?? 0
    const yesterdaySales = sales.find((s) => s.date === getDaysAgoDate(1))?.quantity_sold ?? 0
    const twoDaysAgoSales = sales.find((s) => s.date === getDaysAgoDate(2))?.quantity_sold ?? 0
    
    // Calculate 7-day and 30-day totals
    const sevenDayCutoff = getDaysAgoDate(7)
    const thirtyDayCutoff = getDaysAgoDate(30)
    
    const sevenDayTotal = sales
      .filter((s) => s.date >= sevenDayCutoff)
      .reduce((sum, s) => sum + s.quantity_sold, 0)
    
    const thirtyDayTotal = sales
      .filter((s) => s.date >= thirtyDayCutoff)
      .reduce((sum, s) => sum + s.quantity_sold, 0)
    
    // Calculate trend score
    const trendScore = calculateTrendScore(todaySales, yesterdaySales, twoDaysAgoSales)
    
    // Calculate EMAs
    const recentSales = sales
      .slice(0, cfg.daysToAnalyze)
      .map((s) => s.quantity_sold)
      .reverse() // Most recent last for EMA calculation
    
    const ema3day = calculateEMA(recentSales, Math.min(3, recentSales.length))
    const ema7day = calculateEMA(recentSales, Math.min(7, recentSales.length))
    
    // Calculate trend velocity (rate of change)
    const trendVelocity = recentSales.length >= 2
      ? (recentSales[recentSales.length - 1] - recentSales[0]) / recentSales.length
      : 0
    
    // Calculate growth percentage (7-day vs previous 7-day)
    const previousSevenDayCutoff = getDaysAgoDate(14)
    const previousSevenDayTotal = sales
      .filter((s) => s.date >= previousSevenDayCutoff && s.date < sevenDayCutoff)
      .reduce((sum, s) => sum + s.quantity_sold, 0)
    
    const growthPercentage = calculateGrowthPercentage(sevenDayTotal, previousSevenDayTotal)
    
    // Find peak sales day
    const peakDay = sales.length > 0
      ? sales.reduce((max, s) => s.quantity_sold > max.quantity_sold ? s : max).date
      : todayStr
    
    // Classify trend status
    const avgDailySales = thirtyDayTotal / 30
    let trendStatus: ProductTrend['trend_status'] = 'STABLE'
    
    if (trendScore >= avgDailySales * cfg.hotThreshold && trendVelocity > 0) {
      trendStatus = 'HOT'
    } else if (trendScore >= avgDailySales * cfg.trendingThreshold && trendVelocity > 0) {
      trendStatus = 'TRENDING'
    } else if (trendVelocity < -0.5) {
      trendStatus = 'DECLINING'
    }
    
    // Calculate days in trend (consecutive days with above-average sales)
    let daysInTrend = 0
    for (const sale of sales) {
      if (sale.quantity_sold > avgDailySales) {
        daysInTrend++
      } else {
        break
      }
    }
    
    trends.push({
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      price: product.price,
      image_url: product.image_url,
      images: product.images,
      in_stock: product.in_stock,
      
      today_sales: todaySales,
      yesterday_sales: yesterdaySales,
      two_days_ago_sales: twoDaysAgoSales,
      seven_day_total: sevenDayTotal,
      thirty_day_total: thirtyDayTotal,
      
      trend_score: trendScore,
      ema_3day: ema3day,
      ema_7day: ema7day,
      trend_velocity: trendVelocity,
      
      trend_status: trendStatus,
      trend_rank: 0, // Will be assigned after sorting
      growth_percentage: growthPercentage,
      days_in_trend: daysInTrend,
      peak_sales_day: peakDay,
    })
  })
  
  // Sort by trend score (descending) and assign ranks
  trends.sort((a, b) => b.trend_score - a.trend_score)
  trends.forEach((trend, index) => {
    trend.trend_rank = index + 1
  })
  
  // Filter out products with insufficient sales
  return trends.filter((t) => t.seven_day_total >= cfg.minSalesForTrend)
}

/**
 * Get only HOT and TRENDING products
 * 
 * @param trends - All product trends
 * @param limit - Maximum number of products to return
 * @returns Filtered and limited trending products
 */
export function getHotAndTrending(
  trends: ProductTrend[],
  limit: number = 10
): ProductTrend[] {
  return trends
    .filter((t) => t.trend_status === 'HOT' || t.trend_status === 'TRENDING')
    .slice(0, limit)
}

/**
 * Get trending products by category
 * 
 * @param trends - All product trends
 * @param category - Category to filter by
 * @param limit - Maximum number of products to return
 * @returns Trending products in the specified category
 */
export function getTrendingByCategory(
  trends: ProductTrend[],
  category: string,
  limit: number = 5
): ProductTrend[] {
  return trends
    .filter((t) => t.category === category)
    .slice(0, limit)
}

/**
 * Calculate overall store trend metrics
 * 
 * @param trends - All product trends
 * @returns Aggregate trend statistics
 */
export function getStoreTrendMetrics(trends: ProductTrend[]) {
  const hotCount = trends.filter((t) => t.trend_status === 'HOT').length
  const trendingCount = trends.filter((t) => t.trend_status === 'TRENDING').length
  const stableCount = trends.filter((t) => t.trend_status === 'STABLE').length
  const decliningCount = trends.filter((t) => t.trend_status === 'DECLINING').length
  
  const avgTrendScore = trends.length > 0
    ? trends.reduce((sum, t) => sum + t.trend_score, 0) / trends.length
    : 0
  
  const avgGrowth = trends.length > 0
    ? trends.reduce((sum, t) => sum + t.growth_percentage, 0) / trends.length
    : 0
  
  const totalSevenDaySales = trends.reduce((sum, t) => sum + t.seven_day_total, 0)
  const totalThirtyDaySales = trends.reduce((sum, t) => sum + t.thirty_day_total, 0)
  
  return {
    hot_count: hotCount,
    trending_count: trendingCount,
    stable_count: stableCount,
    declining_count: decliningCount,
    avg_trend_score: avgTrendScore,
    avg_growth_percentage: avgGrowth,
    total_seven_day_sales: totalSevenDaySales,
    total_thirty_day_sales: totalThirtyDaySales,
    store_momentum: avgGrowth > 10 ? 'GROWING' : avgGrowth < -10 ? 'DECLINING' : 'STABLE',
  }
}

/**
 * Detect sudden viral spikes (products with >300% growth in 24h)
 * 
 * @param trends - All product trends
 * @param spikeThreshold: number - Growth percentage threshold (default: 300)
 * @returns Products experiencing viral growth
 */
export function detectViralSpikes(
  trends: ProductTrend[],
  spikeThreshold: number = 300
): ProductTrend[] {
  return trends.filter((t) => {
    const yesterdayGrowth = t.yesterday_sales > 0
      ? ((t.today_sales - t.yesterday_sales) / t.yesterday_sales) * 100
      : t.today_sales > 0 ? 100 : 0
    
    return yesterdayGrowth >= spikeThreshold && t.today_sales >= 5
  })
}

/**
 * Predict next-day sales using EMA trend
 * 
 * @param trend - Product trend data
 * @returns Predicted sales for tomorrow
 */
export function predictNextDaySales(trend: ProductTrend): number {
  // Use EMA and velocity to predict
  const predicted = trend.ema_3day + (trend.trend_velocity * 0.5)
  return Math.max(0, Math.round(predicted))
}