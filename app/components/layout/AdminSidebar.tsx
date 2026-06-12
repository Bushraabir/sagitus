// app/components/layoutAdminSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/app/lib/utils/cn'
import { useAuth } from '@/app/hooks/useAuth'
import { createBrowserClient } from '@/lib/supabase/client'

// ─── Types ──────────────────────────────────────────────────────────────────

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string | number
  badgeColor?: 'copper' | 'success' | 'warning' | 'danger' | 'info'
  children?: NavItem[]
  shortcut?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

// ─── Navigation Structure ───────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Main',
    items: [
      {
        href: '/admin',
        label: 'Overview',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z" />
          </svg>
        ),
        shortcut: '⌘1',
      },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),

      } as NavItem,
    ],
  },
  {
    title: 'Commerce',
    items: [
      {
        href: '/admin/products',
        label: 'Products',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
        shortcut: '⌘P',
      },
      {
        href: '/admin/categories',
        label: 'Categories',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        ),
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
        shortcut: '⌘O',
      },
      {
        href: '/admin/comments',
        label: 'Reviews',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      {
        href: '/admin/analytics/demand-forecasting',
        label: 'Demand Forecast',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        ),
        badge: 'HW',
        badgeColor: 'info',
      },
      {
        href: '/admin/inventory/smart-restocking',
        label: 'Smart Restock',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ),
        badge: 'AI',
        badgeColor: 'copper',
      },
      {
        href: '/admin/analytics/customer-segmentation',
        label: 'Segmentation',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        badge: 'K-Means',
        badgeColor: 'warning',
      },
      {
        href: '/admin/products/graph-recommendations',
        label: 'Product Graph',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
        badge: 'PR',
        badgeColor: 'info',
      },
    ],
  },
]

// ─── Badge Component ────────────────────────────────────────────────────────

function NavBadge({ text, color = 'copper' }: { text: string | number; color?: string }) {
  const colorMap: Record<string, string> = {
    copper: 'bg-bushal-copper/20 text-bushal-copperGlow border-bushal-copper/30',
    success: 'bg-bushal-success/20 text-emerald-300 border-emerald-400/30',
    warning: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    danger: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
    info: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
  }

  return (
    <span className={cn(
      'text-[9px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase',
      colorMap[color] || colorMap.copper
    )}>
      {text}
    </span>
  )
}

// ─── Nav Item Component ─────────────────────────────────────────────────────

function NavItemButton({
  item,
  isActive,
  isExpanded,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  isExpanded: boolean
  onClick?: () => void
}) {
  const [subOpen, setSubOpen] = useState(false)
  const hasChildren = item.children && item.children.length > 0

  return (
    <div>
      <Link
        href={item.href}
        onClick={(e) => {
          if (hasChildren) {
            e.preventDefault()
            setSubOpen(!subOpen)
          }
          onClick?.()
        }}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'hover:bg-white/[0.06] active:scale-[0.98]',
          isActive && !hasChildren
            ? 'bg-gradient-to-r from-bushal-copper/20 to-bushal-copper/5 text-white'
            : 'text-white/60 hover:text-white/90'
        )}
      >
        {/* Active indicator bar */}
        {isActive && !hasChildren && (
          <motion.div
            layoutId="activeIndicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-bushal-copper rounded-r-full"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}

        {/* Icon */}
        <div className={cn(
          'flex-shrink-0 transition-colors duration-200',
          isActive ? 'text-bushal-copperGlow' : 'text-white/40 group-hover:text-white/70'
        )}>
          {item.icon}
        </div>

        {/* Label */}
        <AnimatePresence>
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden flex-1"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Badge */}
        {item.badge && isExpanded && (
          <NavBadge text={item.badge} color={item.badgeColor} />
        )}

        {/* Shortcut hint */}
        {item.shortcut && isExpanded && (
          <span className="text-[10px] text-white/20 font-mono hidden group-hover:block">
            {item.shortcut}
          </span>
        )}

        {/* Submenu chevron */}
        {hasChildren && isExpanded && (
          <motion.svg
            animate={{ rotate: subOpen ? 90 : 0 }}
            className="w-3.5 h-3.5 text-white/30 ml-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </motion.svg>
        )}
      </Link>

      {/* Submenu */}
      <AnimatePresence>
        {hasChildren && subOpen && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden ml-5 mt-1 border-l border-white/10 pl-3 space-y-0.5"
          >
            {item.children!.map((child) => {
              const isChildActive = usePathname() === child.href
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onClick}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                    isChildActive
                      ? 'text-bushal-copperGlow bg-bushal-copper/10'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  )}
                >
                  <span className={cn(
                    'w-1 h-1 rounded-full',
                    isChildActive ? 'bg-bushal-copperGlow' : 'bg-white/20'
                  )} />
                  {child.label}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Search Component ───────────────────────────────────────────────────────

function SidebarSearch({ isExpanded }: { isExpanded: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NavItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const allItems = NAV_SECTIONS.flatMap(s => s.items)
    const filtered = allItems.filter(item =>
      item.label.toLowerCase().includes(query.toLowerCase())
    )
    setResults(filtered)
  }, [query])

  if (!isExpanded) return null

  return (
    <div className="px-3 mb-2">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Quick search..."
          className="w-full bg-white/[0.06] text-white/80 placeholder-white/30 pl-9 pr-3 py-2 rounded-lg text-xs border border-white/[0.06] focus:outline-none focus:border-bushal-copper/40 focus:bg-white/[0.08] transition-all"
        />
        {query && (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white/20 bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Search Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute left-3 right-3 mt-1 bg-bushal-forestMid border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            {results.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setQuery(''); setResults([]) }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <div className="text-white/40">{item.icon}</div>
                <span>{item.label}</span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── User Profile Card ──────────────────────────────────────────────────────

function UserProfileCard({ isExpanded, onSignOut }: { isExpanded: boolean; onSignOut: () => void }) {
  const { user } = useAuth()
  const supabase = createBrowserClient()
  const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data)
      })
  }, [user, supabase])

  const initials = (profile?.full_name || user?.email || 'A')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className={cn(
      'mx-3 mb-3 rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-3 transition-all',
      !isExpanded && 'p-2'
    )}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-bushal-copper to-bushal-copperLight flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-bushal-copper/20">
            {initials}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-bushal-forest" />
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-semibold text-white/90 truncate">
                {profile?.full_name || 'Admin'}
              </p>
              <p className="text-[10px] text-white/40 truncate">
                {profile?.email || user?.email}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {isExpanded && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onSignOut}
            className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </motion.button>
        )}
      </div>
    </div>
  )
}

// ─── Main Sidebar Component ─────────────────────────────────────────────────

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [isExpanded, setIsExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bushal-sidebar-collapsed')
    if (saved === 'true') setIsExpanded(false)
    setMounted(true)
  }, [])

  // Save collapsed state
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev
      localStorage.setItem('bushal-sidebar-collapsed', String(next))
      return next
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleExpanded()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Focus search if expanded
        const input = document.querySelector<HTMLInputElement>('input[placeholder="Quick search..."]')
        input?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleExpanded])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const sidebarWidth = isExpanded ? 'w-72' : 'w-[72px]'

  return (
    <>
      {/* ─── Mobile Header ─────────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-bushal-forest border-b border-white/[0.06] backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bushal-copper to-bushal-copperLight flex items-center justify-center shadow-lg shadow-bushal-copper/20">
            <span className="text-white font-bold text-sm" style={{ fontFamily: "'Cormorant Garamond', serif" }}>B</span>
          </div>
          <div>
            <p className="text-sm font-bold text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Bushal</p>
            <p className="text-[9px] text-bushal-copperGlow font-semibold uppercase tracking-wider">Admin</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* ─── Mobile Drawer ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-[60] w-72 bg-bushal-forest flex flex-col"
            >
              {/* Mobile Header */}
              <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bushal-copper to-bushal-copperLight flex items-center justify-center shadow-lg shadow-bushal-copper/20">
                    <span className="text-white font-bold text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>B</span>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Bushal</p>
                    <p className="text-[10px] text-bushal-copperGlow font-semibold uppercase tracking-wider">Admin Panel</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mobile Search */}
              <div className="px-4 pt-4">
                <SidebarSearch isExpanded={true} />
              </div>

              {/* Mobile Nav */}
              <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto no-scrollbar">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <NavItemButton
                          key={item.href}
                          item={item}
                          isActive={isActive(item.href)}
                          isExpanded={true}
                          onClick={() => setMobileOpen(false)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Mobile User Card */}
              <div className="mt-auto pt-4 border-t border-white/[0.06]">
                <UserProfileCard isExpanded={true} onSignOut={handleSignOut} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── Desktop Sidebar ───────────────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen sticky top-0 bg-bushal-forest border-r border-white/[0.06] transition-all duration-300 ease-out',
          sidebarWidth,
          !mounted && 'opacity-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bushal-copper to-bushal-copperLight flex items-center justify-center shadow-lg shadow-bushal-copper/20 group-hover:shadow-bushal-copper/40 transition-all duration-300">
                <span className="text-white font-bold text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>B</span>
              </div>
              <div className="absolute -inset-0.5 bg-bushal-copper/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
            </div>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-base font-bold text-white leading-none" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    Bushal
                  </p>
                  <p className="text-[9px] text-bushal-copperGlow font-semibold uppercase tracking-wider mt-0.5">
                    Admin Panel
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>

          {/* Collapse Toggle */}
          <button
            onClick={toggleExpanded}
            className={cn(
              'p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all',
              !isExpanded && 'mx-auto'
            )}
            title={isExpanded ? 'Collapse sidebar (⌘B)' : 'Expand sidebar (⌘B)'}
          >
            <motion.svg
              animate={{ rotate: isExpanded ? 0 : 180 }}
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </motion.svg>
          </button>
        </div>

        {/* Search */}
        <SidebarSearch isExpanded={isExpanded} />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto no-scrollbar">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <AnimatePresence>
                {isExpanded && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25"
                  >
                    {section.title}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItemButton
                    key={item.href}
                    item={item}
                    isActive={isActive(item.href)}
                    isExpanded={isExpanded}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Keyboard shortcut hint */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-2"
            >
              <div className="flex items-center gap-2 text-[10px] text-white/20">
                <kbd className="px-1.5 py-0.5 bg-white/[0.04] rounded font-mono">⌘B</kbd>
                <span>Toggle sidebar</span>
                <span className="mx-1">·</span>
                <kbd className="px-1.5 py-0.5 bg-white/[0.04] rounded font-mono">⌘K</kbd>
                <span>Search</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Profile */}
        <div className="mt-auto pt-3 border-t border-white/[0.06]">
          <UserProfileCard isExpanded={isExpanded} onSignOut={handleSignOut} />
        </div>
      </aside>
    </>
  )
}