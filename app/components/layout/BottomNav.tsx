// app/components/layout/BottomNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from '@/app/hooks/useCart'
import { useWishlist } from '@/app/hooks/useWishList'
import { cn } from '@/app/lib/utils/cn'

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (active: boolean) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/wishlist',
    label: 'Wishlist',
    showBadge: true,
    icon: (active: boolean) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    href: '/cart',
    label: 'Cart',
    showBadge: true,
    icon: (active: boolean) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M7 13L5.4 5M10 21a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { items } = useCart()
  const { getItemCount: getWishlistCount } = useWishlist()
  
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)
  const wishlistCount = getWishlistCount()

  // Hide on admin pages
  if (pathname.startsWith('/admin')) return null

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bushal-surface border-t border-bushal-border safe-bottom shadow-[0_-4px_20px_rgba(27,58,45,0.08)]">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          let badgeCount = 0
          if (item.href === '/cart') badgeCount = cartCount
          if (item.href === '/wishlist') badgeCount = wishlistCount

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 min-w-[64px] py-1.5 px-2 rounded-xl transition-all duration-200 relative',
                active ? 'text-bushal-forest' : 'text-bushal-inkSoft hover:text-bushal-ink'
              )}
            >
              <span className="relative">
                {item.icon(active)}
                {item.showBadge && badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 bg-gradient-to-r from-bushal-copper to-bushal-copperLight text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-md shadow-bushal-copper/30 animate-bounce-pop">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              <span className={cn('text-[10px] font-semibold tracking-wide', active ? 'text-bushal-forest' : 'text-bushal-inkSoft')}>
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-bushal-copper" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}