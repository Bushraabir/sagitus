// app/components/product/TrendingNow.tsx

/**
 * ============================================================================
 * TRENDING NOW COMPONENT
 * ============================================================================
 * 
 * A premium, responsive section that displays products currently experiencing
 * a surge in sales velocity. It fetches data from the Trending Products API
 * (which uses Exponential Moving Average algorithms) and renders a beautiful
 * grid of "hot" items.
 * 
 * FEATURES:
 * - Fetches real-time trending data from the API
 * - Displays "HOT" and "TRENDING" badges with fire icons
 * - Shows growth percentage and sales velocity metrics
 * - Uses Framer Motion for buttery-smooth entrance animations
 * - Responsive grid layout (2 cols on mobile, 4 on desktop)
 * - Follows the Bushal luxury design system
 * 
 * USAGE:
 * <TrendingNow className="mt-12" />
 * ============================================================================
 */

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'

// ─── Types ─────────────────────────────────────────────────────────────────

interface TrendingProduct {
  product_id: string
  product_name: string
  category: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
  trend_status: 'HOT' | 'TRENDING' | 'STABLE' | 'DECLINING'
  trend_score: number
  growth_percentage: number
  seven_day_total: number
}

interface Props {
  className?: string
  limit?: number
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TrendingNow({ className, limit = 8 }: Props) {
  const [products, setProducts] = useState<TrendingProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setLoading(true)
        setError('')
        
        const response = await fetch(`/api/products/trending?limit=${limit}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch trending products')
        }
        
        const data = await response.json()
        
        if (data.success && data.trendingProducts?.length > 0) {
          // Filter to only show HOT and TRENDING items for maximum impact
          const hotItems = data.trendingProducts.filter(
            (p: TrendingProduct) => p.trend_status === 'HOT' || p.trend_status === 'TRENDING'
          )
          setProducts(hotItems.length > 0 ? hotItems : data.trendingProducts.slice(0, limit))
        } else {
          setProducts([])
        }
      } catch (err) {
        console.error('[TrendingNow] Error fetching data:', err)
        setError('Unable to load trending products')
        setProducts([])
      } finally {
        setLoading(false)
      }
    }

    fetchTrending()
  }, [limit])

  // Don't render if no products or error
  if (!loading && products.length === 0) {
    return null
  }

  return (
    <section className={cn('mt-20 lg:mt-28', className)}>
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-5 mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bushal-dangerBg border border-bushal-danger/20 flex items-center justify-center text-bushal-danger">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-bushal-danger mb-1">
              Real-time demand
            </p>
            <h2 className="font-heading text-3xl text-bushal-forest">
              Trending Now
            </h2>
          </div>
        </div>
        <div className="flex-1 h-px bg-bushal-border" />
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden animate-pulse"
            >
              <div className="aspect-[3/4] bg-bushal-ivoryDeep" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-bushal-ivoryDeep rounded w-3/4" />
                <div className="h-3 bg-bushal-ivoryDeep rounded w-1/2" />
                <div className="h-10 bg-bushal-ivoryDeep rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-bushal-dangerBg border border-bushal-danger/20 rounded-2xl p-6 text-center">
          <p className="text-sm text-bushal-danger">{error}</p>
        </div>
      )}

      {/* Products Grid */}
      {!loading && products.length > 0 && (
        <motion.div
          layout
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"
        >
          {products.map((product, index) => {
            const cover = (Array.isArray(product.images) && product.images[0]) || product.image_url
            const isHot = product.trend_status === 'HOT'
            
            return (
              <motion.div
                key={product.product_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card hover:shadow-cardHover transition-all duration-300"
              >
                {/* Image */}
                <Link
                  href={`/product/${product.product_id}`}
                  className="block relative aspect-[3/4] overflow-hidden bg-bushal-ivoryDeep"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={product.product_name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Trend Badge */}
                  <div className={cn(
                    "absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md shadow-lg",
                    isHot 
                      ? "bg-bushal-danger/90 text-white border border-bushal-danger/50" 
                      : "bg-bushal-warning/90 text-white border border-bushal-warning/50"
                  )}>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/>
                    </svg>
                    {product.trend_status}
                  </div>

                  {/* Growth Badge */}
                  {product.growth_percentage > 0 && (
                    <div className="absolute bottom-3 right-3 bg-bushal-success/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md border border-bushal-success/50 shadow-lg">
                      ↑ {product.growth_percentage.toFixed(0)}%
                    </div>
                  )}
                </Link>

                {/* Details */}
                <div className="p-4 flex flex-col gap-2">
                  {/* Category */}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-bushal-copper">
                    {product.category}
                  </p>

                  {/* Name */}
                  <Link href={`/product/${product.product_id}`} className="group/link">
                    <h3 className="font-heading text-base text-bushal-forest leading-tight line-clamp-2 group-hover/link:text-bushal-copper transition-colors">
                      {product.product_name}
                    </h3>
                  </Link>

                  {/* Price & Metrics */}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-bushal-border/50">
                    <span className="font-heading text-lg font-semibold text-bushal-forest">
                      {formatPrice(product.price)}
                    </span>
                    <span className="text-[10px] text-bushal-inkSoft font-medium">
                      {product.seven_day_total} sold this week
                    </span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Footer Note */}
      {!loading && products.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xs text-bushal-inkSoft text-center mt-6"
        >
          Powered by Exponential Moving Average (EMA) · Updated hourly
        </motion.p>
      )}
    </section>
  )
}