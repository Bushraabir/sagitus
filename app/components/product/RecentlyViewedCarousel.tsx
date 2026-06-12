// app/components/product/RecentlyViewedCarousel.tsx

// A premium, horizontal-scrolling carousel that displays products 
// the user has recently viewed. It uses the `useRecentlyViewed` 
// Zustand hook to fetch data from localStorage.

'use client'

import { useRecentlyViewed } from '@/app/hooks/useRecentlyViewed'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import Link from 'next/link'
import { cn } from '@/app/lib/utils/cn'

interface Props {
  // Pass the current product ID to exclude it from the carousel
  currentProductId?: string 
  className?: string
}

export default function RecentlyViewedCarousel({ currentProductId, className }: Props) {
  const { items } = useRecentlyViewed()

  // Filter out the current product and limit to 8 items
  const relevantItems = items
    .filter((item) => item.id !== currentProductId)
    .slice(0, 8)

  // If there are no other recently viewed items, don't render anything
  if (relevantItems.length === 0) return null

  return (
    <section className={cn('mt-20 lg:mt-28', className)}>
      {/* Section Header */}
      <div className="flex items-center gap-5 mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-bushal-copper mb-1">
            Your browsing history
          </p>
          <h2 className="font-heading text-3xl text-bushal-forest">
            Recently Viewed
          </h2>
        </div>
        <div className="flex-1 h-px bg-bushal-border" />
      </div>

      {/* Horizontal Scroll Container */}
      <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4">
          {relevantItems.map((item) => {
            const cover = (Array.isArray(item.images) && item.images[0]) || item.image_url
            const discountedPrice = item.discount_percent
              ? item.price * (1 - item.discount_percent / 100)
              : null

            return (
              <Link
                key={item.id}
                href={`/product/${item.id}`}
                className="group flex-shrink-0 w-[160px] sm:w-[200px] snap-start"
              >
                {/* Image */}
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-bushal-ivoryDeep border border-bushal-border mb-3">
                  {cover ? (
                    <img
                      src={cover}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Stock Badge */}
                  {!item.in_stock && (
                    <div className="absolute top-2 left-2 bg-bushal-dangerBg/90 backdrop-blur-sm text-bushal-danger text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded-md">
                      Sold Out
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1">
                  <h3 className="font-heading text-base text-bushal-forest leading-tight line-clamp-2 group-hover:text-bushal-copper transition-colors">
                    {item.name}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading text-lg font-semibold text-bushal-copper">
                      {formatPrice(discountedPrice ?? item.price)}
                    </span>
                    {discountedPrice && (
                      <span className="text-xs text-bushal-inkSoft line-through">
                        {formatPrice(item.price)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
