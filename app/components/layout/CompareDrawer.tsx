// app/components/layout/CompareDrawer.tsx

'use client'

import { useCompare } from '@/app/hooks/useCompare'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { useCart } from '@/app/hooks/useCart'
import { cn } from '@/app/lib/utils/cn'
import { useState, useEffect } from 'react'
import { Product } from '@/app/types/product'
import { CompareItem } from '@/app/hooks/useCompare'

export default function CompareDrawer() {
  const { items, removeItem, clearCompare, getItemCount, toggleItem } = useCompare()
  const { addItem } = useCart()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (getItemCount() > 0) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [items.length, getItemCount])

  if (items.length === 0) return null

  const handleMoveToCart = (item: CompareItem) => {
    const productForCart: Product = {
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url ?? undefined,
      images: item.images ?? [],
      discount_percent: item.discount_percent ?? undefined,
      in_stock: item.in_stock,
      stock_quantity: item.stock_quantity,
      description: item.description ?? undefined,
      created_at: item.added_at,
      updated_at: undefined,
      category: item.category ?? undefined,
      comments: [],
    }
    addItem(productForCart)
    removeItem(item.id)
  }

  return (
    <>
      {/* Toggle Button (Floating) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-bushal-forest text-white px-5 py-3 rounded-full shadow-2xl hover:bg-bushal-forestMid transition-all active:scale-95"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="font-semibold text-sm">Compare ({getItemCount()})</span>
        </button>
      </motion.div>

      {/* Drawer Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-bushal-ink/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Drawer Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 bg-bushal-surface border-t border-bushal-border rounded-t-3xl shadow-2xl z-50 max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-bushal-border bg-bushal-ivory/50 rounded-t-3xl">
              <div>
                <h2 className="text-xl font-bold text-bushal-forest font-heading">
                  Product Comparison
                </h2>
                <p className="text-xs text-bushal-inkSoft mt-1">
                  Comparing {items.length} of 4 allowed items
                </p>
              </div>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    onClick={clearCompare}
                    className="text-xs font-semibold text-bushal-danger hover:bg-bushal-danger/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-bushal-ivoryDeep text-bushal-inkSoft hover:bg-bushal-border transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="overflow-x-auto p-6 flex-1">
              <div className="min-w-[600px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-32 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wider pr-4 pb-4 sticky left-0 bg-bushal-surface z-10"></th>
                      {items.map((item) => (
                        <th key={item.id} className="w-48 text-center pb-4 relative">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="absolute top-0 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-bushal-ivoryDeep text-bushal-inkSoft hover:text-bushal-danger hover:bg-bushal-dangerBg transition-colors"
                            title="Remove from comparison"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <Link href={`/product/${item.id}`} className="block group">
                            <div className="aspect-square bg-bushal-ivoryDeep rounded-xl overflow-hidden mb-3 border border-bushal-border">
                              {(item.images?.[0] ?? item.image_url) && (
                                <img
                                  src={(item.images?.[0] ?? item.image_url) ?? undefined}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              )}
                            </div>
                            <p className="text-sm font-semibold text-bushal-forest line-clamp-2 font-heading leading-tight group-hover:text-bushal-copper transition-colors">
                              {item.name}
                            </p>
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {/* Price Row */}
                    <tr className="border-t border-bushal-border">
                      <td className="py-4 pr-4 font-semibold text-bushal-ink sticky left-0 bg-bushal-surface">Price</td>
                      {items.map((item) => {
                        const dp = item.discount_percent ? item.price * (1 - item.discount_percent / 100) : null
                        const isLowest = items.length > 1 && (!dp || dp === Math.min(...items.map(i => (i.discount_percent ? i.price * (1 - i.discount_percent / 100) : i.price))))
                        return (
                          <td key={item.id} className="py-4 text-center relative">
                            <div className={cn("font-bold text-lg", isLowest ? "text-bushal-success" : "text-bushal-copper")}>
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

                    {/* Stock Row */}
                    <tr className="border-t border-bushal-border">
                      <td className="py-4 pr-4 font-semibold text-bushal-ink sticky left-0 bg-bushal-surface">Stock</td>
                      {items.map((item) => (
                        <td key={item.id} className="py-4 text-center">
                          <span className={cn(
                            "inline-flex px-2 py-1 rounded-full text-xs font-bold",
                            item.in_stock ? "bg-bushal-successBg text-bushal-success" : "bg-bushal-dangerBg text-bushal-danger"
                          )}>
                            {item.in_stock ? `${item.stock_quantity} Available` : 'Out of Stock'}
                          </span>
                        </td>
                      ))}
                    </tr>

                    {/* Description Row */}
                    <tr className="border-t border-bushal-border">
                      <td className="py-4 pr-4 font-semibold text-bushal-ink sticky left-0 bg-bushal-surface align-top">Description</td>
                      {items.map((item) => (
                        <td key={item.id} className="py-4 text-center align-top">
                          <p className="text-xs text-bushal-inkSoft line-clamp-4 leading-relaxed">
                            {item.description ?? 'No description available.'}
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* Action Row */}
                    <tr className="border-t border-bushal-border">
                      <td className="py-6 pr-4 sticky left-0 bg-bushal-surface"></td>
                      {items.map((item) => (
                        <td key={item.id} className="py-6 text-center">
                          <button
                            onClick={() => handleMoveToCart(item)}
                            disabled={!item.in_stock}
                            className={cn(
                              "inline-flex items-center justify-center w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all",
                              item.in_stock
                                ? "bg-bushal-forest text-white hover:bg-bushal-forestMid active:scale-[0.97]"
                                : "bg-bushal-ivoryDeep text-bushal-inkSoft cursor-not-allowed"
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

            {/* Footer with link to full compare page */}
            <div className="px-6 py-4 border-t border-bushal-border bg-bushal-ivoryDeep/30">
              <Link
                href="/compare"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-bushal-copper text-white text-sm font-semibold hover:bg-bushal-copperLight transition-colors"
              >
                View Full Comparison
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}