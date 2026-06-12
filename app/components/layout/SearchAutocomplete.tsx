// app/components/layout/SearchAutocomplete.tsx

/**
 * ============================================================================
 * SEARCH AUTOCOMPLETE COMPONENT (Trie-Powered)
 * ============================================================================
 * 
 * A premium, highly-responsive search autocomplete component that leverages
 * the Trie (Prefix Tree) data structure implemented in the backend API.
 * 
 * FEATURES:
 * - Real-time suggestions via the /api/search/autocomplete endpoint
 * - Debounced input to prevent API spam (300ms delay)
 * - Keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Intelligent text highlighting for matched prefixes
 * - Displays product thumbnails, categories, and prices
 * - Follows the Bushal luxury design system with Framer Motion animations
 * 
 * USAGE:
 * <SearchAutocomplete className="w-full max-w-md" />
 * ============================================================================
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'

// ─── Types ─────────────────────────────────────────────────────────────────

interface AutocompleteSuggestion {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
  in_stock: boolean
}

interface Props {
  className?: string
  placeholder?: string
}

// ─── Helper: Highlight Matching Text ────────────────────────────────────────

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  
  // Escape special regex characters
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${safeQuery})`, 'gi')
  const parts = text.split(regex)
  
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-bushal-copper/20 text-bushal-forest rounded px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SearchAutocomplete({ 
  className, 
  placeholder = 'Search products...' 
}: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  // Fetch suggestions from Trie API
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(searchQuery)}&limit=6`)
      if (!response.ok) throw new Error('Failed to fetch')
      
      const data = await response.json()
      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions)
        setIsOpen(true)
        setSelectedIndex(-1)
      } else {
        setSuggestions([])
        setIsOpen(false)
      }
    } catch (error) {
      console.error('[SearchAutocomplete] Error:', error)
      setSuggestions([])
      setIsOpen(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced input handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 300)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => prev > -1 ? prev - 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        router.push(`/product/${suggestions[selectedIndex].id}`)
        setIsOpen(false)
        setQuery('')
      } else if (query.trim()) {
        router.push(`/dashboard?q=${encodeURIComponent(query)}`)
        setIsOpen(false)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Search Input */}
      <div className="relative">
        <svg 
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-bushal-inkSoft pointer-events-none" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true) }}
          placeholder={placeholder}
          className={cn(
            "w-full bg-bushal-surface border border-bushal-border rounded-xl pl-12 pr-4 py-3 text-sm text-bushal-ink placeholder-bushal-inkSoft/60",
            "focus:outline-none focus:border-bushal-copper focus:ring-2 focus:ring-bushal-copper/20 transition-all",
            "hover:border-bushal-borderMid"
          )}
          autoComplete="off"
          spellCheck={false}
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-bushal-copper border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-50 w-full mt-2 bg-bushal-surface rounded-2xl border border-bushal-border shadow-2xl shadow-bushal-ink/10 overflow-hidden"
          >
            <div className="max-h-[400px] overflow-y-auto no-scrollbar">
              {suggestions.map((suggestion, index) => {
                const isSelected = index === selectedIndex
                const cover = suggestion.image_url
                
                return (
                  <Link
                    key={suggestion.id}
                    href={`/product/${suggestion.id}`}
                    onClick={() => { setIsOpen(false); setQuery('') }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 transition-colors",
                      isSelected ? "bg-bushal-ivoryDeep" : "hover:bg-bushal-ivoryDeep/50"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-bushal-ivoryDeep border border-bushal-border flex-shrink-0">
                      {cover ? (
                        <img src={cover} alt={suggestion.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-bushal-ink truncate">
                        <HighlightMatch text={suggestion.name} query={query} />
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-bushal-copper">
                          {suggestion.category}
                        </span>
                        {!suggestion.in_stock && (
                          <span className="text-[9px] font-bold text-bushal-danger bg-bushal-dangerBg px-1.5 py-0.5 rounded-full">
                            Sold Out
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex-shrink-0">
                      <span className="text-sm font-bold text-bushal-forest tabular-nums">
                        {formatPrice(suggestion.price)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Footer: View All Results */}
            <Link
              href={`/dashboard?q=${encodeURIComponent(query)}`}
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold text-bushal-copper hover:bg-bushal-ivoryDeep transition-colors border-t border-bushal-border bg-bushal-ivoryDeep/20"
            >
              View all results for "{query}"
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State (No suggestions but query exists) */}
      <AnimatePresence>
        {isOpen && !isLoading && query.length >= 2 && suggestions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-bushal-surface rounded-2xl border border-bushal-border shadow-2xl p-8 text-center"
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bushal-ivoryDeep flex items-center justify-center">
              <svg className="w-6 h-6 text-bushal-inkSoft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-bushal-ink mb-1">No results for "{query}"</p>
            <p className="text-xs text-bushal-inkSoft">Try different keywords or browse all products</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}