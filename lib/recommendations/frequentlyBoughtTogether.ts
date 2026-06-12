// lib/recommendations/frequentlyBoughtTogether.ts


/**
 * ============================================================================
 * FREQUENTLY BOUGHT TOGETHER - APRIORI ALGORITHM
 * ============================================================================
 * 
 * This module implements the Apriori algorithm for association rule mining,
 * commonly used in e-commerce for "Frequently Bought Together" recommendations
 * (similar to Amazon's recommendation system).
 * 
 * The algorithm discovers products that are frequently purchased together
 * by analyzing transaction data and finding itemsets that exceed a minimum
 * support threshold.
 * 
 * KEY METRICS:
 * - Support: How frequently an itemset appears in transactions
 *   support(A → B) = P(A ∩ B) = transactions with both A and B / total transactions
 * 
 * - Confidence: How often B is purchased when A is purchased
 *   confidence(A → B) = P(B|A) = support(A ∩ B) / support(A)
 * 
 * - Lift: How much more likely B is purchased when A is purchased vs random
 *   lift(A → B) = P(B|A) / P(B) = confidence(A → B) / support(B)
 *   lift > 1: Positive association (items bought together more than expected)
 *   lift = 1: No association (independent)
 *   lift < 1: Negative association (items bought together less than expected)
 * 
 * USAGE:
 * const recommendations = getFrequentlyBoughtTogether(productId, transactions)
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface Transaction {
  transaction_id: string
  order_id: string
  user_id: string
  product_ids: string[]
  transaction_date: string
  total_amount: number
}

export interface ProductPair {
  product_a_id: string
  product_b_id: string
  support: number
  confidence: number
  lift: number
  frequency: number
  total_transactions: number
}

export interface AssociationRule {
  antecedent: string[]  // If customer buys these items
  consequent: string[]  // Then they also buy these items
  support: number
  confidence: number
  lift: number
  frequency: number
}

export interface FrequentlyBoughtTogether {
  product_id: string
  product_name: string
  product_price: number
  product_image: string | null
  support: number
  confidence: number
  lift: number
  frequency: number
  reason: string
}

export interface AprioriConfig {
  minSupport: number      // Minimum support threshold (0.0 to 1.0)
  minConfidence: number   // Minimum confidence threshold (0.0 to 1.0)
  minLift: number         // Minimum lift threshold (> 1.0 for positive association)
  maxItemsetSize: number  // Maximum size of itemsets to consider
  maxRecommendations: number // Maximum number of recommendations to return
}

// ─── APRIORI ALGORITHM IMPLEMENTATION ───────────────────────────────────────

/**
 * Generate candidate itemsets of size k from frequent itemsets of size k-1
 * 
 * This is the "join" step of the Apriori algorithm.
 * Two itemsets are joined if they share k-2 items (all but the last item).
 * 
 * Example: {A, B} and {A, C} → {A, B, C}
 */
function generateCandidates(
  frequentItemsets: string[][],
  k: number
): string[][] {
  const candidates: string[][] = []
  const n = frequentItemsets.length
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const setA = frequentItemsets[i]
      const setB = frequentItemsets[j]
      
      // Check if first k-2 items are the same
      let canJoin = true
      for (let m = 0; m < k - 2; m++) {
        if (setA[m] !== setB[m]) {
          canJoin = false
          break
        }
      }
      
      if (canJoin) {
        // Create new candidate by merging
        const candidate = [...setA, setB[k - 2]]
        
        // Check if all subsets are frequent (Apriori property)
        const allSubsetsFrequent = isAllSubsetsFrequent(candidate, frequentItemsets)
        
        if (allSubsetsFrequent) {
          candidates.push(candidate.sort())
        }
      }
    }
  }
  
  // Remove duplicates
  const uniqueCandidates = candidates.filter(
    (candidate, index, self) =>
      index === self.findIndex(
        (c) => JSON.stringify(c) === JSON.stringify(candidate)
      )
  )
  
  return uniqueCandidates
}

/**
 * Check if all (k-1)-subsets of a candidate itemset are frequent
 * 
 * This implements the Apriori property: "All non-empty subsets of a frequent
 * itemset must also be frequent."
 */
function isAllSubsetsFrequent(
  candidate: string[],
  frequentItemsets: string[][]
): boolean {
  const k = candidate.length
  
  // Generate all (k-1)-subsets
  for (let i = 0; i < k; i++) {
    const subset = candidate.filter((_, idx) => idx !== i)
    
    // Check if this subset exists in frequent itemsets
    const isFrequent = frequentItemsets.some(
      (itemset) => JSON.stringify(itemset) === JSON.stringify(subset)
    )
    
    if (!isFrequent) return false
  }
  
  return true
}

/**
 * Count the frequency of an itemset in transactions
 */
function countItemsetFrequency(
  itemset: string[],
  transactions: Transaction[]
): number {
  return transactions.filter((transaction) =>
    itemset.every((item) => transaction.product_ids.includes(item))
  ).length
}

/**
 * Main Apriori Algorithm Implementation
 * 
 * Finds all frequent itemsets that meet the minimum support threshold.
 * 
 * Algorithm:
 * 1. Find all frequent 1-itemsets (individual products)
 * 2. Generate candidate 2-itemsets from frequent 1-itemsets
 * 3. Prune candidates that don't meet minimum support
 * 4. Repeat until no more frequent itemsets are found or max size reached
 * 
 * @param transactions - Array of transaction data
 * @param minSupport - Minimum support threshold (0.0 to 1.0)
 * @param maxItemsetSize - Maximum size of itemsets to consider
 * @returns Array of frequent itemsets with their support values
 */
export function aprioriAlgorithm(
  transactions: Transaction[],
  minSupport: number = 0.01,
  maxItemsetSize: number = 3
): { itemset: string[]; support: number; frequency: number }[] {
  const totalTransactions = transactions.length
  if (totalTransactions === 0) return []
  
  const minSupportCount = Math.ceil(minSupport * totalTransactions)
  const frequentItemsets: { itemset: string[]; support: number; frequency: number }[] = []
  
  // Step 1: Find frequent 1-itemsets
  const productFrequency = new Map<string, number>()
  
  transactions.forEach((transaction) => {
    transaction.product_ids.forEach((productId) => {
      productFrequency.set(
        productId,
        (productFrequency.get(productId) || 0) + 1
      )
    })
  })
  
  // Filter by minimum support
  let currentFrequentItemsets: string[][] = []
  
  productFrequency.forEach((frequency, productId) => {
    if (frequency >= minSupportCount) {
      const support = frequency / totalTransactions
      frequentItemsets.push({
        itemset: [productId],
        support,
        frequency,
      })
      currentFrequentItemsets.push([productId])
    }
  })
  
  // Step 2-4: Iteratively find larger itemsets
  let k = 2
  while (k <= maxItemsetSize && currentFrequentItemsets.length > 0) {
    // Generate candidates
    const candidates = generateCandidates(currentFrequentItemsets, k)
    
    // Count frequency and filter by minimum support
    const newFrequentItemsets: string[][] = []
    
    candidates.forEach((candidate) => {
      const frequency = countItemsetFrequency(candidate, transactions)
      
      if (frequency >= minSupportCount) {
        const support = frequency / totalTransactions
        frequentItemsets.push({
          itemset: candidate,
          support,
          frequency,
        })
        newFrequentItemsets.push(candidate)
      }
    })
    
    currentFrequentItemsets = newFrequentItemsets
    k++
  }
  
  return frequentItemsets
}

/**
 * Generate association rules from frequent itemsets
 * 
 * For each frequent itemset of size >= 2, generate rules by splitting
 * the itemset into antecedent (if) and consequent (then) parts.
 * 
 * Example: {A, B, C} → rules: {A, B} → {C}, {A, C} → {B}, {B, C} → {A}
 * 
 * @param frequentItemsets - Frequent itemsets from Apriori algorithm
 * @param transactions - Original transaction data
 * @param minConfidence - Minimum confidence threshold
 * @param minLift - Minimum lift threshold
 * @returns Array of association rules
 */
export function generateAssociationRules(
  frequentItemsets: { itemset: string[]; support: number; frequency: number }[],
  transactions: Transaction[],
  minConfidence: number = 0.5,
  minLift: number = 1.0
): AssociationRule[] {
  const rules: AssociationRule[] = []
  const totalTransactions = transactions.length
  
  // Filter itemsets with size >= 2
  const largeItemsets = frequentItemsets.filter((fi) => fi.itemset.length >= 2)
  
  largeItemsets.forEach(({ itemset, support: itemsetSupport, frequency }) => {
    const n = itemset.length
    
    // Generate all possible splits into antecedent and consequent
    // For simplicity, we'll use consequent of size 1
    for (let i = 0; i < n; i++) {
      const consequent = [itemset[i]]
      const antecedent = itemset.filter((_, idx) => idx !== i)
      
      // Calculate support of antecedent
      const antecedentFrequency = countItemsetFrequency(antecedent, transactions)
      const antecedentSupport = antecedentFrequency / totalTransactions
      
      // Calculate support of consequent
      const consequentFrequency = countItemsetFrequency(consequent, transactions)
      const consequentSupport = consequentFrequency / totalTransactions
      
      // Calculate confidence: P(B|A) = support(A ∩ B) / support(A)
      const confidence = itemsetSupport / antecedentSupport
      
      // Calculate lift: P(B|A) / P(B) = confidence / support(B)
      const lift = confidence / consequentSupport
      
      // Apply thresholds
      if (confidence >= minConfidence && lift >= minLift) {
        rules.push({
          antecedent,
          consequent,
          support: itemsetSupport,
          confidence,
          lift,
          frequency,
        })
      }
    }
  })
  
  // Sort by lift (descending), then confidence, then support
  rules.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.support - a.support
  })
  
  return rules
}

/**
 * Find product pairs that are frequently bought together
 * 
 * This is a simplified version that focuses on 2-itemsets (product pairs)
 * for the "Frequently Bought Together" feature.
 * 
 * @param productId - The target product to find associations for
 * @param transactions - Array of transaction data
 * @param config - Configuration for filtering recommendations
 * @returns Array of frequently bought together products
 */
export function getFrequentlyBoughtTogether(
  productId: string,
  transactions: Transaction[],
  config: AprioriConfig = {
    minSupport: 0.01,
    minConfidence: 0.3,
    minLift: 1.2,
    maxItemsetSize: 2,
    maxRecommendations: 5,
  }
): FrequentlyBoughtTogether[] {
  const totalTransactions = transactions.length
  if (totalTransactions === 0) return []
  
  // Run Apriori to find frequent 2-itemsets
  const frequentItemsets = aprioriAlgorithm(
    transactions,
    config.minSupport,
    2
  )
  
  // Filter itemsets that contain the target product
  const relevantItemsets = frequentItemsets.filter((fi) =>
    fi.itemset.includes(productId) && fi.itemset.length === 2
  )
  
  // Calculate metrics for each pair
  const recommendations: FrequentlyBoughtTogether[] = []
  
  relevantItemsets.forEach(({ itemset, support, frequency }) => {
    const otherProductId = itemset.find((id) => id !== productId)!
    
    // Calculate confidence: P(B|A) where A = productId, B = otherProductId
    const productIdFrequency = countItemsetFrequency([productId], transactions)
    const confidence = support / (productIdFrequency / totalTransactions)
    
    // Calculate lift
    const otherProductFrequency = countItemsetFrequency([otherProductId], transactions)
    const otherProductSupport = otherProductFrequency / totalTransactions
    const lift = confidence / otherProductSupport
    
    // Apply filters
    if (confidence >= config.minConfidence && lift >= config.minLift) {
      recommendations.push({
        product_id: otherProductId,
        product_name: '', // Will be filled by caller
        product_price: 0, // Will be filled by caller
        product_image: null, // Will be filled by caller
        support,
        confidence,
        lift,
        frequency,
        reason: `Bought together ${frequency} times (${(confidence * 100).toFixed(1)}% of customers who bought this also bought this item)`,
      })
    }
  })
  
  // Sort by lift (descending), then confidence, then frequency
  recommendations.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.frequency - a.frequency
  })
  
  return recommendations.slice(0, config.maxRecommendations)
}

/**
 * Get all product pairs with their association metrics
 * 
 * Useful for building a complete "Frequently Bought Together" matrix
 * that can be cached and used across the application.
 * 
 * @param transactions - Array of transaction data
 * @param config - Configuration for filtering
 * @returns Array of all product pairs with metrics
 */
export function getAllProductPairs(
  transactions: Transaction[],
  config: AprioriConfig = {
    minSupport: 0.01,
    minConfidence: 0.3,
    minLift: 1.2,
    maxItemsetSize: 2,
    maxRecommendations: 100,
  }
): ProductPair[] {
  const totalTransactions = transactions.length
  if (totalTransactions === 0) return []
  
  // Run Apriori to find frequent 2-itemsets
  const frequentItemsets = aprioriAlgorithm(
    transactions,
    config.minSupport,
    2
  )
  
  // Filter to only 2-itemsets
  const pairs = frequentItemsets.filter((fi) => fi.itemset.length === 2)
  
  // Calculate metrics for each pair
  const productPairs: ProductPair[] = []
  
  pairs.forEach(({ itemset, support, frequency }) => {
    const [productA, productB] = itemset
    
    // Calculate confidence: P(B|A)
    const productAFrequency = countItemsetFrequency([productA], transactions)
    const confidenceAB = support / (productAFrequency / totalTransactions)
    
    // Calculate lift
    const productBFrequency = countItemsetFrequency([productB], transactions)
    const productBSupport = productBFrequency / totalTransactions
    const lift = confidenceAB / productBSupport
    
    // Apply filters
    if (confidenceAB >= config.minConfidence && lift >= config.minLift) {
      productPairs.push({
        product_a_id: productA,
        product_b_id: productB,
        support,
        confidence: confidenceAB,
        lift,
        frequency,
        total_transactions: totalTransactions,
      })
    }
  })
  
  // Sort by lift (descending)
  productPairs.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.support - a.support
  })
  
  return productPairs.slice(0, config.maxRecommendations)
}

/**
 * Build transaction data from order items
 * 
 * Converts raw order data into the Transaction format required by the algorithm.
 * 
 * @param orders - Array of order data with items
 * @returns Array of Transaction objects
 */
export function buildTransactionsFromOrders(
  orders: Array<{
    id: string
    user_id: string
    created_at: string
    total: number
    order_items: Array<{
      product_id: string
      quantity: number
    }>
  }>
): Transaction[] {
  return orders
    .filter((order) => order.order_items.length > 0)
    .map((order) => ({
      transaction_id: `txn_${order.id}`,
      order_id: order.id,
      user_id: order.user_id,
      product_ids: order.order_items.map((item) => item.product_id),
      transaction_date: order.created_at,
      total_amount: order.total,
    }))
}

/**
 * Get "People Also Bought" recommendations
 * 
 * Similar to "Frequently Bought Together" but focuses on products
 * that customers who bought this product also purchased in OTHER orders.
 * 
 * This is useful for cross-selling and discovery.
 * 
 * @param productId - The target product
 * @param transactions - Array of transaction data
 * @param maxRecommendations - Maximum number of recommendations
 * @returns Array of recommended products
 */
export function getPeopleAlsoBought(
  productId: string,
  transactions: Transaction[],
  maxRecommendations: number = 5
): { product_id: string; frequency: number; percentage: number }[] {
  // Find all transactions containing the target product
  const targetTransactions = transactions.filter((t) =>
    t.product_ids.includes(productId)
  )
  
  if (targetTransactions.length === 0) return []
  
  // Count how often other products appear in these transactions
  const productCounts = new Map<string, number>()
  
  targetTransactions.forEach((transaction) => {
    transaction.product_ids.forEach((pid) => {
      if (pid !== productId) {
        productCounts.set(pid, (productCounts.get(pid) || 0) + 1)
      }
    })
  })
  
  // Convert to array and calculate percentages
  const recommendations = Array.from(productCounts.entries())
    .map(([product_id, frequency]) => ({
      product_id,
      frequency,
      percentage: (frequency / targetTransactions.length) * 100,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxRecommendations)
  
  return recommendations
}

/**
 * Calculate market basket analysis metrics
 * 
 * Provides comprehensive statistics about product associations
 * for admin analytics and reporting.
 * 
 * @param transactions - Array of transaction data
 * @returns Market basket analysis metrics
 */
export function getMarketBasketMetrics(transactions: Transaction[]) {
  const totalTransactions = transactions.length
  if (totalTransactions === 0) {
    return {
      totalTransactions: 0,
      avgItemsPerTransaction: 0,
      totalUniqueProducts: 0,
      avgTransactionValue: 0,
      topProductPairs: [],
    }
  }
  
  // Calculate average items per transaction
  const totalItems = transactions.reduce(
    (sum, t) => sum + t.product_ids.length,
    0
  )
  const avgItemsPerTransaction = totalItems / totalTransactions
  
  // Calculate unique products
  const uniqueProducts = new Set<string>()
  transactions.forEach((t) => t.product_ids.forEach((pid) => uniqueProducts.add(pid)))
  
  // Calculate average transaction value
  const totalValue = transactions.reduce((sum, t) => sum + t.total_amount, 0)
  const avgTransactionValue = totalValue / totalTransactions
  
  // Get top product pairs
  const topPairs = getAllProductPairs(transactions, {
    minSupport: 0.02,
    minConfidence: 0.4,
    minLift: 1.5,
    maxItemsetSize: 2,
    maxRecommendations: 10,
  })
  
  return {
    totalTransactions,
    avgItemsPerTransaction: Math.round(avgItemsPerTransaction * 100) / 100,
    totalUniqueProducts: uniqueProducts.size,
    avgTransactionValue: Math.round(avgTransactionValue * 100) / 100,
    topProductPairs: topPairs,
  }
}

/**
 * Validate transaction data for analysis
 * 
 * Checks for common issues in transaction data that could affect
 * the accuracy of association rule mining.
 * 
 * @param transactions - Array of transaction data to validate
 * @returns Validation results with warnings
 */
export function validateTransactions(transactions: Transaction[]) {
  const warnings: string[] = []
  
  // Check for empty transactions
  const emptyTransactions = transactions.filter(
    (t) => t.product_ids.length === 0
  )
  if (emptyTransactions.length > 0) {
    warnings.push(
      `${emptyTransactions.length} transactions have no products`
    )
  }
  
  // Check for duplicate product IDs within transactions
  const duplicateProducts = transactions.filter((t) => {
    const unique = new Set(t.product_ids)
    return unique.size !== t.product_ids.length
  })
  if (duplicateProducts.length > 0) {
    warnings.push(
      `${duplicateProducts.length} transactions have duplicate product IDs`
    )
  }
  
  // Check for very large transactions (potential data issues)
  const largeTransactions = transactions.filter(
    (t) => t.product_ids.length > 20
  )
  if (largeTransactions.length > 0) {
    warnings.push(
      `${largeTransactions.length} transactions have more than 20 products (may be wholesale orders)`
    )
  }
  
  // Check transaction date range
  const dates = transactions.map((t) => new Date(t.transaction_date).getTime())
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  const dateRangeDays =
    (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
  
  if (dateRangeDays < 30) {
    warnings.push(
      `Transaction data spans only ${Math.round(dateRangeDays)} days (recommend at least 30 days for reliable results)`
    )
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    totalTransactions: transactions.length,
    dateRangeDays: Math.round(dateRangeDays),
  }
}
