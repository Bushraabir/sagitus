// lib/recommendations/productGraph.ts

/**
 * ============================================================================
 * PRODUCT GRAPH RECOMMENDATIONS - PageRank & Random Walk with Restart
 * ============================================================================
 * 
 * This module models products as a directed graph where:
 * - Nodes = Products
 * - Edges = Relationships (co-purchases, same category, similar attributes)
 * - Edge weights = Strength of relationship
 * 
 * ALGORITHMS IMPLEMENTED:
 * 
 * 1. PageRank:
 *    Ranks products by "importance" based on the graph structure.
 *    A product is important if many other important products link to it.
 *    
 *    Formula: PR(u) = (1-d)/N + d × Σ(PR(v)/L(v)) for all v linking to u
 *    Where:
 *    - d = damping factor (0.85)
 *    - N = total number of nodes
 *    - L(v) = number of outgoing links from v
 * 
 * 2. Random Walk with Restart (RWR):
 *    Finds products similar to a query product by simulating a random walker
 *    that occasionally restarts at the query node.
 *    
 *    Formula: r = (1-c) × M × r + c × e_q
 *    Where:
 *    - c = restart probability (0.15)
 *    - M = column-normalized transition matrix
 *    - e_q = restart vector (1 at query node, 0 elsewhere)
 * 
 * USE CASES:
 * - "Customers who bought this also bought..." (co-purchase graph)
 * - "Similar products" (category/attribute graph)
 * - "Trending products" (PageRank on recent purchase graph)
 * - Admin product discovery (graph-based recommendations)
 * 
 * USAGE:
 * const graph = buildProductGraph(purchases, products);
 * const similar = randomWalkWithRestart(graph, productId, topK=10);
 * const ranked = pageRank(graph);
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  category: string
  price: number
  in_stock: boolean
}

export interface GraphEdge {
  from: string
  to: string
  weight: number // 0 to 1, strength of relationship
  relationshipType: 'co_purchase' | 'same_category' | 'similar_attributes'
}

export interface ProductGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  adjacencyList: Map<string, Map<string, number>> // node -> {neighbor -> weight}
  reverseAdjacencyList: Map<string, Map<string, number>> // for PageRank
}

export interface PageRankResult {
  productId: string
  score: number
  rank: number
}

export interface RandomWalkResult {
  productId: string
  probability: number
  rank: number
}

export interface GraphConfig {
  dampingFactor: number // For PageRank (default: 0.85)
  restartProbability: number // For RWR (default: 0.15)
  maxIterations: number // Convergence iterations (default: 100)
  tolerance: number // Convergence threshold (default: 1e-6)
  coPurchaseWeight: number // Weight for co-purchase edges (default: 1.0)
  categoryWeight: number // Weight for same-category edges (default: 0.3)
}

// ─── Graph Construction ─────────────────────────────────────────────────────

/**
 * Build a product graph from purchase history and product catalog.
 * 
 * Creates edges based on:
 * 1. Co-purchases: Products bought together in the same order
 * 2. Category similarity: Products in the same category
 * 
 * @param purchases - Array of order items with order_id
 * @param products - Product catalog
 * @param config - Graph construction configuration
 * @returns ProductGraph with nodes, edges, and adjacency lists
 */
export function buildProductGraph(
  purchases: Array<{
    order_id: string
    product_id: string
    quantity: number
  }>,
  products: Array<{
    id: string
    name: string
    category: string
    price: number
    in_stock: boolean
  }>,
  config: Partial<GraphConfig> = {}
): ProductGraph {
  const cfg: GraphConfig = {
    dampingFactor: config.dampingFactor ?? 0.85,
    restartProbability: config.restartProbability ?? 0.15,
    maxIterations: config.maxIterations ?? 100,
    tolerance: config.tolerance ?? 1e-6,
    coPurchaseWeight: config.coPurchaseWeight ?? 1.0,
    categoryWeight: config.categoryWeight ?? 0.3,
  }

  // Initialize nodes
  const nodes = new Map<string, GraphNode>()
  products.forEach((p) => {
    nodes.set(p.id, {
      id: p.id,
      label: p.name,
      category: p.category || 'General',
      price: p.price,
      in_stock: p.in_stock,
    })
  })

  // Build co-purchase edges
  const coPurchaseCounts = new Map<string, Map<string, number>>()
  const orderGroups = new Map<string, string[]>()

  purchases.forEach((item) => {
    if (!orderGroups.has(item.order_id)) {
      orderGroups.set(item.order_id, [])
    }
    orderGroups.get(item.order_id)!.push(item.product_id)
  })

  // Count co-purchases
  orderGroups.forEach((productIds) => {
    const uniqueIds = Array.from(new Set(productIds))
    for (let i = 0; i < uniqueIds.length; i++) {
      for (let j = i + 1; j < uniqueIds.length; j++) {
        const a = uniqueIds[i]
        const b = uniqueIds[j]
        if (!coPurchaseCounts.has(a)) coPurchaseCounts.set(a, new Map())
        if (!coPurchaseCounts.has(b)) coPurchaseCounts.set(b, new Map())
        
        const countA = coPurchaseCounts.get(a)!.get(b) || 0
        coPurchaseCounts.get(a)!.set(b, countA + 1)
        
        const countB = coPurchaseCounts.get(b)!.get(a) || 0
        coPurchaseCounts.get(b)!.set(a, countB + 1)
      }
    }
  })

  // Normalize co-purchase weights and build edges
  const edges: GraphEdge[] = []
  const adjacencyList = new Map<string, Map<string, number>>()
  const reverseAdjacencyList = new Map<string, Map<string, number>>()

  // Add co-purchase edges
  coPurchaseCounts.forEach((neighbors, productId) => {
    if (!adjacencyList.has(productId)) adjacencyList.set(productId, new Map())
    if (!reverseAdjacencyList.has(productId)) reverseAdjacencyList.set(productId, new Map())
    
    const maxCount = Math.max(...Array.from(neighbors.values()))
    
    neighbors.forEach((count, neighborId) => {
      const normalizedWeight = (count / maxCount) * cfg.coPurchaseWeight
      
      edges.push({
        from: productId,
        to: neighborId,
        weight: normalizedWeight,
        relationshipType: 'co_purchase',
      })

      adjacencyList.get(productId)!.set(
        neighborId,
        (adjacencyList.get(productId)!.get(neighborId) || 0) + normalizedWeight
      )

      // FIX: Ensure reverseAdjacencyList has a map for neighborId before setting
      if (!reverseAdjacencyList.has(neighborId)) {
        reverseAdjacencyList.set(neighborId, new Map())
      }
      reverseAdjacencyList.get(neighborId)!.set(
        productId,
        (reverseAdjacencyList.get(neighborId)!.get(productId) || 0) + normalizedWeight
      )
    })
  })

  // Add category-based edges (for products with no co-purchases)
  const categoryGroups = new Map<string, string[]>()
  products.forEach((p) => {
    const cat = p.category || 'General'
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, [])
    categoryGroups.get(cat)!.push(p.id)
  })

  categoryGroups.forEach((productIds, category) => {
    // Only add category edges if product has fewer than 3 co-purchase edges
    for (const productId of productIds) {
      const existingEdges = adjacencyList.get(productId)?.size || 0
      if (existingEdges < 3) {
        if (!adjacencyList.has(productId)) adjacencyList.set(productId, new Map())
        if (!reverseAdjacencyList.has(productId)) reverseAdjacencyList.set(productId, new Map())

        for (const otherId of productIds) {
          if (otherId !== productId && !adjacencyList.get(productId)!.has(otherId)) {
            const weight = cfg.categoryWeight
            
            edges.push({
              from: productId,
              to: otherId,
              weight,
              relationshipType: 'same_category',
            })

            adjacencyList.get(productId)!.set(otherId, weight)
            
            // FIX: Ensure reverseAdjacencyList has a map for otherId before setting
            if (!reverseAdjacencyList.has(otherId)) {
              reverseAdjacencyList.set(otherId, new Map())
            }
            reverseAdjacencyList.get(otherId)!.set(productId, weight)
          }
        }
      }
    }
  })

  return { nodes, edges, adjacencyList, reverseAdjacencyList }
}

// ─── PageRank Algorithm ─────────────────────────────────────────────────────

/**
 * Compute PageRank scores for all products in the graph.
 * 
 * PageRank measures the "importance" of each node based on the graph structure.
 * Products that are frequently co-purchased with other important products
 * receive higher scores.
 * 
 * @param graph - ProductGraph
 * @param config - PageRank configuration
 * @returns Array of products ranked by PageRank score
 */
export function pageRank(
  graph: ProductGraph,
  config: Partial<GraphConfig> = {}
): PageRankResult[] {
  const cfg: GraphConfig = {
    dampingFactor: config.dampingFactor ?? 0.85,
    restartProbability: config.restartProbability ?? 0.15,
    maxIterations: config.maxIterations ?? 100,
    tolerance: config.tolerance ?? 1e-6,
    coPurchaseWeight: config.coPurchaseWeight ?? 1.0,
    categoryWeight: config.categoryWeight ?? 0.3,
  }

  const nodeIds = Array.from(graph.nodes.keys())
  const N = nodeIds.length
  
  if (N === 0) return []

  // Initialize PageRank scores uniformly
  let scores = new Map<string, number>()
  nodeIds.forEach((id) => scores.set(id, 1 / N))

  // Iterative computation
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    const newScores = new Map<string, number>()
    let maxDiff = 0

    for (const nodeId of nodeIds) {
      // Sum of (PR(neighbor) / out-degree(neighbor)) for all neighbors linking to nodeId
      let sum = 0
      const incomingEdges = graph.reverseAdjacencyList.get(nodeId)
      
      if (incomingEdges) {
        incomingEdges.forEach((weight, neighborId) => {
          const neighborOutDegree = graph.adjacencyList.get(neighborId)?.size || 1
          sum += (scores.get(neighborId) || 0) * weight / neighborOutDegree
        })
      }

      // PageRank formula with damping factor
      const newScore = (1 - cfg.dampingFactor) / N + cfg.dampingFactor * sum
      newScores.set(nodeId, newScore)
      
      maxDiff = Math.max(maxDiff, Math.abs(newScore - (scores.get(nodeId) || 0)))
    }

    scores = newScores

    // Check convergence
    if (maxDiff < cfg.tolerance) {
      break
    }
  }

  // Normalize scores to [0, 1]
  const maxScore = Math.max(...Array.from(scores.values()))
  const normalizedScores = new Map<string, number>()
  scores.forEach((score, id) => {
    normalizedScores.set(id, maxScore > 0 ? score / maxScore : 0)
  })

  // Sort by score and assign ranks
  const results: PageRankResult[] = nodeIds
    .map((id) => ({
      productId: id,
      score: normalizedScores.get(id) || 0,
      rank: 0,
    }))
    .sort((a, b) => b.score - a.score)

  results.forEach((result, idx) => {
    result.rank = idx + 1
  })

  return results
}

// ─── Random Walk with Restart (RWR) ─────────────────────────────────────────

/**
 * Find products similar to a query product using Random Walk with Restart.
 * 
 * Simulates a random walker that:
 * 1. Starts at the query product
 * 2. Randomly walks to neighboring products (weighted by edge strength)
 * 3. Occasionally restarts at the query product (restart probability)
 * 
 * Products with higher visitation probabilities are more similar.
 * 
 * @param graph - ProductGraph
 * @param queryProductId - The product to find similar products for
 * @param topK - Number of similar products to return
 * @param config - RWR configuration
 * @returns Array of similar products ranked by similarity probability
 */
export function randomWalkWithRestart(
  graph: ProductGraph,
  queryProductId: string,
  topK: number = 10,
  config: Partial<GraphConfig> = {}
): RandomWalkResult[] {
  const cfg: GraphConfig = {
    dampingFactor: config.dampingFactor ?? 0.85,
    restartProbability: config.restartProbability ?? 0.15,
    maxIterations: config.maxIterations ?? 100,
    tolerance: config.tolerance ?? 1e-6,
    coPurchaseWeight: config.coPurchaseWeight ?? 1.0,
    categoryWeight: config.categoryWeight ?? 0.3,
  }

  if (!graph.nodes.has(queryProductId)) {
    return []
  }

  const nodeIds = Array.from(graph.nodes.keys())
  const N = nodeIds.length

  // Initialize probability vector (restart at query product)
  let probabilities = new Map<string, number>()
  nodeIds.forEach((id) => probabilities.set(id, 0))
  probabilities.set(queryProductId, 1)

  // Build column-normalized transition matrix
  const transitionMatrix = new Map<string, Map<string, number>>()
  nodeIds.forEach((fromId) => {
    const neighbors = graph.adjacencyList.get(fromId)
    if (!neighbors || neighbors.size === 0) return

    const totalWeight = Array.from(neighbors.values()).reduce((sum, w) => sum + w, 0)
    if (totalWeight === 0) return

    transitionMatrix.set(fromId, new Map())
    neighbors.forEach((weight, toId) => {
      transitionMatrix.get(fromId)!.set(toId, weight / totalWeight)
    })
  })

  // Iterative computation
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    const newProbabilities = new Map<string, number>()
    let maxDiff = 0

    for (const nodeId of nodeIds) {
      // Probability from random walk
      let walkProb = 0
      transitionMatrix.forEach((neighbors, fromId) => {
        const prob = neighbors.get(nodeId) || 0
        walkProb += prob * (probabilities.get(fromId) || 0)
      })

      // Apply restart probability
      const restartProb = nodeId === queryProductId ? cfg.restartProbability : 0
      const newProb = (1 - cfg.restartProbability) * walkProb + restartProb
      
      newProbabilities.set(nodeId, newProb)
      maxDiff = Math.max(maxDiff, Math.abs(newProb - (probabilities.get(nodeId) || 0)))
    }

    probabilities = newProbabilities

    // Check convergence
    if (maxDiff < cfg.tolerance) {
      break
    }
  }

  // Normalize probabilities
  const totalProb = Array.from(probabilities.values()).reduce((sum, p) => sum + p, 0)
  const normalizedProbs = new Map<string, number>()
  probabilities.forEach((prob, id) => {
    normalizedProbs.set(id, totalProb > 0 ? prob / totalProb : 0)
  })

  // Remove query product from results and sort
  const results: RandomWalkResult[] = nodeIds
    .filter((id) => id !== queryProductId)
    .map((id) => ({
      productId: id,
      probability: normalizedProbs.get(id) || 0,
      rank: 0,
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topK)

  results.forEach((result, idx) => {
    result.rank = idx + 1
  })

  return results
}

// ─── Hybrid Graph Recommendations ───────────────────────────────────────────

/**
 * Combine PageRank and RWR for hybrid graph-based recommendations.
 * 
 * Uses RWR for similarity and PageRank for popularity boost.
 * Final score = α × RWR_probability + (1-α) × PageRank_score
 * 
 * @param graph - ProductGraph
 * @param queryProductId - Query product
 * @param topK - Number of recommendations
 * @param alpha - Weight for RWR vs PageRank (0 to 1)
 * @param config - Algorithm configuration
 * @returns Hybrid recommendations
 */
export function hybridGraphRecommendations(
  graph: ProductGraph,
  queryProductId: string,
  topK: number = 10,
  alpha: number = 0.7,
  config: Partial<GraphConfig> = {}
): Array<{
  productId: string
  score: number
  rank: number
  rwrProbability: number
  pageRankScore: number
}> {
  // Compute both algorithms
  const rwrResults = randomWalkWithRestart(graph, queryProductId, topK * 2, config)
  const pageRankResults = pageRank(graph, config)

  // Create lookup maps
  const rwrMap = new Map(rwrResults.map((r) => [r.productId, r.probability]))
  const prMap = new Map(pageRankResults.map((r) => [r.productId, r.score]))

  // Combine scores
  const combined = rwrResults
    .filter((r) => prMap.has(r.productId))
    .map((rwr) => {
      const prScore = prMap.get(rwr.productId) || 0
      const hybridScore = alpha * rwr.probability + (1 - alpha) * prScore
      
      return {
        productId: rwr.productId,
        score: hybridScore,
        rank: 0,
        rwrProbability: rwr.probability,
        pageRankScore: prScore,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  combined.forEach((result, idx) => {
    result.rank = idx + 1
  })

  return combined
}

// ─── Graph Analytics ────────────────────────────────────────────────────────

/**
 * Compute graph statistics for admin dashboard.
 */
export function graphStatistics(graph: ProductGraph) {
  const nodeCount = graph.nodes.size
  const edgeCount = graph.edges.length
  
  // Average degree
  let totalDegree = 0
  graph.adjacencyList.forEach((neighbors) => {
    totalDegree += neighbors.size
  })
  const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0

  // Connected components (simplified BFS)
  const visited = new Set<string>()
  let components = 0
  
  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue
    
    components++
    const queue = [nodeId]
    visited.add(nodeId)
    
    while (queue.length > 0) {
      const current = queue.shift()!
      const neighbors = graph.adjacencyList.get(current)
      if (neighbors) {
        neighbors.forEach((_, neighborId) => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId)
            queue.push(neighborId)
          }
        })
      }
    }
  }

  // Top products by degree (most connected)
  const degreeMap = new Map<string, number>()
  graph.adjacencyList.forEach((neighbors, nodeId) => {
    degreeMap.set(nodeId, neighbors.size)
  })
  
  const topConnected = Array.from(degreeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([productId, degree]) => ({
      productId,
      degree,
      productName: graph.nodes.get(productId)?.label || 'Unknown',
    }))

  return {
    nodeCount,
    edgeCount,
    avgDegree: Math.round(avgDegree * 100) / 100,
    connectedComponents: components,
    topConnectedProducts: topConnected,
  }
}

/**
 * Find product clusters using simple community detection.
 * Groups products that are densely connected.
 */
export function detectCommunities(
  graph: ProductGraph,
  maxCommunities: number = 5
): Array<{
  communityId: number
  products: string[]
  size: number
  avgEdgeWeight: number
}> {
  const nodeIds = Array.from(graph.nodes.keys())
  const assignments = new Map<string, number>()
  
  // Initialize: assign each node to its own community
  nodeIds.forEach((id, idx) => assignments.set(id, idx))

  // Simple label propagation
  for (let iter = 0; iter < 10; iter++) {
    for (const nodeId of nodeIds) {
      const neighbors = graph.adjacencyList.get(nodeId)
      if (!neighbors || neighbors.size === 0) continue

      // Count community labels among neighbors
      const communityCounts = new Map<number, number>()
      neighbors.forEach((weight, neighborId) => {
        const neighborCommunity = assignments.get(neighborId)
        if (neighborCommunity !== undefined) {
          const count = communityCounts.get(neighborCommunity) || 0
          communityCounts.set(neighborCommunity, count + weight)
        }
      })

      // Assign to most common community
      let maxCount = 0
      let bestCommunity = assignments.get(nodeId) || 0
      communityCounts.forEach((count, community) => {
        if (count > maxCount) {
          maxCount = count
          bestCommunity = community
        }
      })

      assignments.set(nodeId, bestCommunity)
    }
  }

  // Group products by community
  const communityMap = new Map<number, string[]>()
  assignments.forEach((community, productId) => {
    if (!communityMap.has(community)) communityMap.set(community, [])
    communityMap.get(community)!.push(productId)
  })

  // Limit to maxCommunities largest communities
  const communities = Array.from(communityMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxCommunities)
    .map(([communityId, products], idx) => {
      // Calculate average edge weight within community
      let totalWeight = 0
      let edgeCount = 0
      for (const productId of products) {
        const neighbors = graph.adjacencyList.get(productId)
        if (neighbors) {
          neighbors.forEach((weight, neighborId) => {
            if (products.includes(neighborId)) {
              totalWeight += weight
              edgeCount++
            }
          })
        }
      }

      return {
        communityId: idx + 1,
        products,
        size: products.length,
        avgEdgeWeight: edgeCount > 0 ? totalWeight / edgeCount : 0,
      }
    })

  return communities
}