// app/components/layout/Navbar.tsx

'use client'

import { useAuth } from '@/app/hooks/useAuth'
import { useCart } from '@/app/hooks/useCart'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/app/lib/utils/cn'
import CartDrawer from '../cart/CardDrawer'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { createBrowserClient } from '@/lib/supabase/client'

interface SearchResult {
  id: string
  name: string
  price: number
  image_url: string | null
  images: string[]
  discount_percent: number | null
  in_stock: boolean
  matchType?: 'exact' | 'partial' | 'fuzzy'
  rank?: number
  similarity_score?: number
}

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  order_id?: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${safeQuery})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export default function Navbar() {
  const { items } = useCart()
  const { user, signOut } = useAuth()
  const supabase = createBrowserClient()

  const [cartOpen, setCartOpen] = useState(false)
  const [prevCount, setPrevCount] = useState(0)
  const [cartBump, setCartBump] = useState(false)
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)

  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 280)
  const searchRef       = useRef<HTMLDivElement>(null)
  const mobileSearchRef = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const mobileInputRef  = useRef<HTMLInputElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (cartCount > prevCount && prevCount !== 0) {
      setCartBump(true)
      setTimeout(() => setCartBump(false), 400)
    }
    setPrevCount(cartCount)
  }, [cartCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserRole(data?.role ?? null))
  }, [user])

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at, order_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data ?? [])
  }, [user])

  useEffect(() => {
    fetchNotifications()
    if (!user) return
    const channel = supabase
      .channel('notifications:' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, fetchNotifications])

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setShowResults(false)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    fetch(`/api/products/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: SearchResult[]) => {
        if (cancelled) return
        setResults(Array.isArray(data) ? data : [])
        setShowResults(true)
        setSearching(false)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setShowResults(false)
        setSearching(false)
      })
    return () => { cancelled = true }
  }, [debouncedQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setMobileSearchOpen(false); setQuery(''); setResults([]); setShowResults(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearSearch = useCallback((focusInput?: React.RefObject<HTMLInputElement>) => {
    setQuery(''); setResults([]); setShowResults(false); focusInput?.current?.focus()
  }, [])

  const handleResultClick = useCallback(() => {
    setShowResults(false); setMobileSearchOpen(false); setMobileMenuOpen(false)
    setQuery(''); setResults([])
  }, [])

  const SearchDropdown = ({ isMobile = false }: { isMobile?: boolean }) => {
    if (!showResults) return null
    return (
      <div className={cn(
        'absolute z-50 bg-white rounded-2xl border border-slate-200',
        'shadow-2xl shadow-slate-900/10 overflow-hidden',
        'top-full left-0 right-0 mt-2'
      )}>
        {results.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-900 mb-1">No results for "{query}"</p>
            <p className="text-xs text-slate-400">Try different keywords or browse all products</p>
            <Link href="/dashboard" onClick={handleResultClick} className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700">
              Browse all products
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <>
            <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.some((r) => r.matchType === 'fuzzy') && (
                <span className="text-[10px] text-slate-400 italic">Including similar items</span>
              )}
            </div>
            <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
              {results.map((product) => {
                const cover = (Array.isArray(product.images) && product.images[0]) || product.image_url
                const discountedPrice = product.discount_percent ? product.price * (1 - product.discount_percent / 100) : null
                return (
                  <Link key={product.id} href={`/product/${product.id}`} onClick={handleResultClick}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0">
                      {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 group-hover:text-orange-600 transition-colors line-clamp-1">
                          {highlightMatch(product.name, query)}
                        </p>
                        {!product.in_stock && <span className="text-[9px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-bold">OUT OF STOCK</span>}
                        {product.matchType === 'exact' && product.in_stock && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">BEST</span>}
                        {product.matchType === 'fuzzy' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">SIMILAR</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs font-bold text-slate-800">{formatPrice(discountedPrice ?? product.price)}</span>
                        {discountedPrice && <span className="text-[11px] text-slate-400 line-through">{formatPrice(product.price)}</span>}
                        {product.discount_percent && <span className="text-[10px] bg-rose-500 text-white px-1 py-0.5 rounded font-bold">-{product.discount_percent}%</span>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )
              })}
            </div>
            <Link href={`/dashboard?q=${encodeURIComponent(query)}`} onClick={handleResultClick}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors border-t border-slate-100">
              See all results for "{query}"
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </>
        )}
      </div>
    )
  }

  const NotificationPanel = () => (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/10 z-50 overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-900">Notifications</p>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-orange-600 font-semibold hover:text-orange-700 transition-colors">
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No notifications yet</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
          {notifications.map((n) => (
            <div key={n.id} className={cn('px-4 py-3 transition-colors', !n.read ? 'bg-orange-50/60' : 'hover:bg-slate-50')}>
              <div className="flex items-start gap-2.5">
                <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', !n.read ? 'bg-orange-500' : 'bg-transparent')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                  {n.order_id && (
                    <Link href="/orders" className="text-xs text-orange-600 font-semibold mt-1 inline-block hover:underline">
                      View order →
                    </Link>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleDateString('en-BD', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      <nav className={cn('sticky top-0 z-40 transition-all duration-300', scrolled ? 'bg-slate-900/95 backdrop-blur-md shadow-lg shadow-slate-900/20' : 'bg-slate-900')}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            <Link href="/dashboard" className="text-2xl font-extrabold text-orange-500 tracking-tight hover:text-orange-400 transition-colors flex-shrink-0" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Bushal
            </Link>

            <div className="flex-1 mx-6 hidden md:block" ref={searchRef}>
              <div className="relative max-w-lg">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  placeholder="Search products..."
                  className="w-full bg-slate-800 text-white placeholder-slate-400 pl-10 pr-10 py-2.5 rounded-xl border border-slate-700 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all duration-200"
                />
                {searching && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
                {query && !searching && (
                  <button onClick={() => clearSearch(inputRef)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" aria-label="Clear search">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <SearchDropdown />
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => { setMobileSearchOpen((prev) => !prev); setTimeout(() => mobileInputRef.current?.focus(), 50) }}
                className="md:hidden p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" aria-label="Search">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <button onClick={() => setCartOpen(true)} className="relative p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" aria-label="Open cart">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M7 13L5.4 5M10 21a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                {cartCount > 0 && (
                  <span className={cn('absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-orange-500 text-white', 'text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none', cartBump && 'animate-bounce-in')}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              {user && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) markAllRead() }}
                    className="relative p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                    aria-label="Notifications"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none animate-bounce-in">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && <NotificationPanel />}
                </div>
              )}

              <div className="hidden md:flex items-center gap-1">
                {user ? (
                  <>
                    <Link href="/orders" className="text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                      Orders
                    </Link>
                    <Link
                      href={userRole === 'admin' ? '/admin' : '/profile'}
                      className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      {userRole === 'admin' ? 'Analytics' : 'Profile'}
                    </Link>
                    <button onClick={signOut} className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                      Sign in
                    </Link>
                    <Link href="/register" className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-all duration-150 font-semibold hover:shadow-lg hover:shadow-orange-600/20 active:scale-[0.97]">
                      Register
                    </Link>
                  </>
                )}
              </div>

              <button onClick={() => setMobileMenuOpen((prev) => !prev)} className="md:hidden p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" aria-label="Toggle menu">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {mobileSearchOpen && (
          <div ref={mobileSearchRef} className="md:hidden border-t border-slate-800 py-3 relative animate-fade-in-up px-4">
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input ref={mobileInputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-slate-800 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
              {searching && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
            </div>
            <SearchDropdown isMobile />
          </div>
        )}

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 py-3 space-y-1 animate-fade-in-up px-4">
            {user ? (
              <>
                <Link href="/orders" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  My Orders
                </Link>
                <Link href={userRole === 'admin' ? '/admin' : '/profile'} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {userRole === 'admin' ? 'Analytics' : 'Profile'}
                </Link>
                <button onClick={signOut} className="flex items-center gap-2 w-full text-left text-sm text-slate-400 hover:text-white px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">Sign in</Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">Register</Link>
              </>
            )}
          </div>
        )}
      </nav>

      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}