// lib/recommendations/collaborativeFiltering.ts

/**
 * ============================================================================
 * COLLABORATIVE FILTERING RECOMMENDATION ENGINE
 * ============================================================================
 * 
 * This module implements a hybrid collaborative filtering system that combines:
 * 1. User-Based Collaborative Filtering with Cosine Similarity
 * 2. K-Nearest Neighbors (KNN) for finding similar users
 * 3. Singular Value Decomposition (SVD) for matrix factorization
 * 
 * The system analyzes purchase history to find users with similar buying patterns
 * and recommends products that similar users have purchased but the target user
 * hasn't bought yet.
 * 
 * MATHEMATICAL FOUNDATIONS:
 * - Cosine Similarity: cos(θ) = (A · B) / (||A|| × ||B||)
 * - KNN: Find K users with highest similarity scores
 * - SVD: M = U × Σ × V^T (decomposes user-item matrix into latent factors)
 * 
 * USAGE:
 * const recommendations = await getCollaborativeRecommendations(userId, k=5)
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface UserPurchase {
  user_id: string
  product_id: string
  quantity: number
  unit_price: number
  order_date: string
}

export interface ProductInfo {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
created_at?: string  // Add this optional property
  updated_at?: string  // Add this optional property
}

export interface Recommendation {
  product_id: string
  product: ProductInfo
  score: number
  reason: string
  similar_users_count: number
}

export interface UserSimilarity {
  user_id: string
  similarity: number
  common_products: number
}

export interface SVDResult {
  U: number[][]      // User latent factors
  Sigma: number[]    // Singular values
  V: number[][]      // Product latent factors
}

// ─── Matrix Operations (Pure TypeScript) ───────────────────────────────────

/**
 * Dot product of two vectors
 */
function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have same length')
  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}

/**
 * Euclidean norm (magnitude) of a vector
 */
function vectorNorm(a: number[]): number {
  return Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
}

/**
 * Transpose a matrix
 */
function transpose(matrix: number[][]): number[][] {
  if (matrix.length === 0) return []
  const rows = matrix.length
  const cols = matrix[0].length
  const result: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j]
    }
  }
  return result
}

/**
 * Matrix multiplication
 */
function matrixMultiply(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length
  const colsA = a[0].length
  const colsB = b[0].length
  const result: number[][] = Array.from({ length: rowsA }, () => Array(colsB).fill(0))
  
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += a[i][k] * b[k][j]
      }
    }
  }
  return result
}

// ─── 1. COSINE SIMILARITY ───────────────────────────────────────────────────

/**
 * Calculate cosine similarity between two user vectors.
 * 
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 * 
 * Returns a value between -1 and 1:
 * - 1: Identical purchase patterns
 * - 0: No correlation
 * - -1: Opposite patterns (rare in purchase data)
 * 
 * @param userA - Purchase vector for user A (product quantities)
 * @param userB - Purchase vector for user B (product quantities)
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(userA: number[], userB: number[]): number {
  const dot = dotProduct(userA, userB)
  const normA = vectorNorm(userA)
  const normB = vectorNorm(userB)
  
  // Handle edge cases
  if (normA === 0 || normB === 0) return 0
  
  const similarity = dot / (normA * normB)
  
  // Clamp to [-1, 1] to handle floating point errors
  return Math.max(-1, Math.min(1, similarity))
}

/**
 * Calculate adjusted cosine similarity (subtracts user mean ratings)
 * This accounts for different users having different baseline purchase frequencies
 */
export function adjustedCosineSimilarity(userA: number[], userB: number[]): number {
  const meanA = userA.reduce((s, v) => s + v, 0) / userA.length
  const meanB = userB.reduce((s, v) => s + v, 0) / userB.length
  
  const centeredA = userA.map(v => v - meanA)
  const centeredB = userB.map(v => v - meanB)
  
  return cosineSimilarity(centeredA, centeredB)
}

// ─── 2. K-NEAREST NEIGHBORS (KNN) ───────────────────────────────────────────

/**
 * Find K most similar users to a target user using KNN algorithm.
 * 
 * Algorithm:
 * 1. Calculate similarity between target user and all other users
 * 2. Sort by similarity score (descending)
 * 3. Return top K users
 * 
 * @param targetUserId - The user to find neighbors for
 * @param userVectors - Map of userId -> purchase vector
 * @param k - Number of neighbors to find (default: 5)
 * @returns Array of similar users with similarity scores
 */
export function findKNNSimilarUsers(
  targetUserId: string,
  userVectors: Map<string, number[]>,
  k: number = 5
): UserSimilarity[] {
  const targetVector = userVectors.get(targetUserId)
  if (!targetVector) return []
  
  const similarities: UserSimilarity[] = []
  
  userVectors.forEach((vector, userId) => {
    if (userId === targetUserId) return
    
    const similarity = cosineSimilarity(targetVector, vector)
    
    // Count common products (non-zero entries in both vectors)
    let commonProducts = 0
    for (let i = 0; i < targetVector.length; i++) {
      if (targetVector[i] > 0 && vector[i] > 0) {
        commonProducts++
      }
    }
    
    // Only consider users with at least 1 common product
    if (commonProducts > 0 && similarity > 0) {
      similarities.push({
        user_id: userId,
        similarity,
        common_products: commonProducts,
      })
    }
  })
  
  // Sort by similarity (descending), then by common products (descending)
  similarities.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity
    return b.common_products - a.common_products
  })
  
  return similarities.slice(0, k)
}

/**
 * Weighted KNN that applies distance-based weighting
 * Closer neighbors have more influence on recommendations
 */
export function findWeightedKNNSimilarUsers(
  targetUserId: string,
  userVectors: Map<string, number[]>,
  k: number = 5
): UserSimilarity[] {
  const neighbors = findKNNSimilarUsers(targetUserId, userVectors, k)
  
  // Apply inverse distance weighting
  return neighbors.map(neighbor => ({
    ...neighbor,
    similarity: neighbor.similarity * (1 / (1 + (1 - neighbor.similarity))),
  }))
}

// ─── 3. SINGULAR VALUE DECOMPOSITION (SVD) ────────────────────────────────

/**
 * Simplified SVD implementation using Power Iteration method.
 * 
 * For a user-item matrix M (m×n), SVD decomposes it into:
 * M = U × Σ × V^T
 * 
 * Where:
 * - U (m×k): User latent factors (user preferences)
 * - Σ (k×k): Diagonal matrix of singular values (feature importance)
 * - V^T (k×n): Product latent factors (product characteristics)
 * 
 * This implementation uses iterative approximation suitable for
 * sparse e-commerce matrices.
 * 
 * @param matrix - User-item interaction matrix (m×n)
 * @param k - Number of latent factors (default: 10)
 * @param iterations - Number of power iterations (default: 50)
 * @returns Decomposed matrices U, Sigma, V
 */
export function svdDecomposition(
  matrix: number[][],
  k: number = 10,
  iterations: number = 50
): SVDResult {
  const m = matrix.length
  const n = matrix[0]?.length || 0
  
  if (m === 0 || n === 0) {
    return { U: [], Sigma: [], V: [] }
  }
  
  // Limit k to min(m, n)
  const actualK = Math.min(k, m, n)
  
  // Initialize U and V with random values
  let U: number[][] = Array.from({ length: m }, () =>
    Array.from({ length: actualK }, () => Math.random() - 0.5)
  )
  let V: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: actualK }, () => Math.random() - 0.5)
  )
  
  const Sigma: number[] = Array(actualK).fill(0)
  
  // Power iteration to find singular values and vectors
  for (let iter = 0; iter < iterations; iter++) {
    // Update U: U = M × V
    const U_new = matrixMultiply(matrix, V)
    
    // Normalize U columns
    for (let j = 0; j < actualK; j++) {
      let norm = 0
      for (let i = 0; i < m; i++) {
        norm += U_new[i][j] * U_new[i][j]
      }
      norm = Math.sqrt(norm)
      if (norm > 0) {
        for (let i = 0; i < m; i++) {
          U_new[i][j] /= norm
        }
      }
    }
    
    // Update V: V = M^T × U
    const M_T = transpose(matrix)
    const V_new = matrixMultiply(M_T, U_new)
    
    // Normalize V columns and compute singular values
    for (let j = 0; j < actualK; j++) {
      let norm = 0
      for (let i = 0; i < n; i++) {
        norm += V_new[i][j] * V_new[i][j]
      }
      norm = Math.sqrt(norm)
      Sigma[j] = norm
      if (norm > 0) {
        for (let i = 0; i < n; i++) {
          V_new[i][j] /= norm
        }
      }
    }
    
    U = U_new
    V = V_new
  }
  
  return { U, Sigma, V }
}

/**
 * Predict user preference for a product using SVD
 * 
 * Formula: prediction = U[user] × Σ × V[product]^T
 * 
 * @param userIdx - Index of user in U matrix
 * @param productIdx - Index of product in V matrix
 * @param svdResult - Pre-computed SVD decomposition
 * @returns Predicted preference score
 */
export function svdPredict(
  userIdx: number,
  productIdx: number,
  svdResult: SVDResult
): number {
  const { U, Sigma, V } = svdResult
  
  if (!U[userIdx] || !V[productIdx]) return 0
  
  let prediction = 0
  for (let k = 0; k < Sigma.length; k++) {
    prediction += U[userIdx][k] * Sigma[k] * V[productIdx][k]
  }
  
  return prediction
}

/**
 * Build SVD-based recommendation model from purchase data
 */
export function buildSVDModel(
  userPurchases: UserPurchase[],
  allProductIds: string[],
  allUserIds: string[],
  k: number = 10
): {
  svd: SVDResult
  userIndexMap: Map<string, number>
  productIndexMap: Map<string, number>
} {
  const userIndexMap = new Map<string, number>()
  const productIndexMap = new Map<string, number>()
  
  allUserIds.forEach((id, idx) => userIndexMap.set(id, idx))
  allProductIds.forEach((id, idx) => productIndexMap.set(id, idx))
  
  // Build user-item matrix
  const matrix: number[][] = Array.from({ length: allUserIds.length }, () =>
    Array(allProductIds.length).fill(0)
  )
  
  userPurchases.forEach(purchase => {
    const userIdx = userIndexMap.get(purchase.user_id)
    const productIdx = productIndexMap.get(purchase.product_id)
    if (userIdx !== undefined && productIdx !== undefined) {
      matrix[userIdx][productIdx] += purchase.quantity
    }
  })
  
  const svd = svdDecomposition(matrix, k)
  
  return { svd, userIndexMap, productIndexMap }
}

// ─── 4. USER-ITEM MATRIX BUILDER ────────────────────────────────────────────

/**
 * Build user-item interaction matrix from purchase history.
 * 
 * Creates a sparse matrix where:
 * - Rows represent users
 * - Columns represent products
 * - Values represent purchase frequency/quantity
 * 
 * @param purchases - Array of user purchase records
 * @returns Map of userId -> purchase vector
 */
export function buildUserItemMatrix(
  purchases: UserPurchase[]
): {
  userVectors: Map<string, number[]>
  productIds: string[]
  userIds: string[]
} {
  // Extract unique users and products
  const userIdSet = new Set<string>()
  const productIdSet = new Set<string>()
  
  purchases.forEach(p => {
    userIdSet.add(p.user_id)
    productIdSet.add(p.product_id)
  })
  
  const userIds = Array.from(userIdSet)
  const productIds = Array.from(productIdSet)
  
  // Build user vectors
  const userVectors = new Map<string, number[]>()
  
  userIds.forEach(userId => {
    const vector = Array(productIds.length).fill(0)
    
    purchases
      .filter(p => p.user_id === userId)
      .forEach(p => {
        const productIdx = productIds.indexOf(p.product_id)
        if (productIdx !== -1) {
          vector[productIdx] += p.quantity
        }
      })
    
    userVectors.set(userId, vector)
  })
  
  return { userVectors, productIds, userIds }
}

/**
 * Build weighted user-item matrix with time decay
 * Recent purchases have higher weight than older ones
 */
export function buildTimeDecayedMatrix(
  purchases: UserPurchase[],
  decayFactor: number = 0.95
): Map<string, number[]> {
  const { userVectors, productIds } = buildUserItemMatrix(purchases)
  const now = Date.now()
  const maxAge = 365 * 24 * 60 * 60 * 1000 // 1 year in ms
  
  const decayedVectors = new Map<string, number[]>()
  
  userVectors.forEach((vector, userId) => {
    const userPurchases = purchases.filter(p => p.user_id === userId)
    const decayedVector = Array(productIds.length).fill(0)
    
    userPurchases.forEach(p => {
      const productIdx = productIds.indexOf(p.product_id)
      if (productIdx !== -1) {
        const age = now - new Date(p.order_date).getTime()
        const decay = Math.pow(decayFactor, age / maxAge)
        decayedVector[productIdx] += p.quantity * decay
      }
    })
    
    decayedVectors.set(userId, decayedVector)
  })
  
  return decayedVectors
}

// ─── 5. RECOMMENDATION GENERATION ───────────────────────────────────────────

/**
 * Generate collaborative filtering recommendations for a user.
 * 
 * Algorithm:
 * 1. Find K most similar users using KNN
 * 2. Aggregate their purchase history
 * 3. Filter out products the target user already bought
 * 4. Score remaining products by weighted similarity
 * 5. Return top N recommendations
 * 
 * @param targetUserId - User to generate recommendations for
 * @param purchases - All purchase history
 * @param products - Available products catalog
 * @param k - Number of similar users to consider (default: 5)
 * @param maxRecommendations - Maximum recommendations to return (default: 10)
 * @returns Array of recommended products with scores
 */
export function getCollaborativeRecommendations(
  targetUserId: string,
  purchases: UserPurchase[],
  products: ProductInfo[],
  k: number = 5,
  maxRecommendations: number = 10
): Recommendation[] {
  const { userVectors, productIds } = buildUserItemMatrix(purchases)
  
  // Get target user's purchased products
  const targetPurchases = purchases.filter(p => p.user_id === targetUserId)
  const purchasedProductIds = new Set(targetPurchases.map(p => p.product_id))
  
  // Find similar users
  const similarUsers = findKNNSimilarUsers(targetUserId, userVectors, k)
  
  if (similarUsers.length === 0) {
    // Fallback: return popular products
    return getPopularProducts(purchases, products, maxRecommendations)
  }
  
  // Calculate recommendation scores
  const productScores = new Map<string, { score: number; similarUsersCount: number }>()
  
  similarUsers.forEach(similarUser => {
    const similarUserPurchases = purchases.filter(p => p.user_id === similarUser.user_id)
    
    similarUserPurchases.forEach(purchase => {
      // Skip products already purchased by target user
      if (purchasedProductIds.has(purchase.product_id)) return
      
      const existing = productScores.get(purchase.product_id) || { score: 0, similarUsersCount: 0 }
      
      productScores.set(purchase.product_id, {
        score: existing.score + (similarUser.similarity * purchase.quantity),
        similarUsersCount: existing.similarUsersCount + 1,
      })
    })
  })
  
  // Convert to array and sort by score
  const recommendations: Recommendation[] = []
  
  productScores.forEach((data, productId) => {
    const product = products.find(p => p.id === productId)
    if (product && product.in_stock) {
      recommendations.push({
        product_id: productId,
        product,
        score: data.score,
        reason: `Purchased by ${data.similarUsersCount} similar user${data.similarUsersCount > 1 ? 's' : ''}`,
        similar_users_count: data.similarUsersCount,
      })
    }
  })
  
  // Sort by score and return top N
  recommendations.sort((a, b) => b.score - a.score)
  return recommendations.slice(0, maxRecommendations)
}

/**
 * Hybrid recommendation combining collaborative filtering and SVD
 */
export function getHybridRecommendations(
  targetUserId: string,
  purchases: UserPurchase[],
  products: ProductInfo[],
  k: number = 5,
  maxRecommendations: number = 10,
  cfWeight: number = 0.6,
  svdWeight: number = 0.4
): Recommendation[] {
  const allUserIds = Array.from(new Set(purchases.map(p => p.user_id)))
  const allProductIds = products.map(p => p.id)
  
  // Get collaborative filtering recommendations
  const cfRecs = getCollaborativeRecommendations(targetUserId, purchases, products, k, maxRecommendations)
  
  // Build SVD model
  const { svd, userIndexMap, productIndexMap } = buildSVDModel(purchases, allProductIds, allUserIds, 10)
  
  const targetUserIdx = userIndexMap.get(targetUserId)
  if (targetUserIdx === undefined) return cfRecs
  
  // Get SVD-based recommendations
  const svdRecs: Recommendation[] = []
  const purchasedProductIds = new Set(
    purchases.filter(p => p.user_id === targetUserId).map(p => p.product_id)
  )
  
  allProductIds.forEach((productId, productIdx) => {
    if (purchasedProductIds.has(productId)) return
    
    const prediction = svdPredict(targetUserIdx, productIdx, svd)
    const product = products.find(p => p.id === productId)
    
    if (product && product.in_stock && prediction > 0) {
      svdRecs.push({
        product_id: productId,
        product,
        score: prediction,
        reason: 'Predicted based on latent factors',
        similar_users_count: 0,
      })
    }
  })
  
  svdRecs.sort((a, b) => b.score - a.score)
  
  // Normalize scores to [0, 1] range
  const maxCfScore = cfRecs.length > 0 ? cfRecs[0].score : 1
  const maxSvdScore = svdRecs.length > 0 ? svdRecs[0].score : 1
  
  const normalizedCf = cfRecs.map(r => ({
    ...r,
    score: (r.score / maxCfScore) * cfWeight,
  }))
  
  const normalizedSvd = svdRecs.map(r => ({
    ...r,
    score: (r.score / maxSvdScore) * svdWeight,
  }))
  
  // Merge and deduplicate
  const merged = new Map<string, Recommendation>()
  
  normalizedCf.forEach(r => {
    merged.set(r.product_id, { ...r, score: r.score })
  })
  
  normalizedSvd.forEach(r => {
    const existing = merged.get(r.product_id)
    if (existing) {
      existing.score += r.score
      existing.reason = 'Hybrid: CF + SVD'
    } else {
      merged.set(r.product_id, r)
    }
  })
  
  const finalRecs = Array.from(merged.values())
  finalRecs.sort((a, b) => b.score - a.score)
  
  return finalRecs.slice(0, maxRecommendations)
}

// ─── 6. HELPER FUNCTIONS ────────────────────────────────────────────────────

/**
 * Get popular products as fallback when no similar users found
 */
export function getPopularProducts(
  purchases: UserPurchase[],
  products: ProductInfo[],
  maxRecommendations: number = 10
): Recommendation[] {
  const productPopularity = new Map<string, number>()
  
  purchases.forEach(p => {
    const current = productPopularity.get(p.product_id) || 0
    productPopularity.set(p.product_id, current + p.quantity)
  })
  
  const recommendations: Recommendation[] = []
  
  productPopularity.forEach((popularity, productId) => {
    const product = products.find(p => p.id === productId)
    if (product && product.in_stock) {
      recommendations.push({
        product_id: productId,
        product,
        score: popularity,
        reason: 'Popular among all customers',
        similar_users_count: 0,
      })
    }
  })
  
  recommendations.sort((a, b) => b.score - a.score)
  return recommendations.slice(0, maxRecommendations)
}

/**
 * Calculate recommendation diversity (ensure variety in categories)
 */
export function diversifyRecommendations(
  recommendations: Recommendation[],
  maxPerCategory: number = 2
): Recommendation[] {
  const categoryCount = new Map<string, number>()
  const diversified: Recommendation[] = []
  
  for (const rec of recommendations) {
    const category = rec.product.category || 'General'
    const count = categoryCount.get(category) || 0
    
    if (count < maxPerCategory) {
      diversified.push(rec)
      categoryCount.set(category, count + 1)
    }
  }
  
  return diversified
}

/**
 * Evaluate recommendation quality using precision@k
 * (For testing/validation purposes)
 */
export function precisionAtK(
  actual: string[],
  predicted: string[],
  k: number
): number {
  const predictedK = predicted.slice(0, k)
  const relevant = predictedK.filter(p => actual.includes(p))
  return relevant.length / k
}

/**
 * Evaluate recommendation quality using recall@k
 */
export function recallAtK(
  actual: string[],
  predicted: string[],
  k: number
): number {
  const predictedK = predicted.slice(0, k)
  const relevant = predictedK.filter(p => actual.includes(p))
  return actual.length > 0 ? relevant.length / actual.length : 0
}

/**
 * Calculate Mean Average Precision (MAP) for multiple users
 */
export function meanAveragePrecision(
  actualLists: string[][],
  predictedLists: string[][]
): number {
  if (actualLists.length === 0) return 0
  
  let totalAP = 0
  
  for (let i = 0; i < actualLists.length; i++) {
    const actual = actualLists[i]
    const predicted = predictedLists[i]
    
    let relevantCount = 0
    let precisionSum = 0
    
    for (let k = 0; k < predicted.length; k++) {
      if (actual.includes(predicted[k])) {
        relevantCount++
        precisionSum += relevantCount / (k + 1)
      }
    }
    
    totalAP += actual.length > 0 ? precisionSum / actual.length : 0
  }
  
  return totalAP / actualLists.length
}

// ─── 7. COLD START HANDLING ─────────────────────────────────────────────────

/**
 * Handle cold start problem for new users with no purchase history
 * Uses content-based fallback (popular products, trending items)
 */
export function handleColdStart(
  purchases: UserPurchase[],
  products: ProductInfo[],
  maxRecommendations: number = 10
): Recommendation[] {
  // Strategy 1: Most popular products
  const popular = getPopularProducts(purchases, products, maxRecommendations)
  
  // Strategy 2: Recently added products
  const recentProducts = [...products]
    .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
    .filter(p => p.in_stock)
    .slice(0, maxRecommendations)
  
  const recentRecs: Recommendation[] = recentProducts.map(p => ({
    product_id: p.id,
    product: p,
    score: 1,
    reason: 'Newly added to collection',
    similar_users_count: 0,
  }))
  
  // Combine both strategies
  const combined = [...popular, ...recentRecs]
  
  // Remove duplicates
  const seen = new Set<string>()
  const unique = combined.filter(r => {
    if (seen.has(r.product_id)) return false
    seen.add(r.product_id)
    return true
  })
  
  return unique.slice(0, maxRecommendations)
}

// ─── 8. EXPORTED MAIN API ───────────────────────────────────────────────────

/**
 * Main recommendation API function
 * Automatically handles cold start and selects best algorithm
 */
export async function getRecommendationsForUser(
  targetUserId: string,
  purchases: UserPurchase[],
  products: ProductInfo[],
  options: {
    k?: number
    maxRecommendations?: number
    useHybrid?: boolean
    enableDiversity?: boolean
  } = {}
): Promise<Recommendation[]> {
  const {
    k = 5,
    maxRecommendations = 10,
    useHybrid = true,
    enableDiversity = true,
  } = options
  
  // Check if user has purchase history
  const userPurchases = purchases.filter(p => p.user_id === targetUserId)
  
  let recommendations: Recommendation[]
  
  if (userPurchases.length === 0) {
    // Cold start: use fallback strategy
    recommendations = handleColdStart(purchases, products, maxRecommendations)
  } else if (useHybrid) {
    // Use hybrid approach (CF + SVD)
    recommendations = getHybridRecommendations(
      targetUserId,
      purchases,
      products,
      k,
      maxRecommendations
    )
  } else {
    // Use pure collaborative filtering
    recommendations = getCollaborativeRecommendations(
      targetUserId,
      purchases,
      products,
      k,
      maxRecommendations
    )
  }
  
  // Apply diversity if enabled
  if (enableDiversity) {
    recommendations = diversifyRecommendations(recommendations, 2)
  }
  
  return recommendations
}
