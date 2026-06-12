/**
 * ============================================================================
 * DEDICATED COMPARE PAGE
 * ============================================================================
 * 
 * A premium, full-page view for comparing selected products side-by-side.
 * Uses the `useCompare` Zustand hook to fetch items from localStorage.
 * Features a sticky header, responsive table layout, and direct "Add to Bag" actions.
 * ============================================================================
 */

'use client'

import { useCompare } from '@/app/hooks/useCompare'
import { useCart } from '@/app/hooks/useCart'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'
import Navbar from '@/app/components/layout/Navbar'
import Footer from '@/app/components/layout/Footer'
import BottomNav from '@/app/components/layout/BottomNav'
import PageWrapper from '@/app/components/layout/PageWrapper'
import EmptyState from '@/app/components/ui/EmptyState'
import { motion, AnimatePresence } from 'framer-motion'

export default function ComparePage() {
  const { items, removeItem, clearCompare } = useCompare()
  const { addItem } = useCart()

  const handleMoveToCart = (item: any) => {
    const productForCart = {
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      images: item.images,
      discount_percent: item.discount_percent,
      in_stock: item.in_stock,
      stock_quantity: item.stock_quantity,
      created_at: item.created_at ?? new Date().toISOString(),
    }
    addItem(productForCart)
    removeItem(item.id)
  }

  // Empty State
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-bushal-ivory">
        <Navbar />
        <PageWrapper maxWidth="5xl" className="py-16">
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="No products to compare"
            description="Select up to 4 products from the catalog to compare them side-by-side."
            action={
              <Link
                href="/dashboard"
                className="btn-copper text-white text-sm font-semibold px-8 py-3 rounded-xl inline-block"
              >
                Browse Products
              </Link>
            }
          />
        </PageWrapper>
        <Footer />
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bushal-ivory">
      <Navbar />
      <PageWrapper maxWidth="7xl" className="py-10 pb-28 md:pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-bushal-border">
          <div>
            <h1 className="font-heading text-3xl md:text-4xl text-bushal-forest tracking-tight">
              Product Comparison
            </h1>
            <p className="text-sm text-bushal-inkSoft mt-1">
              Comparing {items.length} of 4 allowed items
            </p>
          </div>
          <button
            onClick={clearCompare}
            className="text-xs font-semibold text-bushal-danger hover:text-bushal-danger/80 transition-colors self-start sm:self-auto"
          >
            Clear All
          </button>
        </div>

        {/* Comparison Table */}
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              {/* Product Headers */}
              <thead>
                <tr>
                  <th className="w-32 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wider p-4 bg-bushal-ivoryDeep/50 sticky left-0 z-10 border-b border-r border-bushal-border">
                    Product
                  </th>
                  {items.map((item) => {
                    const cover = (Array.isArray(item.images) && item.images[0]) || item.image_url
                    return (
                      <th key={item.id} className="w-64 text-center p-4 bg-bushal-ivoryDeep/50 border-b border-bushal-border relative">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-bushal-surface text-bushal-inkSoft hover:text-bushal-danger hover:bg-bushal-dangerBg transition-colors border border-bushal-border"
                          title="Remove from comparison"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <Link href={`/product/${item.id}`} className="block group">
                          <div className="aspect-square bg-bushal-ivoryDeep rounded-xl overflow-hidden mb-3 border border-bushal-border mx-auto max-w-[160px]">
                            {cover ? (
                              <img src={cover} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-bushal-forest line-clamp-2 font-heading leading-tight group-hover:text-bushal-copper transition-colors">
                            {item.name}
                          </p>
                        </Link>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-bushal-border">
                {/* Price Row */}
                <tr>
                  <td className="p-4 font-semibold text-bushal-ink bg-bushal-ivoryDeep/30 sticky left-0 z-10 border-r border-bushal-border text-sm">
                    Price
                  </td>
                  {items.map((item) => {
                    const dp = item.discount_percent ? item.price * (1 - item.discount_percent / 100) : null
                    return (
                      <td key={item.id} className="p-4 text-center">
                        <div className="font-bold text-lg text-bushal-copper">
                          {formatPrice(dp ?? item.price)}
                        </div>
                        {dp && (
                          <div className="text-xs text-bushal-inkSoft line-through mt-1">
                            {formatPrice(item.price)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>

                {/* Category Row */}
                <tr>
                  <td className="p-4 font-semibold text-bushal-ink bg-bushal-ivoryDeep/30 sticky left-0 z-10 border-r border-bushal-border text-sm">
                    Category
                  </td>
                  {items.map((item) => (
                    <td key={item.id} className="p-4 text-center">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-bushal-ivoryDeep text-bushal-inkMid">
                        {item.category || 'General'}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Stock Row */}
                <tr>
                  <td className="p-4 font-semibold text-bushal-ink bg-bushal-ivoryDeep/30 sticky left-0 z-10 border-r border-bushal-border text-sm">
                    Availability
                  </td>
                  {items.map((item) => (
                    <td key={item.id} className="p-4 text-center">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                        item.in_stock ? "bg-bushal-successBg text-bushal-success" : "bg-bushal-dangerBg text-bushal-danger"
                      )}>
                        {item.in_stock ? `${item.stock_quantity} in stock` : 'Out of Stock'}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Description Row */}
                <tr>
                  <td className="p-4 font-semibold text-bushal-ink bg-bushal-ivoryDeep/30 sticky left-0 z-10 border-r border-bushal-border text-sm align-top">
                    Description
                  </td>
                  {items.map((item) => (
                    <td key={item.id} className="p-4 text-center align-top">
                      <p className="text-xs text-bushal-inkSoft line-clamp-4 leading-relaxed">
                        {item.description || 'No description available for this product.'}
                      </p>
                    </td>
                  ))}
                </tr>

                {/* Action Row */}
                <tr>
                  <td className="p-6 bg-bushal-ivoryDeep/30 sticky left-0 z-10 border-r border-bushal-border"></td>
                  {items.map((item) => (
                    <td key={item.id} className="p-6 text-center">
                      <button
                        onClick={() => handleMoveToCart(item)}
                        disabled={!item.in_stock}
                        className={cn(
                          "inline-flex items-center justify-center w-full px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all",
                          item.in_stock
                            ? "bg-bushal-forest text-white hover:bg-bushal-forestMid active:scale-[0.97] shadow-md shadow-bushal-forest/20"
                            : "bg-bushal-ivoryDeep text-bushal-inkSoft cursor-not-allowed border border-bushal-border"
                        )}
                      >
                        {item.in_stock ? 'Add to Bag' : 'Unavailable'}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-bushal-inkSoft text-center mt-6">
          Tip: You can compare up to 4 products at a time. Click the ✕ icon to remove a product.
        </p>
      </PageWrapper>
      <Footer />
      <BottomNav />
    </div>
  )
}