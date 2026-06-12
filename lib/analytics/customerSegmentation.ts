// lib/analytics/customerSegmentation.ts

/**
 * ============================================================================
 * CUSTOMER SEGMENTATION - K-MEANS CLUSTERING
 * ============================================================================
 * 
 * This module implements a K-Means clustering algorithm to segment customers
 * based on their purchasing behavior. It analyzes three key features:
 * 1. Total Spent (Monetary value)
 * 2. Order Frequency (How often they buy)
 * 3. Order Redundancy/Variance (Detects bots or fake orders)
 * 
 * The algorithm automatically assigns customers to one of five segments:
 * - VIP: High spenders, frequent buyers
 * - Loyal: Consistent buyers, good lifetime value
 * - Normal: Average purchasing behavior
 * - High Risk: Declining engagement, churn risk
 * - Fake Orders: Abnormal patterns (bots, fraud, or testing)
 * 
 * MATHEMATICAL FOUNDATION:
 * - K-Means: Iteratively assigns points to nearest centroid and updates centroids
 *   until convergence. Uses Euclidean distance in 3D feature space.
 * - Feature Normalization: Min-Max scaling ensures all features contribute equally.
 * 
 * USAGE:
 * const segments = segmentCustomers(customerData, k=5);
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface CustomerMetrics {
  user_id: string
  total_spent: number
  order_count: number
  avg_order_value: number
  days_since_last_order: number
  order_variance: number // Variance in order values (low = suspicious)
  category_preferences: Record<string, number> // Category -> purchase count
}

export type SegmentType = 'VIP' | 'Loyal' | 'Normal' | 'High Risk' | 'Fake Orders'

export interface CustomerSegment {
  user_id: string
  segment: SegmentType
  total_spent: number
  order_count: number
  confidence_score: number // 0 to 1, how well they fit the segment
  recommended_discount: number // Suggested discount % for retention
  top_category: string
}

export interface SegmentSummary {
  segment: SegmentType
  count: number
  avg_spent: number
  avg_orders: number
  total_revenue: number
  recommended_action: string
}

export interface KMeansConfig {
  k: number // Number of clusters (default: 5)
  maxIterations: number
  tolerance: number // Convergence threshold
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Calculate Euclidean distance between two 3D points
 */
function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2)
  )
}

/**
 * Min-Max normalization to scale features between 0 and 1
 */
function normalizeFeatures(
  data: number[][],
  min: number[],
  max: number[]
): number[][] {
  return data.map((row) =>
    row.map((val, i) => {
      const range = max[i] - min[i]
      return range === 0 ? 0 : (val - min[i]) / range
    })
  )
}

/**
 * Initialize centroids using K-Means++ algorithm for better convergence
 */
function initializeCentroidsKMeansPlusPlus(
  data: number[][],
  k: number
): number[][] {
  const centroids: number[][] = []
  const n = data.length

  // 1. Choose first centroid randomly
  const firstIdx = Math.floor(Math.random() * n)
  centroids.push([...data[firstIdx]])

  // 2. Choose remaining centroids
  for (let c = 1; c < k; c++) {
    // Calculate distances to nearest existing centroid
    const distances = data.map((point) => {
      let minDist = Infinity
      for (const centroid of centroids) {
        const dist = euclideanDistance(point, centroid)
        if (dist < minDist) minDist = dist
      }
      return minDist * minDist // Square distances for probability
    })

    const totalDist = distances.reduce((sum, d) => sum + d, 0)
    
    // Weighted random selection
    let rand = Math.random() * totalDist
    let chosenIdx = 0
    for (let i = 0; i < n; i++) {
      rand -= distances[i]
      if (rand <= 0) {
        chosenIdx = i
        break
      }
    }
    centroids.push([...data[chosenIdx]])
  }

  return centroids
}

// ─── K-Means Clustering Algorithm ───────────────────────────────────────────

/**
 * Core K-Means clustering implementation.
 * 
 * @param data - Normalized feature matrix (n x 3)
 * @param k - Number of clusters
 * @param maxIterations - Maximum iterations before stopping
 * @param tolerance - Minimum centroid movement to continue
 * @returns Object containing assignments and final centroids
 */
function kMeansCluster(
  data: number[][],
  k: number,
  maxIterations: number = 100,
  tolerance: number = 0.0001
): { assignments: number[]; centroids: number[][] } {
  const n = data.length
  let centroids = initializeCentroidsKMeansPlusPlus(data, k)
  let assignments = new Array(n).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Assign each point to nearest centroid
    const newAssignments = data.map((point) => {
      let minDist = Infinity
      let closestCentroid = 0
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(point, centroids[c])
        if (dist < minDist) {
          minDist = dist
          closestCentroid = c
        }
      }
      return closestCentroid
    })

    // 2. Check for convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      break
    }
    assignments = newAssignments

    // 3. Update centroids
    const newCentroids = centroids.map((_, c) => {
      const clusterPoints = data.filter((_, i) => assignments[i] === c)
      if (clusterPoints.length === 0) return centroids[c] // Keep old centroid if empty
      
      const dim = data[0].length
      return Array.from({ length: dim }, (_, d) =>
        clusterPoints.reduce((sum, p) => sum + p[d], 0) / clusterPoints.length
      )
    })

    // 4. Check centroid movement
    const maxMovement = Math.max(
      ...centroids.map((oldC, i) => euclideanDistance(oldC, newCentroids[i]))
    )
    centroids = newCentroids

    if (maxMovement < tolerance) break
  }

  return { assignments, centroids }
}

// ─── Segment Mapping Logic ──────────────────────────────────────────────────

/**
 * Map cluster indices to meaningful business segments.
 * This uses heuristic rules based on the normalized centroid values:
 * [Total Spent, Order Frequency, Order Variance]
 */
function mapClustersToSegments(
  centroids: number[][],
  assignments: number[],
  customers: CustomerMetrics[]
): Map<number, SegmentType> {
  const clusterMetrics = centroids.map((centroid, idx) => {
    const [spent, freq, variance] = centroid
    const customersInCluster = customers.filter((_, i) => assignments[i] === idx)
    const avgDaysSince = customersInCluster.reduce((s, c) => s + c.days_since_last_order, 0) / (customersInCluster.length || 1)
    
    return {
      idx,
      spent,
      freq,
      variance,
      avgDaysSince,
      count: customersInCluster.length,
    }
  })

  // Sort by spent * frequency (revenue potential)
  clusterMetrics.sort((a, b) => (b.spent * b.freq) - (a.spent * a.freq))

  const mapping = new Map<number, SegmentType>()

  // Heuristic assignment based on normalized features
  clusterMetrics.forEach((m) => {
    // Fake Orders: Very low variance (identical orders) OR extremely high frequency with low spend
    if (m.variance < 0.1 && m.freq > 0.7) {
      mapping.set(m.idx, 'Fake Orders')
    }
    // VIP: High spend, high frequency
    else if (m.spent > 0.7 && m.freq > 0.6) {
      mapping.set(m.idx, 'VIP')
    }
    // Loyal: Medium-high spend, good frequency
    else if (m.spent > 0.4 && m.freq > 0.4) {
      mapping.set(m.idx, 'Loyal')
    }
    // High Risk: Low recent activity (high days since last order)
    else if (m.avgDaysSince > 60 || (m.spent < 0.3 && m.freq < 0.3)) {
      mapping.set(m.idx, 'High Risk')
    }
    // Normal: Everything else
    else {
      mapping.set(m.idx, 'Normal')
    }
  })

  // Ensure all 5 segments are represented if possible
  const usedSegments = new Set(mapping.values())
  const allSegments: SegmentType[] = ['VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders']
  
  for (const seg of allSegments) {
    if (!usedSegments.has(seg)) {
      // Find the cluster with the lowest count that hasn't been mapped
      const unmapped = clusterMetrics.find((m) => !mapping.has(m.idx))
      if (unmapped) mapping.set(unmapped.idx, seg)
    }
  }

  return mapping
}

// ─── Main Segmentation Function ─────────────────────────────────────────────

/**
 * Segment customers using K-Means clustering.
 * 
 * @param customers - Array of customer metrics
 * @param config - Clustering configuration
 * @returns Array of segmented customers with recommendations
 */
export function segmentCustomers(
  customers: CustomerMetrics[],
  config: KMeansConfig = { k: 5, maxIterations: 100, tolerance: 0.0001 }
): CustomerSegment[] {
  if (customers.length < config.k) {
    // Fallback: assign all to 'Normal' if not enough data
    return customers.map((c) => ({
      user_id: c.user_id,
      segment: 'Normal' as SegmentType,
      total_spent: c.total_spent,
      order_count: c.order_count,
      confidence_score: 1,
      recommended_discount: 10,
      top_category: Object.entries(c.category_preferences).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'General',
    }))
  }

  // 1. Extract features: [Total Spent, Order Frequency, Order Variance]
  const rawFeatures = customers.map((c) => [
    c.total_spent,
    c.order_count,
    c.order_variance,
  ])

  // 2. Calculate min/max for normalization
  const min = [0, 0, 0]
  const max = [0, 0, 0]
  for (let d = 0; d < 3; d++) {
    min[d] = Math.min(...rawFeatures.map((r) => r[d]))
    max[d] = Math.max(...rawFeatures.map((r) => r[d]))
  }

  // 3. Normalize features
  const normalizedData = normalizeFeatures(rawFeatures, min, max)

  // 4. Run K-Means
  const { assignments, centroids } = kMeansCluster(
    normalizedData,
    config.k,
    config.maxIterations,
    config.tolerance
  )

  // 5. Map clusters to segments
  const clusterToSegment = mapClustersToSegments(centroids, assignments, customers)

  // 6. Build final results
  return customers.map((customer, idx) => {
    const clusterIdx = assignments[idx]
    const segment = clusterToSegment.get(clusterIdx) ?? 'Normal'
    const centroid = centroids[clusterIdx]
    
    // Calculate confidence score (inverse of distance to centroid)
    const dist = euclideanDistance(normalizedData[idx], centroid)
    const confidence = Math.max(0, 1 - dist)

    // Determine top category
    const topCategory = Object.entries(customer.category_preferences)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'General'

    // Calculate recommended discount based on segment and value
    let recommendedDiscount = 5
    if (segment === 'VIP') recommendedDiscount = 15 // Reward VIPs
    else if (segment === 'Loyal') recommendedDiscount = 10
    else if (segment === 'High Risk') recommendedDiscount = 25 // Aggressive retention
    else if (segment === 'Fake Orders') recommendedDiscount = 0 // No discounts for bots

    // Boost discount if high value but high risk
    if (segment === 'High Risk' && customer.total_spent > (max[0] * 0.7)) {
      recommendedDiscount = 30
    }

    return {
      user_id: customer.user_id,
      segment,
      total_spent: customer.total_spent,
      order_count: customer.order_count,
      confidence_score: Math.round(confidence * 100) / 100,
      recommended_discount: recommendedDiscount,
      top_category: topCategory,
    }
  })
}

// ─── Category Discount Recommendations ──────────────────────────────────────

/**
 * Analyze segment purchase history to recommend category-specific discounts.
 * Uses mathematical analysis of category affinity vs. overall store performance.
 * 
 * @param segments - Segmented customers
 * @param allCategories - List of all available categories
 * @param globalCategorySales - Global sales distribution by category
 * @returns Array of discount recommendations per segment
 */
export function recommendCategoryDiscounts(
  segments: CustomerSegment[],
  allCategories: string[],
  globalCategorySales: Record<string, number>
): Array<{
  segment: SegmentType
  category: string
  recommended_discount: number
  reasoning: string
}> {
  const recommendations: Array<{
    segment: SegmentType
    category: string
    recommended_discount: number
    reasoning: string
  }> = []

  const segmentTypes: SegmentType[] = ['VIP', 'Loyal', 'Normal', 'High Risk']

  for (const segType of segmentTypes) {
    const segmentCustomers = segments.filter((s) => s.segment === segType)
    if (segmentCustomers.length === 0) continue

    // Aggregate category preferences for this segment
    const segmentCategoryCounts: Record<string, number> = {}
    segmentCustomers.forEach((c) => {
      // We don't have full category_preferences here, so we use top_category as a proxy
      // In a real implementation, you'd pass the full metrics
      segmentCategoryCounts[c.top_category] = (segmentCategoryCounts[c.top_category] || 0) + 1
    })

    const totalSegmentCustomers = segmentCustomers.length
    const globalTotal = Object.values(globalCategorySales).reduce((a, b) => a + b, 0)

    for (const category of allCategories) {
      const segmentAffinity = (segmentCategoryCounts[category] || 0) / totalSegmentCustomers
      const globalAffinity = (globalCategorySales[category] || 0) / globalTotal
      
      // Calculate lift: how much more likely this segment is to buy this category
      const lift = globalAffinity > 0 ? segmentAffinity / globalAffinity : 0

      if (lift > 1.2) {
        // High affinity category - offer targeted discount
        let discount = 10
        if (segType === 'VIP') discount = 20
        else if (segType === 'Loyal') discount = 15
        else if (segType === 'High Risk') discount = 30

        recommendations.push({
          segment: segType,
          category,
          recommended_discount: discount,
          reasoning: `${segType} customers show ${Math.round(lift * 100)}% higher affinity for ${category} compared to average. Targeted discount recommended to boost conversion.`,
        })
      }
    }
  }

  return recommendations.sort((a, b) => b.recommended_discount - a.recommended_discount)
}

// ─── Summary Generation ─────────────────────────────────────────────────────

/**
 * Generate summary statistics for each segment.
 */
export function generateSegmentSummary(segments: CustomerSegment[]): SegmentSummary[] {
  const summaryMap = new Map<SegmentType, {
    count: number
    total_spent: number
    total_orders: number
    customers: CustomerSegment[]
  }>()

  const allSegments: SegmentType[] = ['VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders']
  allSegments.forEach((s) => summaryMap.set(s, { count: 0, total_spent: 0, total_orders: 0, customers: [] }))

  segments.forEach((seg) => {
    const data = summaryMap.get(seg.segment)!
    data.count++
    data.total_spent += seg.total_spent
    data.total_orders += seg.order_count
    data.customers.push(seg)
  })

  const actions: Record<SegmentType, string> = {
    'VIP': 'Provide exclusive early access and personalized offers. Maintain high service levels.',
    'Loyal': 'Implement loyalty rewards program. Encourage referrals with incentives.',
    'Normal': 'Send regular promotional emails. Upsell related products based on history.',
    'High Risk': 'Launch re-engagement campaign with aggressive discounts. Survey for feedback.',
    'Fake Orders': 'Review for fraud. Block suspicious accounts. Do not send marketing emails.',
  }

  return Array.from(summaryMap.entries()).map(([segment, data]) => ({
    segment,
    count: data.count,
    avg_spent: data.count > 0 ? data.total_spent / data.count : 0,
    avg_orders: data.count > 0 ? data.total_orders / data.count : 0,
    total_revenue: data.total_spent,
    recommended_action: actions[segment],
  }))
}

// ─── Data Preparation Helper ────────────────────────────────────────────────

/**
 * Prepare raw order data into CustomerMetrics format for clustering.
 */
export function prepareCustomerMetrics(
  orders: Array<{
    user_id: string
    total: number
    created_at: string
    category?: string
  }>
): CustomerMetrics[] {
  const userMap = new Map<string, {
    totals: number[]
    dates: Date[]
    categories: Record<string, number>
  }>()

  const now = new Date()

  orders.forEach((order) => {
    if (!userMap.has(order.user_id)) {
      userMap.set(order.user_id, { totals: [], dates: [], categories: {} })
    }
    const data = userMap.get(order.user_id)!
    data.totals.push(order.total)
    data.dates.push(new Date(order.created_at))
    if (order.category) {
      data.categories[order.category] = (data.categories[order.category] || 0) + 1
    }
  })

  return Array.from(userMap.entries()).map(([user_id, data]) => {
    const total_spent = data.totals.reduce((a, b) => a + b, 0)
    const order_count = data.totals.length
    const avg_order_value = total_spent / order_count
    
    // Calculate variance in order values (low variance = suspicious)
    const mean = avg_order_value
    const variance = data.totals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / order_count
    
    // Days since last order
    const lastOrderDate = new Date(Math.max(...data.dates.map(d => d.getTime())))
    const days_since_last_order = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      user_id,
      total_spent,
      order_count,
      avg_order_value,
      days_since_last_order,
      order_variance: variance,
      category_preferences: data.categories,
    }
  })
}