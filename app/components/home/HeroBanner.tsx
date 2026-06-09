'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
// 🔒 FIX: Use createBrowserClient instead of createClient
import { createBrowserClient } from '@/lib/supabase/client'

interface TopProduct {
  id: string
  name: string
  image_url: string | null
  images: string[]
  total_sold: number
}

export default function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const [isHovering, setIsHovering] = useState(false)
  const [topProduct, setTopProduct] = useState<TopProduct | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTopProduct = async () => {
      // 🔒 FIX: Initialize the browser client correctly
      const supabase = createBrowserClient()
      
      try {
        // Try the RPC function first (if you created the migration)
        const { data, error } = await supabase.rpc('get_top_selling_product')
        
        if (error) {
          console.warn('RPC not found or failed, falling back to standard query:', error.message)
          
          // Fallback: Fetch order items and calculate the top seller in JS
          const { data: ordersData } = await supabase
            .from('order_items')
            .select(`
              product_id,
              quantity,
              products (
                id,
                name,
                image_url,
                images
              )
            `)
          
          if (ordersData) {
            const productSales: Record<string, { sold: number; product: any }> = {}
            ordersData.forEach((item: any) => {
              const productId = item.product_id
              if (!productSales[productId]) {
                productSales[productId] = { sold: 0, product: item.products }
              }
              productSales[productId].sold += item.quantity || 0
            })
            
            const sorted = Object.values(productSales).sort((a, b) => b.sold - a.sold)
            if (sorted.length > 0) {
              setTopProduct({
                id: sorted[0].product.id,
                name: sorted[0].product.name,
                image_url: sorted[0].product.image_url,
                images: sorted[0].product.images || [],
                total_sold: sorted[0].sold
              })
            }
          }
        } else if (data && data.length > 0) {
          setTopProduct(data[0])
        }
      } catch (err) {
        console.error('Failed to fetch top product:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTopProduct()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      setMousePos({ x, y })
      setIsHovering(true)
    }

    const handleMouseLeave = () => {
      setIsHovering(false)
    }

    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  // Parallax calculations
  const rotateX = (mousePos.y - 0.5) * -8
  const rotateY = (mousePos.x - 0.5) * 8
  
  const translateX = (mousePos.x - 0.5) * 20
  const translateY = (mousePos.y - 0.5) * 20

  // Get product image
  const productImage = topProduct 
    ? (topProduct.images?.[0] || topProduct.image_url)
    : null

  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden rounded-3xl bg-bushal-forest min-h-[500px] md:min-h-[600px] flex items-center mb-12 border border-bushal-forestMid/30 shadow-2xl shadow-bushal-forest/40 group"
      style={{ perspective: '1500px' }}
    >
      {/* Cursor Spotlight */}
      <div 
        className="absolute inset-0 transition-opacity duration-500 pointer-events-none z-0"
        style={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(800px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(184, 115, 51, 0.12), transparent 40%)`
        }}
      />

      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(240, 185, 106, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(240, 185, 106, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
        
        {/* Glows */}
        <div 
          className="absolute w-[600px] h-[600px] rounded-full bg-bushal-copper/10 blur-[120px] transition-transform duration-1000 ease-out"
          style={{ 
            top: '20%', right: '5%',
            transform: `translate(${translateX * -0.5}px, ${translateY * -0.5}px)`
          }}
        />
        <div 
          className="absolute w-[400px] h-[400px] rounded-full bg-bushal-forestLight/20 blur-[100px] transition-transform duration-1000 ease-out"
          style={{ 
            bottom: '10%', left: '10%',
            transform: `translate(${translateX * 0.5}px, ${translateY * 0.5}px)`
          }}
        />
      </div>

      {/* Left Content */}
      <div className="relative z-10 px-8 md:px-16 py-12 md:py-20 max-w-2xl flex flex-col justify-center h-full">
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-6 animate-fade-up">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-bushal-copper" />
          <p className="text-bushal-copperGlow text-[11px] font-semibold uppercase tracking-[0.3em] font-body">
            The Bushal Collection
          </p>
        </div>
        
        {/* Headline */}
        <h1 className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <span className="block text-bushal-ivory/70 text-lg md:text-2xl font-body font-light tracking-wide mb-3">
            Discover the
          </span>
          <span className="block text-6xl md:text-8xl font-heading font-semibold text-bushal-copperGlow leading-[0.95] tracking-tight">
            Extraordinary.
          </span>
        </h1>

        {/* Description */}
        <p className="text-bushal-ivory/60 text-base md:text-lg leading-relaxed mt-8 mb-10 max-w-lg font-body animate-fade-up" style={{ animationDelay: '200ms' }}>
          Handpicked, heritage-quality goods delivered across Bangladesh. 
          Experience transparent pricing and genuine care in every detail.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center gap-4 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <Link
            href="#products"
            className="group/btn relative inline-flex items-center gap-2 bg-bushal-copper text-bushal-ivory text-sm font-semibold font-body px-8 py-4 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-bushal-copper/40 hover:-translate-y-0.5 active:scale-95"
          >
            <span className="relative z-10">Explore Collection</span>
            <svg className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-r from-bushal-copperLight to-bushal-copper opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
          </Link>
          
          <Link
            href="/orders"
            className="group/trk inline-flex items-center gap-2 text-bushal-ivory/80 hover:text-bushal-ivory text-sm font-medium font-body px-6 py-4 rounded-xl border border-bushal-ivory/20 hover:border-bushal-ivory/40 hover:bg-bushal-ivory/5 backdrop-blur-sm transition-all duration-300"
          >
            <svg className="w-4 h-4 transition-transform duration-300 group-hover/trk:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Track Order
          </Link>
        </div>

        {/* Trust Indicators */}
        <div className="flex flex-wrap items-center gap-6 mt-12 animate-fade-up" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center gap-2 text-bushal-ivory/40 text-xs font-medium">
            <svg className="w-4 h-4 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Secure bKash
          </div>
          <div className="flex items-center gap-2 text-bushal-ivory/40 text-xs font-medium">
            <svg className="w-4 h-4 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Free Delivery ৳1000+
          </div>
          <div className="flex items-center gap-2 text-bushal-ivory/40 text-xs font-medium">
            <svg className="w-4 h-4 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
            4.9/5 Rating
          </div>
        </div>
      </div>

      {/* Right Visual Anchor (Advanced 3D Artifact) */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 hidden md:flex items-center justify-center pr-16 pointer-events-none">
        <div 
          className="relative w-[400px] h-[500px] transition-transform duration-500 ease-out"
          style={{ 
            transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Outer Rotating Ring */}
          <div 
            className="absolute inset-0 border border-bushal-copper/20 rounded-full"
            style={{ transform: 'translateZ(-20px)', animation: 'spin 40s linear infinite' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-bushal-copper rounded-full shadow-lg shadow-bushal-copper/50" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-bushal-copperGlow rounded-full" />
          </div>

          {/* Inner Rotating Ring (Reverse) */}
          <div 
            className="absolute inset-8 border border-dashed border-bushal-ivory/10 rounded-full"
            style={{ transform: 'translateZ(10px)', animation: 'spin 30s linear infinite reverse' }}
          />

          {/* Central Glass Emblem - Shows Top Product */}
          <div 
            className="absolute inset-12 bg-bushal-ivory/5 backdrop-blur-xl rounded-full border border-bushal-ivory/20 shadow-2xl flex items-center justify-center overflow-hidden"
            style={{ transform: 'translateZ(40px)' }}
          >
            {/* Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-bushal-copper/20 via-transparent to-bushal-forestLight/20" />
            
            {/* Central Content */}
            <div className="relative z-10 flex flex-col items-center gap-2 p-4">
              {loading ? (
                <div className="w-20 h-20 rounded-full bg-bushal-forest/50 border-2 border-bushal-copper/30 flex items-center justify-center animate-pulse">
                  <svg className="w-8 h-8 text-bushal-copper/50 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              ) : productImage ? (
                <div className="relative">
                  <div className="w-25 h-30 rounded-full overflow-hidden border-4 border-bushal-copper/50 shadow-lg">
                    <img 
                      src={productImage} 
                      alt="Top Product" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute bottom-5 right-5 w-7 h-7 bg-bushal-copper rounded-full flex items-center justify-center border-2 border-bushal-forest shadow-md">
                    <svg className="w-3.5 h-3.5 text-bushal-ivory" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-bushal-forest border-2 border-bushal-copper/50 flex items-center justify-center shadow-inner">
                  <span className="text-4xl font-heading font-bold text-bushal-copperGlow">B</span>
                </div>
              )}
              
              <div className="text-center mt-2">
                <p className="text-[9px] font-body font-bold uppercase tracking-[0.15em] text-bushal-copperGlow">
                  {loading ? 'Loading...' : topProduct ? 'Best Seller' : 'Est. 2026'}
                </p>
                {!loading && topProduct && (
                  <p className="text-[8px] text-bushal-ivory/60 mt-0.5">
                    {topProduct.total_sold} sold
                  </p>
                )}
              </div>
            </div>

            {/* Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
          </div>

          {/* Floating Glass Card 1 (Top Left) */}
          <div 
            className="absolute -top-4 -left-4 w-32 p-3 bg-bushal-ivory/10 backdrop-blur-md rounded-xl border border-bushal-ivory/20 shadow-xl transition-transform duration-700 ease-out"
            style={{ 
              transform: `translateZ(80px) translate(${translateX * -1.5}px, ${translateY * -1.5}px)`
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-bushal-copper/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-bushal-copperGlow" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              </div>
              <span className="text-[10px] font-bold text-bushal-ivory/90 uppercase tracking-wider">Premium</span>
            </div>
            <p className="text-xs text-bushal-ivory/60 leading-tight">Handpicked heritage goods</p>
          </div>

          {/* Floating Glass Card 2 (Bottom Right) */}
          <div 
            className="absolute -bottom-4 -right-4 w-36 p-3 bg-bushal-forest/80 backdrop-blur-md rounded-xl border border-bushal-copper/30 shadow-xl transition-transform duration-700 ease-out"
            style={{ 
              transform: `translateZ(60px) translate(${translateX * 1.5}px, ${translateY * 1.5}px)`
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-bushal-copperGlow uppercase tracking-wider">Live Status</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-heading font-bold text-bushal-ivory">12</span>
              <span className="text-[10px] text-bushal-ivory/50">orders today</span>
            </div>
          </div>
          
          {/* Floating Glass Card 3 (Top Right) */}
          <div 
            className="absolute top-10 -right-8 w-24 p-2 bg-bushal-copper/10 backdrop-blur-md rounded-lg border border-bushal-copper/20 shadow-lg transition-transform duration-700 ease-out"
            style={{ 
              transform: `translateZ(100px) translate(${translateX * 2}px, ${translateY * 2}px)`
            }}
          >
            <p className="text-[9px] font-bold text-bushal-copperGlow uppercase tracking-widest text-center">Secure</p>
            <p className="text-[10px] text-bushal-ivory/80 text-center mt-0.5">bKash Pay</p>
          </div>
        </div>
      </div>
    </div>
  )
}