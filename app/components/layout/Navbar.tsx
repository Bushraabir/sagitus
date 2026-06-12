// app/components/layout/Navbar.tsx
'use client'

import { useAuth } from '@/app/hooks/useAuth'
import { useCart } from '@/app/hooks/useCart'
import { useWishlist } from '@/app/hooks/useWishList'
import { useCompare } from '@/app/hooks/useCompare'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/app/lib/utils/cn'
import CartDrawer from '@/app/components/cart/CardDrawer'
import { createBrowserClient } from '@/lib/supabase/client'
import SearchDropdown, { SearchResult } from '@/app/components/layout/SearchDropdown'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  order_id?: string | null
  comment_id?: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function Navbar() {
  const { items } = useCart()
  const { user, signOut } = useAuth()
  const { getItemCount: getWishlistCount } = useWishlist()
  const { getItemCount: getCompareCount } = useCompare()
  const supabase = createBrowserClient()

  const [cartOpen, setCartOpen] = useState(false)
  const [prevCount, setPrevCount] = useState(0)
  const [cartBump, setCartBump] = useState(false)
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const wishlistCount = getWishlistCount()
  const compareCount = getCompareCount()

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
  const [notifLoading, setNotifLoading] = useState(true)
  const [searchFocused, setSearchFocused] = useState(false)

  const notifRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 280)
  const searchRef = useRef<HTMLDivElement>(null)
  const mobileSearchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length
  const isAdmin = userRole === 'admin'

  // Scroll listener
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Cart bump animation
  useEffect(() => {
    if (cartCount > prevCount && prevCount !== 0) {
      setCartBump(true)
      setTimeout(() => setCartBump(false), 400)
    }
    setPrevCount(cartCount)
  }, [cartCount, prevCount])

  // Fetch user role
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserRole(data?.role ?? null))
  }, [user, supabase])

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifLoading(false)
      return
    }
    try {
      setNotifLoading(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const admin = profile?.role === 'admin'
      let q = supabase
        .from('notifications')
        .select('id, type, title, body, read, created_at, order_id, comment_id')
        .order('created_at', { ascending: false })
        .limit(20)

      if (admin) {
        q = q.is('user_id', null)
      } else {
        q = q.eq('user_id', user.id)
      }

      const { data, error } = await q
      if (error) {
        console.error('Error fetching notifications:', error)
        setNotifications([])
      } else {
        setNotifications(data ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
      setNotifications([])
    } finally {
      setNotifLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Real-time notification subscriptions
  useEffect(() => {
    if (!user || isAdmin) return
    const channel = supabase
      .channel('customer-notifications:' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const incoming = payload.new as Notification
          setNotifications((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, isAdmin, supabase])

  useEffect(() => {
    if (!user || !isAdmin) return
    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const incoming = payload.new as Notification & { user_id: string | null }
          if (incoming.user_id !== null) return
          setNotifications((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, isAdmin, supabase])

  const markAllRead = useCallback(async () => {
    if (!user || unreadCount === 0) return
    try {
      let q = supabase.from('notifications').update({ read: true }).eq('read', false)
      if (isAdmin) {
        q = q.is('user_id', null)
      } else {
        q = q.eq('user_id', user.id)
      }
      const { error } = await q
      if (error) { console.error('Error marking notifications as read:', error); return }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      console.error('Failed to mark notifications as read:', err)
    }
  }, [user, isAdmin, unreadCount, supabase])

  const handleNotifToggle = useCallback(() => {
    const wasOpen = notifOpen
    setNotifOpen((v) => !v)
    if (wasOpen && unreadCount > 0) {
      markAllRead()
    }
  }, [notifOpen, unreadCount, markAllRead])

  // Search logic
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setShowResults(false)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    fetch(`/api/search/autocomplete?q=${encodeURIComponent(debouncedQuery)}&limit=6`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: any) => {
        if (cancelled) return
        if (data.success && Array.isArray(data.suggestions)) {
          setResults(data.suggestions.map((s: any) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            image_url: s.image_url,
            images: [],
            discount_percent: null,
            in_stock: s.in_stock,
          })))
        } else {
          setResults([])
        }
        setShowResults(true)
        setSearching(false)
      })
      .catch(() => {
        if (!cancelled) { setResults([]); setShowResults(false); setSearching(false) }
      })
    return () => { cancelled = true }
  }, [debouncedQuery])

  // Click outside handlers
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
        setSearchFocused(false)
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setMobileSearchOpen(false)
        setQuery('')
        setResults([])
        setShowResults(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        if (notifOpen && unreadCount > 0) markAllRead()
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen, unreadCount, markAllRead])

  const handleResultClick = useCallback(() => {
    setShowResults(false)
    setMobileSearchOpen(false)
    setMobileMenuOpen(false)
    setQuery('')
    setResults([])
  }, [])

  const NotificationPanel = () => (
    <div className={cn(
      "absolute right-0 top-full mt-2 bg-bushal-surface rounded-2xl border border-bushal-border shadow-2xl z-50 overflow-hidden animate-scale-in",
      "w-[calc(100vw-5rem)] max-w-[calc(100vw-2rem)] sm:w-96",
      "max-h-[calc(100vh-300px)]",
      "flex flex-col"
    )}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-bushal-border flex-shrink-0">
        <p className="text-sm font-semibold text-bushal-ink">
          {isAdmin ? 'Admin Notifications' : 'Notifications'}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-bushal-copper font-semibold hover:text-bushal-copperLight transition-colors px-2 py-1 rounded-lg hover:bg-bushal-ivoryDeep"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 no-scrollbar">
        {notifLoading ? (
          <div className="px-4 py-10 text-center">
            <div className="w-7 h-7 border-2 border-bushal-copper border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-bushal-inkSoft">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="w-12 h-12 bg-bushal-ivoryDeep rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-bushal-inkSoft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-xs text-bushal-inkSoft">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-bushal-ivory">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'px-4 py-3 transition-colors',
                  !n.read ? 'bg-bushal-ivoryDeep/60' : 'hover:bg-bushal-ivoryDeep/40'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', !n.read ? 'bg-bushal-copper' : 'bg-transparent')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-bushal-ink leading-snug">{n.title}</p>
                    <p className="text-xs text-bushal-inkSoft mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                    {n.order_id && (
                      <Link
                        href={isAdmin ? '/admin/orders' : '/orders'}
                        className="text-xs text-bushal-copper font-semibold mt-1.5 inline-block hover:underline"
                      >
                        <span>View order →</span>
                      </Link>
                    )}
                    {n.comment_id && isAdmin && (
                      <Link
                        href="/admin/comments"
                        className="text-xs text-bushal-copper font-semibold mt-1.5 inline-block hover:underline"
                      >
                        <span>View comment →</span>
                      </Link>
                    )}
                    <p className="text-[10px] text-bushal-inkSoft/70 mt-1.5">
                      {new Date(n.created_at).toLocaleDateString('en-BD', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <nav className={cn(
          'pointer-events-auto transition-all duration-500 ease-out',
          scrolled
            ? 'bg-bushal-forest/95 backdrop-blur-xl shadow-2xl shadow-bushal-forest/30'
            : 'bg-bushal-forest'
        )}>
          <div className="h-[2px]" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 lg:h-20">
              {/* Logo */}
              <Link href="/dashboard" className="flex items-center gap-3 flex-shrink-0 group">
                <div className="relative">
                  <img
                    src="/logo.png"
                    alt="Bushal"
                    className="w-10 h-10 rounded-xl object-cover transition-all duration-300 group-hover:scale-110"
                  />
                  <div className="absolute -inset-1 bg-bushal-copper/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <div className="flex flex-col">
                  <span
                    className="text-2xl font-heading font-bold tracking-wide text-white group-hover:text-bushal-copperLight transition-colors duration-300"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                  >
                    Bushal
                  </span>
                  <span className="text-[10px] uppercase tracking-widest -mt-1 text-white/60 transition-colors duration-300">Quality Delivered</span>
                </div>
              </Link>

              {/* Desktop Search */}
              <div className="flex-1 mx-8 hidden lg:block" ref={searchRef}>
                <div className="relative max-w-md mx-auto">
                  <div className={cn(
                    'absolute inset-0 rounded-xl blur-sm transition-opacity duration-300',
                    searchFocused ? 'bg-bushal-copper/10 opacity-100' : 'bg-white/5 opacity-0'
                  )} />
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => { setSearchFocused(true); if (results.length > 0) setShowResults(true) }}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Search products..."
                    className={cn(
                      'relative w-full bg-white/10 text-white placeholder-white/50 pl-12 pr-12 py-3 rounded-xl border border-white/10 text-sm transition-all duration-300',
                      'focus:outline-none focus:border-bushal-copper/60 focus:bg-white/15 focus:ring-2 focus:ring-bushal-copper/20',
                      searchFocused ? 'max-w-sm' : 'max-w-xs'
                    )}
                  />
                  {searching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-bushal-copper/60 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {query && !searching && (
                    <button
                      onClick={() => { setQuery(''); setResults([]); setShowResults(false); inputRef.current?.focus() }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                      aria-label="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <SearchDropdown
                    results={results}
                    query={query}
                    showResults={showResults}
                    searching={searching}
                    onResultClick={handleResultClick}
                  />
                </div>
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2">
                {/* MOBILE: Minimal top bar */}
                <div className="flex items-center gap-1 md:hidden">
                  <button
                    onClick={() => { setMobileSearchOpen((v) => !v); setTimeout(() => mobileInputRef.current?.focus(), 50) }}
                    className="p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                    aria-label="Search"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  {user && (
                    <div className="relative" ref={notifRef}>
                      <button
                        onClick={handleNotifToggle}
                        className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                        aria-label="Notifications"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadCount > 0 && (
                          <span suppressHydrationWarning className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-bushal-danger to-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none shadow-lg shadow-rose-500/40 animate-bounce-pop">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>
                      {notifOpen && <NotificationPanel />}
                    </div>
                  )}
                  <button
                    onClick={() => setMobileMenuOpen((v) => !v)}
                    className="p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                    aria-label="Menu"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {mobileMenuOpen
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                    </svg>
                  </button>
                </div>

                {/* DESKTOP: Full navigation */}
                <div className="hidden md:flex items-center gap-1">
                  {/* Wishlist Button */}
                  {!isAdmin && (
                    <Link
                      href="/wishlist"
                      className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                      aria-label="Wishlist"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {wishlistCount > 0 && (
                        <span suppressHydrationWarning className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-bushal-copper to-bushal-copperLight text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none shadow-lg shadow-bushal-copper/40 animate-bounce-pop">
                          {wishlistCount > 9 ? '9+' : wishlistCount}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Compare Button */}
                  {!isAdmin && compareCount > 0 && (
                    <Link
                      href="/compare"
                      className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                      aria-label="Compare"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      <span suppressHydrationWarning className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-bushal-forest to-bushal-forestMid text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none shadow-lg shadow-bushal-forest/40">
                        {compareCount}
                      </span>
                    </Link>
                  )}

                  {/* Cart Button */}
                  {!isAdmin && (
                    <button
                      onClick={() => setCartOpen(true)}
                      className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                      aria-label="Cart"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M7 13L5.4 5M10 21a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z" />
                      </svg>
                      {cartCount > 0 && (
                        <span suppressHydrationWarning className={cn(
                          'absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-bushal-copper to-bushal-copperLight text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none shadow-lg shadow-bushal-copper/40',
                          cartBump && 'animate-bounce-pop'
                        )}>
                          {cartCount > 99 ? '99+' : cartCount}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Notifications */}
                  {user && (
                    <div className="relative" ref={notifRef}>
                      <button
                        onClick={handleNotifToggle}
                        className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 text-white/70 hover:text-white hover:bg-white/10"
                        aria-label="Notifications"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadCount > 0 && (
                          <span suppressHydrationWarning className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-bushal-danger to-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none shadow-lg shadow-rose-500/40 animate-bounce-pop">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>
                      {notifOpen && <NotificationPanel />}
                    </div>
                  )}

                  {/* Auth / Profile */}
                  <div className="flex items-center gap-2 ml-2">
                    {user ? (
                      <>
                        <Link href="/orders" className="text-sm text-white/70 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-200">
                          <span>Orders</span>
                        </Link>
                        <Link
                          href={isAdmin ? '/admin' : '/profile'}
                          className="flex items-center gap-2 text-sm text-white/70 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
                        >
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-bushal-copper/30 to-bushal-copperLight/30 border border-bushal-copper/50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-bushal-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <span className="font-medium">{isAdmin ? 'Analytics' : 'Profile'}</span>
                        </Link>
                        <button
                          onClick={signOut}
                          className="text-sm text-white/50 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
                        >
                          <span>Sign out</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <Link href="/login" className="text-sm text-bushal-copper hover:text-bushal-copperLight px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200 font-medium">
                          <span>Sign in</span>
                        </Link>
                        <Link
                          href="/register"
                          className="text-sm bg-gradient-to-r from-bushal-copper to-bushal-copperLight text-white px-5 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-bushal-copper/30 hover:-translate-y-0.5 transition-all duration-300 active:scale-95"
                        >
                          <span>Register</span>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* Mobile Search Dropdown */}
      {mobileSearchOpen && (
        <div ref={mobileSearchRef} className="lg:hidden fixed top-16 left-0 right-0 z-40 border-t border-white/10 py-4 px-4 animate-fade-up bg-bushal-forest backdrop-blur-xl">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={mobileInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-white/10 text-white placeholder-white/50 pl-12 pr-4 py-3 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-bushal-copper/60 focus:ring-2 focus:ring-bushal-copper/20"
            />
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-bushal-copper/60 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <SearchDropdown
            results={results}
            query={query}
            showResults={showResults}
            searching={searching}
            onResultClick={handleResultClick}
          />
        </div>
      )}

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed top-16 left-0 right-0 z-40 border-t border-white/10 py-4 space-y-1 animate-fade-up px-4 bg-bushal-forest backdrop-blur-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          {user ? (
            <>
              {/* Wishlist */}
              <Link href="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <span className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>My Wishlist</span>
                </span>
                {wishlistCount > 0 && (
                  <span suppressHydrationWarning className="bg-bushal-copper text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              {/* Compare */}
              {compareCount > 0 && (
                <Link href="/compare" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                    <span>Compare Products</span>
                  </span>
                  <span suppressHydrationWarning className="bg-bushal-forest text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {compareCount}
                  </span>
                </Link>
              )}

              {/* Orders */}
              <Link href="/orders" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>My Orders</span>
              </Link>

              {/* Profile / Admin */}
              <Link href={isAdmin ? '/admin' : '/profile'} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{isAdmin ? 'Admin Panel' : 'My Profile'}</span>
              </Link>

              {/* Sign out */}
              <button onClick={() => { signOut(); setMobileMenuOpen(false) }} className="flex items-center gap-3 w-full text-left text-sm text-white/50 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <>
              {/* Wishlist for guests */}
              <Link href="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>Wishlist</span>
              </Link>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-white/70 hover:text-white px-3 py-3 rounded-xl hover:bg-white/10 transition-all">
                <span>Sign in</span>
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="block text-sm bg-gradient-to-r from-bushal-copper to-bushal-copperLight text-white text-center px-3 py-3 rounded-xl font-semibold mt-2">
                <span>Register</span>
              </Link>
            </>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="h-16 lg:h-20" />
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}