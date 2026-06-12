/**
 * ============================================================================
 * PRODUCT GRAPH VISUALIZATION - ADMIN PAGE
 * ============================================================================
 * 
 * This page provides the admin with an Obsidian-style graph visualization
 * of product relationships. It uses PageRank and Random Walk algorithms
 * to identify important products and hidden connections.
 * 
 * FEATURES:
 * - Fetches historical co-purchase data and product catalog
 * - Builds a product graph using the engine from File #18
 * - Calculates PageRank scores to find "hub" products
 * - Visualizes the graph using an SVG circular layout
 * - Highlights high-importance nodes (PageRank) and strong edges
 * - Provides a leaderboard of top-ranked products
 * 
 * ALGORITHM: PageRank & Graph Theory
 * ============================================================================
 */

import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { Metadata } from 'next'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'
import {
  buildProductGraph,
  pageRank,
  graphStatistics,
  type ProductGraph,
  type PageRankResult,
} from '@/lib/recommendations/productGraph'

export const metadata: Metadata = {
  title: 'Product Graph Intelligence',
  description: 'Visualize product relationships and importance using PageRank and graph theory.',
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Graph Layout Calculation ───────────────────────────────────────────────

interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
  score: number
  rank: number
  category: string
}

interface LayoutEdge {
  from: string
  to: string
  weight: number
}

function calculateCircularLayout(
  nodes: LayoutNode[],
  width: number,
  height: number,
  radius: number
): LayoutNode[] {
  const cx = width / 2
  const cy = height / 2
  const angleStep = (2 * Math.PI) / nodes.length

  return nodes.map((node, i) => ({
    ...node,
    x: cx + radius * Math.cos(i * angleStep - Math.PI / 2), // Start from top
    y: cy + radius * Math.sin(i * angleStep - Math.PI / 2),
  }))
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default async function GraphRecommendationsPage() {
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const supabase = await auth.supabase

  // 1. Fetch all active products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category, price, in_stock, images, image_url')
    .is('is_deleted', false)
    .eq('in_stock', true)

  if (productsError) {
    console.error('[Graph Page] Error fetching products:', productsError)
  }

  // 2. Fetch all fulfilled order items (for co-purchase edges)
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity')
    .in(
      'order_id',
      (
        await supabase
          .from('orders')
          .select('id')
          .eq('status', 'fulfilled')
      ).data?.map((o: any) => o.id) ?? []
    )

  if (itemsError) {
    console.error('[Graph Page] Error fetching order items:', itemsError)
  }

  // 3. Build Graph and Calculate Metrics
  const activeProducts = products ?? []
  const activeOrderItems = orderItems ?? []

  const graph: ProductGraph = buildProductGraph(
    activeOrderItems.map((item: any) => ({
      order_id: item.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    activeProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || 'General',
      price: p.price,
      in_stock: p.in_stock,
    }))
  )

  const pageRankResults: PageRankResult[] = pageRank(graph, {
    dampingFactor: 0.85,
    maxIterations: 50, // Limit iterations for server-side performance
  })

  const stats = graphStatistics(graph)

  // 4. Prepare Layout Data (Top 24 products for clean visualization)
  const topProductIds = new Set(pageRankResults.slice(0, 24).map((r) => r.productId))
  
  const layoutNodes: LayoutNode[] = pageRankResults
    .filter((r) => topProductIds.has(r.productId))
    .map((r) => {
      const product = activeProducts.find((p: any) => p.id === r.productId)
      return {
        id: r.productId,
        label: product?.name ?? 'Unknown',
        score: r.score,
        rank: r.rank,
        category: product?.category ?? 'General',
        x: 0,
        y: 0,
      }
    })

  const positionedNodes = calculateCircularLayout(layoutNodes, 800, 800, 320)
  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]))

  const layoutEdges: LayoutEdge[] = graph.edges
    .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
    .map((e) => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
    }))

  // 5. Calculate Summary Metrics
  const totalProducts = activeProducts.length
  const totalEdges = graph.edges.length
  const avgDegree = stats.avgDegree
  const topHub = pageRankResults[0]
  const topHubProduct = activeProducts.find((p: any) => p.id === topHub?.productId)

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bushal-success animate-pulse" />
            <span className="text-[10px] font-bold text-bushal-success uppercase tracking-widest">
              Live · Graph Theory
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-bushal-forest tracking-tight font-heading">
            Product Graph Intelligence
          </h1>
          <p className="text-sm text-bushal-inkSoft mt-1">
            Obsidian-style node visualization · PageRank importance · {totalProducts} products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Products
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Graph Nodes
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {stats.nodeCount}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Active products</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Graph Edges
          </p>
          <p className="text-2xl font-extrabold text-bushal-copper tabular-nums font-heading">
            {stats.edgeCount}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Relationships</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Avg Degree
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {avgDegree}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Connections per node</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Top Hub Product
          </p>
          <p className="text-lg font-extrabold text-bushal-forest truncate font-heading" title={topHubProduct?.name}>
            {topHubProduct?.name ?? 'N/A'}
          </p>
          <p className="text-xs text-bushal-copper mt-1 font-semibold">
            Score: {topHub?.score.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Main Content: Graph + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Visualization */}
        <div className="lg:col-span-2 bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-bushal-border bg-bushal-ivoryDeep/30">
            <h2 className="text-sm font-bold text-bushal-forest">
              Product Relationship Graph
            </h2>
            <p className="text-xs text-bushal-inkSoft mt-0.5">
              Nodes = Products · Edges = Co-purchases · Size = PageRank Importance
            </p>
          </div>

          <div className="p-6 flex items-center justify-center bg-gradient-to-br from-bushal-ivory to-white min-h-[500px]">
            {positionedNodes.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-bushal-ivoryDeep flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-bushal-inkSoft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-bushal-forest">No graph data available</p>
                <p className="text-xs text-bushal-inkSoft mt-1">
                  Need more co-purchase data to build relationships.
                </p>
              </div>
            ) : (
              <svg
                viewBox="0 0 800 800"
                className="w-full h-full max-w-[600px] max-h-[600px]"
                style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))' }}
              >
                {/* Edges */}
                {layoutEdges.map((edge, i) => {
                  const fromNode = nodeMap.get(edge.from)
                  const toNode = nodeMap.get(edge.to)
                  if (!fromNode || !toNode) return null
                  
                  // Thicker lines for stronger relationships
                  const strokeWidth = Math.max(0.5, edge.weight * 3)
                  const opacity = Math.min(0.6, edge.weight * 0.8)
                  
                  return (
                    <line
                      key={`edge-${i}`}
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#B87333" // Copper
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                      className="transition-all duration-300 hover:opacity-100 hover:stroke-[#1A362D]"
                    />
                  )
                })}

                {/* Nodes */}
                {positionedNodes.map((node) => {
                  // Node radius based on PageRank score
                  const baseRadius = 12
                  const scoreRadius = node.score * 40
                  const radius = Math.min(28, Math.max(8, baseRadius + scoreRadius))
                  
                  // Color based on rank (Top 3 get Copper, rest get Forest)
                  const isTopTier = node.rank <= 3
                  const fillColor = isTopTier ? '#B87333' : '#1A362D'
                  const strokeColor = isTopTier ? '#F0B96A' : '#2D5A42'

                  return (
                    <g key={`node-${node.id}`} className="group cursor-pointer">
                      {/* Glow effect for top nodes */}
                      {isTopTier && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius + 6}
                          fill="#B87333"
                          opacity="0.15"
                          className="animate-pulse"
                        />
                      )}
                      
                      {/* Main Node Circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth="2"
                        className="transition-all duration-300 group-hover:r-[32px] group-hover:stroke-[#F0B96A] group-hover:stroke-[3px]"
                      />
                      
                      {/* Node Label (Truncated) */}
                      <text
                        x={node.x}
                        y={node.y + radius + 14}
                        textAnchor="middle"
                        className="text-[10px] font-semibold fill-bushal-ink pointer-events-none"
                        style={{ fontFamily: 'system-ui, sans-serif' }}
                      >
                        {node.label.length > 18 ? node.label.substring(0, 18) + '...' : node.label}
                      </text>

                      {/* Hover Tooltip (ForeignObject for HTML) */}
                      <foreignObject
                        x={node.x - 60}
                        y={node.y - radius - 50}
                        width="120"
                        height="40"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                      >
                        <div className="bg-bushal-forest text-white text-[10px] px-2 py-1 rounded shadow-lg text-center whitespace-nowrap overflow-hidden text-ellipsis">
                          #{node.rank} · {node.category}
                        </div>
                      </foreignObject>
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </div>

        {/* PageRank Leaderboard */}
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-bushal-border bg-bushal-copper/5">
            <h2 className="text-sm font-bold text-bushal-forest">
              PageRank Leaderboard
            </h2>
            <p className="text-xs text-bushal-inkSoft mt-0.5">
              Most influential products in the network
            </p>
          </div>

          <div className="divide-y divide-bushal-ivory max-h-[600px] overflow-y-auto no-scrollbar">
            {pageRankResults.slice(0, 15).map((result, index) => {
              const product = activeProducts.find((p: any) => p.id === result.productId)
              const cover = (Array.isArray(product?.images) && product?.images[0]) || product?.image_url
              const isTop3 = index < 3

              return (
                <Link
                  key={result.productId}
                  href={`/admin/products/${result.productId}/edit`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-bushal-ivoryDeep/50 transition-colors group"
                >
                  {/* Rank Badge */}
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                    isTop3 
                      ? "bg-bushal-copper text-white shadow-md shadow-bushal-copper/30" 
                      : "bg-bushal-ivoryDeep text-bushal-inkSoft"
                  )}>
                    {result.rank}
                  </div>

                  {/* Product Image */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-bushal-ivoryDeep border border-bushal-border flex-shrink-0">
                    {cover ? (
                      <img src={cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-bushal-borderMid text-xs">
                        📦
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-bushal-ink truncate group-hover:text-bushal-copper transition-colors">
                      {product?.name ?? 'Unknown'}
                    </p>
                    <p className="text-[10px] text-bushal-inkSoft">
                      {product?.category ?? 'General'} · {formatPrice(product?.price ?? 0)}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-bushal-forest tabular-nums">
                      {result.score.toFixed(3)}
                    </p>
                    <p className="text-[9px] text-bushal-inkSoft">PR Score</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Algorithm Info */}
      <div className="bg-gradient-to-br from-bushal-forest to-bushal-forestMid rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-bushal-copperGlow mb-2">
              About This Graph
            </h3>
            <p className="text-xs text-white/80 leading-relaxed mb-3">
              This visualization uses <strong className="text-white">PageRank</strong>, the same algorithm Google uses to rank web pages. 
              In our context, a product is "important" if it is frequently bought alongside other important products. 
              This helps identify hidden "hub" products that drive sales across categories.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Damping Factor</p>
                <p className="text-white/60">0.85 (Standard)</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Edge Type</p>
                <p className="text-white/60">Co-purchases</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Node Size</p>
                <p className="text-white/60">PageRank Score</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-bushal-copperGlow font-bold">Edge Width</p>
                <p className="text-white/60">Purchase Frequency</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}