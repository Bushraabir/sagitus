//app/components/product/FrequentlyBoughtTogether.tsx

/**
 * ============================================================================
 * FREQUENTLY BOUGHT TOGETHER COMPONENT
 * ============================================================================
 * 
 * This component displays products that are frequently purchased together
 * with the current product, using the Apriori association rule mining algorithm.
 * 
 * FEATURES:
 * - Fetches recommendations from the /api/recommendations/frequently-bought API
 * - Displays product cards with image, name, price, and confidence score
 * - Includes "Add to Cart" functionality for each recommended product
 * - Shows a reason/explanation for why the product is recommended
 * - Uses Framer Motion for smooth entrance animations
 * - Follows the Bushal luxury design system
 * 
 * USAGE:
 * <FrequentlyBoughtTogether productId={product.id} />
 * 
 * PLACEMENT:
 * Should be placed below the review section on the product detail page
 * ============================================================================
 */

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { useCart } from '@/app/hooks/useCart'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────────────────────

interface FBTRecommendation {
  product_id: string
  name: string
  price: number
  image_url: string | null
  images: string[]
  in_stock: boolean
  support: number
  confidence: number
  lift: number
  frequency: number
  reason: string
}

interface Props {
  productId: string
  className?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FrequentlyBoughtTogether({ productId, className }: Props) {
  const { addItem } = useCart()
  const [recommendations, setRecommendations] = useState<FBTRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true)
        setError('')
        
        const response = await fetch(`/api/recommendations/frequently-bought/${productId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch recommendations')
        }
        
        const data = await response.json()
        
        if (data.success && data.recommendations?.length > 0) {
          setRecommendations(data.recommendations)
        } else {
          setRecommendations([])
        }
      } catch (err) {
        console.error('[FBT Component] Error fetching recommendations:', err)
        setError('Unable to load recommendations')
        setRecommendations([])
      } finally {
        setLoading(false)
      }
    }

    if (productId) {
      fetchRecommendations()
    }
  }, [productId])

  const handleAddToCart = (recommendation: FBTRecommendation) => {
    if (!recommendation.in_stock) return
    
    // Create a Product-like object for the cart
    const productForCart = {
      id: recommendation.product_id,
      name: recommendation.name,
      price: recommendation.price,
      image_url: recommendation.image_url,
      images: recommendation.images,
      in_stock: recommendation.in_stock,
      stock_quantity: 99, // Assume in stock
    }
    
    addItem(productForCart as any)
    
    // Track which items were added for UI feedback
    setAddedIds(prev => new Set(prev).add(recommendation.product_id))
    
    // Reset after 2 seconds
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev)
        next.delete(recommendation.product_id)
        return next
      })
    }, 2000)
  }

  // Don't render if no recommendations
  if (!loading && recommendations.length === 0) {
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
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-bushal-copper mb-1">
            Amazon-style recommendations
          </p>
          <h2 className="font-heading text-3xl text-bushal-forest">
            Frequently Bought Together
          </h2>
          <p className="text-sm text-bushal-inkSoft mt-1">
            Products commonly purchased with this item
          </p>
        </div>
        <div className="flex-1 h-px bg-bushal-border" />
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
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

      {/* Recommendations Grid */}
      {!loading && recommendations.length > 0 && (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6"
        >
          {recommendations.map((rec, index) => {
            const cover = (Array.isArray(rec.images) && rec.images[0]) || rec.image_url
            const isAdded = addedIds.has(rec.product_id)
            const confidencePercent = Math.round(rec.confidence * 100)
            
            return (
              <motion.div
                key={rec.product_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="group bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card hover:shadow-cardHover transition-all duration-300"
              >
                {/* Image */}
                <Link
                  href={`/product/${rec.product_id}`}
                  className="block relative aspect-[3/4] overflow-hidden bg-bushal-ivoryDeep"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={rec.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Confidence Badge */}
                  <div className="absolute top-3 left-3 bg-bushal-forest/90 backdrop-blur-sm text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-md">
                    {confidencePercent}% match
                  </div>
                  
                  {/* Stock Badge */}
                  {!rec.in_stock && (
                    <div className="absolute bottom-3 left-3 bg-bushal-danger/90 backdrop-blur-sm text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-md">
                      Sold Out
                    </div>
                  )}
                </Link>

                {/* Details */}
                <div className="p-4 flex flex-col gap-3">
                  <Link href={`/product/${rec.product_id}`} className="group/link">
                    <h3 className="font-heading text-lg text-bushal-forest leading-tight line-clamp-2 group-hover/link:text-bushal-copper transition-colors">
                      {rec.name}
                    </h3>
                  </Link>

                  {/* Price */}
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading text-xl font-semibold text-bushal-copper">
                      {formatPrice(rec.price)}
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-xs text-bushal-inkSoft leading-relaxed line-clamp-2">
                    {rec.reason}
                  </p>

                  {/* Metrics */}
                  <div className="flex items-center gap-2 text-[10px] text-bushal-inkSoft">
                    <span className="bg-bushal-ivoryDeep px-2 py-0.5 rounded-full">
                      Bought {rec.frequency}× together
                    </span>
                    <span className="bg-bushal-copper/10 text-bushal-copper px-2 py-0.5 rounded-full font-semibold">
                      Lift: {rec.lift.toFixed(1)}
                    </span>
                  </div>

                  {/* Add to Cart Button */}
                  <button
                    onClick={() => handleAddToCart(rec)}
                    disabled={!rec.in_stock || isAdded}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all",
                      rec.in_stock
                        ? isAdded
                          ? "bg-bushal-success text-white"
                          : "bg-bushal-forest text-white hover:bg-bushal-forestMid active:scale-[0.97]"
                        : "bg-bushal-ivoryDeep text-bushal-inkSoft cursor-not-allowed"
                    )}
                  >
                    {isAdded ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Added!
                      </span>
                    ) : rec.in_stock ? (
                      "Add to Bag"
                    ) : (
                      "Unavailable"
                    )}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Footer Note */}
      {!loading && recommendations.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xs text-bushal-inkSoft text-center mt-6"
        >
          Recommendations powered by Apriori algorithm · Based on {recommendations.length > 0 ? 'real purchase patterns' : 'historical data'}
        </motion.p>
      )}
    </section>
  )
}