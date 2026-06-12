// app/components/product/ProductCard.tsx

'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { Product } from '@/app/types/product'
import { useCart } from '@/app/hooks/useCart'
import { useWishlist } from '@/app/hooks/useWishList'
import { useCompare } from '@/app/hooks/useCompare'
import { cn } from '@/app/lib/utils/cn'
import ProductQuickView from './ProductQuickView'
import { getStockStatus } from '@/app/lib/utils/stockStatus'

interface Props {
  product: Product
  index?: number
}

export default function ProductCard({ product, index = 0 }: Props) {
  const { addItem } = useCart()
  const { toggleItem: toggleWishlist, isInWishlist } = useWishlist()
  const { toggleItem: toggleCompare, isInCompare } = useCompare()
  const [added, setAdded] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  const [quickViewOpen, setQuickViewOpen] = useState(false)

  const isWished = isInWishlist(product.id)
  const isCompared = isInCompare(product.id)

  const discountedPrice = product.discount_percent
    ? product.price * (1 - product.discount_percent / 100)
    : null

  const images = product.images?.length ? product.images : product.image_url ? [product.image_url] : []
  const stockDisplay = getStockStatus(product.stock_quantity)

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!product.in_stock) return
    addItem(product)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleWishlist(product)
  }

  const handleCompareToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleCompare(product)
  }

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setQuickViewOpen(true)
  }

  return (
    <div
      className="group animate-fade-up flex flex-col"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Image Container */}
      <Link
        href={`/product/${product.id}`}
        className="block relative overflow-hidden rounded-2xl bg-bushal-ivoryDeep aspect-[3/4] shadow-card hover:shadow-cardHover transition-all duration-500 ease-out"
      >
        <div
          className="absolute inset-0"
          onMouseEnter={() => images.length > 1 && setImgIndex(1)}
          onMouseLeave={() => setImgIndex(0)}
        >
          {images.length > 0 ? (
            <>
              <img
                src={images[0] ?? undefined}
                alt={product.name}
                className={cn(
                  'absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-out',
                  imgIndex === 1 ? 'opacity-0 scale-110' : 'opacity-100 group-hover:scale-105'
                )}
              />
              {images.length > 1 && (
                <img
                  src={images[1] ?? undefined}
                  alt={product.name}
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-out',
                    imgIndex === 1 ? 'opacity-100 scale-105' : 'opacity-0 scale-100'
                  )}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Inner Vignette */}
        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Discount Badge */}
        {product.discount_percent && (
          <div className="absolute top-4 left-4 z-10 bg-bushal-forest text-bushal-copperGlow text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 shadow-lg shadow-black/10">
            −{product.discount_percent}%
          </div>
        )}

        {/* Stock Status Badge */}
        {product.stock_quantity === 0 ? (
          <div className="absolute top-4 left-4 z-10 bg-bushal-dangerBg/90 backdrop-blur-md text-bushal-danger text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-bushal-danger/20">
            Sold Out
          </div>
        ) : product.stock_quantity <= 5 ? (
          <div className="absolute top-4 left-4 z-10 bg-bushal-warningBg/90 backdrop-blur-md text-bushal-warning text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-bushal-warning/20">
            Only {product.stock_quantity} left
          </div>
        ) : null}

        {/* Wishlist Button (Top Right) */}
        <button
          onClick={handleWishlistToggle}
          className={cn(
            "absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 z-10 backdrop-blur-md",
            isWished
              ? "bg-bushal-copper text-white scale-110 shadow-lg shadow-bushal-copper/30"
              : "bg-bushal-ivory/80 text-bushal-forest hover:bg-bushal-ivory hover:scale-110"
          )}
          aria-label={isWished ? "Remove from wishlist" : "Add to wishlist"}
        >
          <svg className="w-4 h-4" fill={isWished ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        {/* Compare Button (Bottom Left) - Links to /compare when clicked */}
        <button
          onClick={handleCompareToggle}
          className={cn(
            "absolute bottom-5 left-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 z-10 backdrop-blur-md",
            isCompared
              ? "bg-bushal-forest text-white scale-110 shadow-lg shadow-bushal-forest/30"
              : "bg-bushal-ivory/90 text-bushal-forest hover:bg-bushal-ivory hover:scale-110 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 shadow-lg"
          )}
          aria-label={isCompared ? "Remove from compare" : "Add to compare"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
        </button>

        {/* Quick View Button (Bottom Right) */}
        <button
          onClick={handleQuickView}
          className="absolute bottom-5 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-bushal-ivory/90 backdrop-blur-md text-bushal-forest hover:bg-bushal-ivory hover:scale-110 transition-all duration-300 z-10 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 shadow-lg"
          aria-label="Quick view"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        {/* Quick Add Overlay (Desktop Only) */}
        <div className="absolute inset-x-2 bottom-0 px-16 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out z-10 hidden md:block">
          <button
            onClick={handleAdd}
            disabled={!product.in_stock}
            className={cn(
              "w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300 shadow-xl backdrop-blur-md hover:bg-bushal-copperLight",
              product.in_stock
                ? added
                  ? "bg-bushal-success text-white"
                  : "bg-bushal-forest/95 text-bushal-ivory hover:bg-bushal-forest active:scale-[0.98]"
                : "bg-bushal-ivory/80 text-bushal-inkSoft cursor-not-allowed"
            )}
          >
            {added ? "Added to Bag ✓" : product.in_stock ? "Add to Bag" : "Sold Out"}
          </button>
        </div>
      </Link>

      {/* Content Section */}
      <div className="pt-5 px-1 flex flex-col flex-1">
        {/* Category Eyebrow */}
        {product.category && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bushal-copper mb-2">
            {product.category}
          </p>
        )}

        {/* Product Name */}
        <Link href={`/product/${product.id}`} className="group/link block">
          <h3
            className={cn(
              "font-heading text-xl leading-tight mb-2 transition-colors duration-300 line-clamp-2",
              product.discount_percent ? "italic text-bushal-forest group-hover/link:text-bushal-copper" : "text-bushal-forest group-hover/link:text-bushal-copper"
            )}
          >
            {product.name}
          </h3>
        </Link>

        {/* Price & Actions */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-bushal-border/50">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-2xl font-semibold text-bushal-copper">
              {formatPrice(discountedPrice ?? product.price)}
            </span>
            {discountedPrice && (
              <span className="text-xs text-bushal-inkSoft line-through font-body">
                {formatPrice(product.price)}
              </span>
            )}
          </div>

          {/* Mobile Add Button */}
          <button
            onClick={handleAdd}
            disabled={!product.in_stock}
            className={cn(
              "md:hidden w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shadow-md",
              product.in_stock
                ? added
                  ? "bg-bushal-success text-white"
                  : "bg-bushal-copper text-white hover:bg-bushal-copperLight shadow-bushal-copper/20"
                : "bg-bushal-border text-bushal-inkSoft cursor-not-allowed"
            )}
            aria-label="Add to cart"
          >
            {added ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <ProductQuickView
        product={quickViewOpen ? product : null}
        onClose={() => setQuickViewOpen(false)}
      />
    </div>
  )
}