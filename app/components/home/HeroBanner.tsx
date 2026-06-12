// app/components/home/HeroBanner.tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cn } from '@/app/lib/utils/cn'

interface Product {
  id: string
  name: string
  image_url: string | null
  images: string[]
}

interface TopProduct extends Product {
  total_sold: number
}

const HEADLINES = [
  { eyebrow: 'Curated for', word: 'Bangladesh.' },
  { eyebrow: 'Heritage in', word: 'Every Detail.' },
  { eyebrow: 'Shop with', word: 'Transparency.' },
]

// Deterministic particles - no SSR/hydration mismatch
const PARTICLES = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  cx: (i * 137.508) % 100,
  cy: (i * 97.3) % 100,
  r: 0.25 + (i % 3) * 0.3,
  delay: (i * 0.45) % 8,
  dur: 4 + (i % 5),
  op: 0.08 + (i % 5) * 0.05,
}))

export default function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const primaryBtnRef = useRef<HTMLAnchorElement>(null)
  const secondaryBtnRef = useRef<HTMLAnchorElement>(null)
  const rafRef = useRef<number | null>(null)
  const trailRafRef = useRef<number | null>(null)
  const targetPos = useRef({ x: 0.5, y: 0.5 })
  const smoothPos = useRef({ x: 0.5, y: 0.5 })
  const trailPts = useRef<{ x: number; y: number; op: number }[]>([])
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const [isHovering, setIsHovering] = useState(false)
  const [topProduct, setTopProduct] = useState<TopProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [hlIndex, setHlIndex] = useState(0)
  const [prevHlIndex, setPrevHlIndex] = useState<number | null>(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [soldCount, setSoldCount] = useState(0)
  const [primaryDown, setPrimaryDown] = useState(false)
  const [secondaryDown, setSecondaryDown] = useState(false)
  const [orbOffset, setOrbOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setMounted(true)
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // ── smooth cursor loop
  const animateCursor = useCallback(() => {
    const dx = targetPos.current.x - smoothPos.current.x
    const dy = targetPos.current.y - smoothPos.current.y
    if (Math.abs(dx) > 0.0003 || Math.abs(dy) > 0.0003) {
      smoothPos.current.x += dx * 0.07
      smoothPos.current.y += dy * 0.07
      setMousePos({ x: smoothPos.current.x, y: smoothPos.current.y })
      setOrbOffset({
        x: (smoothPos.current.x - 0.5) * 28,
        y: (smoothPos.current.y - 0.5) * 28,
      })
    }
    rafRef.current = requestAnimationFrame(animateCursor)
  }, [])

  // ── canvas trail
  const drawTrail = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { trailRafRef.current = requestAnimationFrame(drawTrail); return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { trailRafRef.current = requestAnimationFrame(drawTrail); return }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    trailPts.current = trailPts.current
      .map(p => ({ ...p, op: p.op * 0.87 }))
      .filter(p => p.op > 0.004)
    for (let i = 1; i < trailPts.current.length; i++) {
      const a = trailPts.current[i - 1]
      const b = trailPts.current[i]
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
      g.addColorStop(0, `rgba(240,185,106,${a.op * 0.55})`)
      g.addColorStop(1, `rgba(184,115,51,${b.op * 0.35})`)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = g
      ctx.lineWidth = Math.max(0.4, a.op * 3.5)
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    if (trailPts.current.length && isHovering) {
      const tip = trailPts.current[trailPts.current.length - 1]
      const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14)
      glow.addColorStop(0, `rgba(240,185,106,${tip.op * 0.5})`)
      glow.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 14, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()
    }
    trailRafRef.current = requestAnimationFrame(drawTrail)
  }, [isHovering])

  // ── count-up
  const countUp = useCallback((target: number) => {
    const start = Date.now()
    const dur = 1800
    const tick = () => {
      const t = Math.min((Date.now() - start) / dur, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setSoldCount(Math.floor(ease * target))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  // ── magnetic buttons
  const applyMagnetic = useCallback((e: MouseEvent, ref: React.RefObject<HTMLAnchorElement | null>) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 85) {
      const pull = (1 - dist / 85) * 0.36
      el.style.transform = `translate(${dx * pull}px,${dy * pull}px) scale(1.02)`
    } else {
      el.style.transform = ''
    }
  }, [])

  useEffect(() => {
    if (isTouchDevice) return
    rafRef.current = requestAnimationFrame(animateCursor)
    trailRafRef.current = requestAnimationFrame(drawTrail)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (trailRafRef.current) cancelAnimationFrame(trailRafRef.current)
    }
  }, [isTouchDevice, animateCursor, drawTrail])

  // canvas resize + mouse tracking
  useEffect(() => {
    if (isTouchDevice) return
    const el = containerRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return
    const resize = () => { canvas.width = el.offsetWidth; canvas.height = el.offsetHeight }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      targetPos.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
      setIsHovering(true)
      trailPts.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, op: 0.95 })
      if (trailPts.current.length > 64) trailPts.current.shift()
      applyMagnetic(e, primaryBtnRef)
      applyMagnetic(e, secondaryBtnRef)
    }
    const onLeave = () => {
      targetPos.current = { x: 0.5, y: 0.5 }
      setIsHovering(false)
      if (primaryBtnRef.current) primaryBtnRef.current.style.transform = ''
      if (secondaryBtnRef.current) secondaryBtnRef.current.style.transform = ''
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); ro.disconnect() }
  }, [isTouchDevice, applyMagnetic])

  // touch tilt
  useEffect(() => {
    if (!isTouchDevice) return
    const el = containerRef.current; if (!el) return
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0], r = el.getBoundingClientRect()
      const nx = (t.clientX - r.left) / r.width
      const ny = (t.clientY - r.top) / r.height
      targetPos.current = { x: nx, y: ny }
      setMousePos({ x: nx, y: ny })
      setOrbOffset({ x: (nx - 0.5) * 24, y: (ny - 0.5) * 24 })
    }
    el.addEventListener('touchmove', onTouch, { passive: true })
    return () => el.removeEventListener('touchmove', onTouch)
  }, [isTouchDevice])

  // fetch top product
  useEffect(() => {
    const fetchProduct = async () => {
      const supabase = createBrowserClient()
      try {
        const { data, error } = await supabase.rpc('get_top_selling_product')
        if (error || !data?.length) {
          const { data: od } = await supabase
            .from('order_items')
            .select('product_id, quantity, products (id, name, image_url, images)')
            .order('created_at', { ascending: false })
            .limit(500)
          if (od?.length) {
            const map: Record<string, { sold: number; product: Product }> = {}
            od.forEach((item: any) => {
              const pid = item.product_id
              if (!map[pid] && item.products) map[pid] = { sold: 0, product: item.products[0] }
              if (map[pid]) map[pid].sold += item.quantity ?? 0
            })
            const sorted = Object.values(map).sort((a, b) => b.sold - a.sold)
            if (sorted.length) {
              const top = sorted[0]
              setTopProduct({ id: top.product.id, name: top.product.name, image_url: top.product.image_url, images: top.product.images || [], total_sold: top.sold })
              setTimeout(() => countUp(top.sold), 900)
            }
          }
        } else {
          setTopProduct(data[0])
          setTimeout(() => countUp(data[0].total_sold), 900)
        }
      } catch { /* silent */ } finally { setLoading(false) }
    }
    fetchProduct()
  }, [countUp])

  // headline rotation
  useEffect(() => {
    const t = setInterval(() => {
      setPrevHlIndex(hlIndex)
      setHlIndex(p => (p + 1) % HEADLINES.length)
    }, 4500)
    return () => clearInterval(t)
  }, [hlIndex])

  const rotX = (mousePos.y - 0.5) * -9
  const rotY = (mousePos.x - 0.5) * 9
  const productImage = topProduct && !imageError
    ? topProduct.images?.[0] || topProduct.image_url
    : null

  // FIX: Use individual animation properties instead of mixing shorthand with longhand
  const fadeUpStyle = (delay: number): React.CSSProperties => mounted ? {
    animationName: 'fadeUp',
    animationDuration: '0.75s',
    animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
    animationFillMode: 'both',
    animationDelay: `${delay}ms`,
  } : { opacity: 0 }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden mb-12"
      style={{
        background: 'linear-gradient(145deg, #060d07 0%, #0a1a0b 40%, #0d2010 65%, #060d07 100%)',
        minHeight: 'clamp(520px, 66vh, 740px)',
      }}
    >
      {/* Canvas trail */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{ mixBlendMode: 'screen' }}
      />
      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          opacity: 0.045,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '160px 160px',
        }}
      />
      {/* Morphing orbs */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute"
          style={{
            width: '60%', height: '70%',
            top: '-10%', right: '-5%',
            background: 'radial-gradient(ellipse, rgba(184,115,51,0.18) 0%, rgba(184,115,51,0.05) 50%, transparent 70%)',
            filter: 'blur(70px)',
            transform: `translate(${orbOffset.x * -0.8}px, ${orbOffset.y * -0.8}px)`,
            transition: 'transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94)',
            animation: 'orbMorph1 14s ease-in-out infinite',
          }}
        />
        <div
          className="absolute"
          style={{
            width: '50%', height: '60%',
            bottom: '-10%', left: '-5%',
            background: 'radial-gradient(ellipse, rgba(56,143,60,0.14) 0%, transparent 70%)',
            filter: 'blur(90px)',
            transform: `translate(${orbOffset.x * 0.6}px, ${orbOffset.y * 0.6}px)`,
            transition: 'transform 1s cubic-bezier(0.25,0.46,0.45,0.94)',
            animation: 'orbMorph2 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute"
          style={{
            width: '25%', height: '25%',
            top: '38%', left: '38%',
            background: 'radial-gradient(ellipse, rgba(240,185,106,0.07) 0%, transparent 70%)',
            filter: 'blur(50px)',
            animation: 'orbPulse 9s ease-in-out infinite',
          }}
        />
      </div>
      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          opacity: 0.016,
          backgroundImage: `
            linear-gradient(rgba(240,185,106,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(240,185,106,1) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />
      {/* Spotlight */}
      {!isTouchDevice && mounted && (
        <div
          className="absolute inset-0 pointer-events-none z-[2] transition-opacity duration-500"
          style={{
            opacity: isHovering ? 1 : 0,
            background: `radial-gradient(500px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(184,115,51,0.1), transparent 55%)`,
          }}
        />
      )}
      {/* ═══════════ LAYOUT ═══════════ */}
      <div className="relative z-10 flex flex-col md:flex-row h-full">
        {/* ── Left copy column ── */}
        <div className="flex-1 px-6 sm:px-10 md:px-12 lg:px-16 py-10 md:py-16 lg:py-20 flex flex-col justify-center pr-[clamp(120px,28vw,160px)] md:pr-0">
          {/* Eyebrow */}
          <div
            className="flex items-center gap-3 mb-6 md:mb-8"
            style={fadeUpStyle(0)}
          >
            <div className="flex items-center gap-1">
              {[0, 0.2, 0.4].map((d, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 4 + i, height: 4 + i,
                    backgroundColor: i === 1 ? '#F0B96A' : '#B87333',
                    opacity: i === 1 ? 1 : 0.7,
                    animation: `dotBounce 1.6s ease-in-out ${d}s infinite alternate`,
                  }}
                />
              ))}
            </div>
            <span
              className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.32em] font-mono"
              style={{ color: '#C8823A', letterSpacing: '0.32em' }}
            >
              THE BUSHAL COLLECTION
            </span>
            <div className="h-px w-8 flex-shrink-0" style={{ background: 'linear-gradient(to right, #B87333, transparent)' }} />
          </div>
          {/* Headline block */}
          <div
            className="mb-6 md:mb-8 lg:mb-10"
            style={fadeUpStyle(80)}
          >
            {/* Eyebrow line */}
            <div className="relative overflow-hidden mb-2" style={{ height: '1.65em' }}>
              {HEADLINES.map((h, i) => (
                <p
                  key={i}
                  className="absolute inset-0 text-sm sm:text-base md:text-xl lg:text-2xl font-light font-sans"
                  style={{
                    color: 'rgba(240,232,210,0.55)',
                    letterSpacing: '0.04em',
                    opacity: i === hlIndex ? 1 : 0,
                    transform: i === hlIndex ? 'translateY(0)' : i === prevHlIndex ? 'translateY(-110%)' : 'translateY(110%)',
                    transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.76,0,0.24,1)',
                  }}
                >
                  {h.eyebrow}
                </p>
              ))}
            </div>
            {/* Main hero word */}
            <div
              className="relative overflow-hidden"
              style={{ minHeight: 'clamp(3.8rem, 9vw, 7.5rem)', height: 'auto' }}
            >
              {HEADLINES.map((h, i) => (
                <h1
                  key={i}
                  className="absolute left-0 top-0 font-serif font-extrabold"
                  style={{
                    fontSize: 'clamp(2rem, 5.5vw, 6.5rem)',
                    letterSpacing: '-0.025em',
                    lineHeight: 1,
                    color: '#D9A55A',
                    textShadow: 'none',
                    opacity: i === hlIndex ? 1 : 0,
                    transform: i === hlIndex
                      ? 'translateY(0) skewY(0deg)'
                      : i === prevHlIndex
                        ? 'translateY(-115%) skewY(-1.5deg)'
                        : 'translateY(115%) skewY(1.5deg)',
                    transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.76,0,0.24,1), text-shadow 0.3s ease',
                  }}
                >
                  {h.word}
                </h1>
              ))}
            </div>
            {/* Underline */}
            <div
              className="mt-3 h-px"
              style={{
                background: 'linear-gradient(to right, rgba(184,115,51,0.7), rgba(240,185,106,0.25), transparent)',
                ...(mounted ? {
                  animationName: 'expandLine',
                  animationDuration: '1s',
                  animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
                  animationDelay: '0.5s',
                  animationFillMode: 'both',
                } : {}),
                transformOrigin: 'left center',
              }}
            />
          </div>
          {/* Body */}
          <p
            className="text-sm sm:text-[15px] leading-[1.8] mb-8 md:mb-10 font-sans max-w-[400px]"
            style={{
              color: 'rgba(240,232,210,0.52)',
              ...fadeUpStyle(160),
            }}
          >
            Handpicked, heritage-quality goods delivered across Bangladesh.{' '}
            <span style={{ color: 'rgba(240,232,210,0.3)' }}>
              Transparent pricing. Genuine care. Every single detail.
            </span>
          </p>
          {/* CTA buttons */}
          <div
            className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-10 md:mb-12"
            style={fadeUpStyle(240)}
          >
            {/* Primary */}
            <Link
              ref={primaryBtnRef}
              href="#products"
              className="group/p relative inline-flex items-center gap-2.5 rounded-xl font-bold font-sans text-sm overflow-hidden select-none"
              style={{
                padding: '13px 26px',
                background: primaryDown
                  ? 'linear-gradient(135deg, #9a5820, #7a4018)'
                  : 'linear-gradient(135deg, #C8823A, #A05E28)',
                color: '#F8EDD8',
                transform: primaryDown ? 'scale(0.96)' : 'scale(1)',
                transition: 'box-shadow 0.15s ease, transform 0.12s ease, background 0.15s ease',
                letterSpacing: '0.02em',
              }}
              onMouseDown={() => setPrimaryDown(true)}
              onMouseUp={() => setPrimaryDown(false)}
              onMouseLeave={() => setPrimaryDown(false)}
              onTouchStart={() => setPrimaryDown(true)}
              onTouchEnd={() => setPrimaryDown(false)}
            >
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.13) 50%, transparent 70%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2.8s linear infinite',
                }}
              />
              <span className="relative z-10">Explore Collection</span>
              <svg
                className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover/p:translate-x-1.5"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            {/* Secondary */}
            <Link
              ref={secondaryBtnRef}
              href="/orders"
              className="group/t inline-flex items-center gap-2 rounded-xl font-medium font-sans text-sm select-none transition-all duration-200"
              style={{
                padding: '13px 20px',
                color: secondaryDown ? 'rgba(240,232,210,0.9)' : 'rgba(240,232,210,0.62)',
                border: `1px solid ${secondaryDown ? 'rgba(240,232,210,0.3)' : 'rgba(240,232,210,0.13)'}`,
                background: secondaryDown ? 'rgba(240,232,210,0.09)' : 'rgba(255,255,255,0.02)',
                backdropFilter: 'blur(8px)',
                transform: secondaryDown ? 'scale(0.97)' : 'scale(1)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = 'rgba(240,232,210,0.07)'
                el.style.borderColor = 'rgba(240,232,210,0.26)'
                el.style.color = 'rgba(240,232,210,0.88)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = 'rgba(255,255,255,0.02)'
                el.style.borderColor = 'rgba(240,232,210,0.13)'
                el.style.color = 'rgba(240,232,210,0.62)'
                setSecondaryDown(false)
              }}
              onMouseDown={() => setSecondaryDown(true)}
              onMouseUp={() => setSecondaryDown(false)}
              onTouchStart={() => setSecondaryDown(true)}
              onTouchEnd={() => setSecondaryDown(false)}
            >
              <svg
                className="w-3.5 h-3.5 transition-transform duration-300 group-hover/t:translate-x-0.5"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Track Order</span>
            </Link>
          </div>
          {/* Trust strip */}
          <div
            className="flex flex-wrap items-center gap-4 sm:gap-6 md:gap-8 pt-5 md:pt-6"
            style={{
              borderTop: '1px solid rgba(240,232,210,0.07)',
              ...fadeUpStyle(320),
            }}
          >
            {[
              {
                path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
                label: 'Secure bKash',
              },
              {
                path: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
                label: 'Free Delivery ৳1000+',
              },
              {
                path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
                label: '4.9 / 5 Rating',
              },
            ].map(({ path, label }, idx) => (
              <div
                key={label}
                className="flex items-center gap-2 group/trust cursor-default"
                style={fadeUpStyle(420 + idx * 70)}
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 group-hover/trust:scale-125"
                  style={{ color: '#C8823A' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
                </svg>
                <span
                  className="text-[10px] sm:text-[11px] font-medium font-sans"
                  style={{ color: 'rgba(240,232,210,0.4)' }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* ── Right — product visual — desktop ── */}
        <div
          className="hidden md:flex items-center justify-center flex-shrink-0 pointer-events-none overflow-visible"
          style={{ width: 'clamp(420px, 50vw, 600px)', padding: '48px 56px 48px 32px' }}
        >
          <div
            className="relative transition-transform duration-200 ease-out"
            style={{
              width: 'clamp(340px, 36vw, 480px)',
              height: 'clamp(340px, 36vw, 480px)',
              transform: `perspective(1100px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Particles */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: 'translateZ(-70px)', opacity: 0.65 }}
              viewBox="0 0 100 100"
            >
              {PARTICLES.map(p => (
                <circle key={p.id} cx={p.cx} cy={p.cy} r={p.r} fill="#F0B96A" opacity={p.op}
                  style={{ animation: `pPulse ${p.dur}s ease-in-out ${p.delay}s infinite alternate` }} />
              ))}
            </svg>
            {/* Outer orbit */}
            <div
              className="absolute inset-0 rounded-full"
              style={{ border: '1px solid rgba(184,115,51,0.1)', transform: 'translateZ(-45px)', animation: 'spin 65s linear infinite' }}
            >
              <div className="absolute" style={{ top: '3%', left: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: 'radial-gradient(circle, #F5C878, #C07840)', boxShadow: '0 0 14px 5px rgba(240,185,106,0.55)' }} />
              <div className="absolute" style={{ bottom: '3%', left: '50%', transform: 'translate(-50%,50%)', width: 6, height: 6, borderRadius: '50%', background: 'rgba(184,115,51,0.45)' }} />
            </div>
            {/* Mid orbit */}
            <div
              className="absolute inset-[7%] rounded-full"
              style={{ border: '1px dashed rgba(240,185,106,0.07)', transform: 'translateZ(-18px)', animation: 'spin 42s linear infinite reverse' }}
            >
              <div className="absolute" style={{ top: '2%', right: '11%', width: 5, height: 5, borderRadius: '50%', background: 'rgba(240,185,106,0.45)', boxShadow: '0 0 7px 2px rgba(240,185,106,0.3)' }} />
            </div>
            {/* Inner glow ring */}
            <div
              className="absolute inset-[11%] rounded-full"
              style={{ border: '1px solid rgba(184,115,51,0.05)', transform: 'translateZ(15px)', animation: 'spin 28s linear infinite' }}
            />
            {/* Central image */}
            <div
              className="absolute inset-[13%] rounded-full overflow-hidden"
              style={{
                transform: 'translateZ(55px)',
                background: '#060d07',
                boxShadow: '0 0 0 1.5px rgba(184,115,51,0.28), 0 0 0 9px rgba(6,13,7,0.5), 0 0 0 10px rgba(184,115,51,0.07), 0 36px 90px rgba(0,0,0,0.75), inset 0 1px 0 rgba(240,185,106,0.18)',
              }}
            >
              {/* top sheen */}
              <div className="absolute top-0 left-0 right-0 h-1/2 pointer-events-none z-10" style={{ background: 'linear-gradient(180deg, rgba(240,185,106,0.09) 0%, transparent 100%)', borderRadius: '50% 50% 0 0 / 100% 100% 0 0' }} />
              {productImage ? (
                <Link href={`/product/${topProduct!.id}`} className="block w-full h-full relative group/img pointer-events-auto">
                  <img
                    src={productImage}
                    alt={topProduct!.name}
                    className="w-full h-full object-cover"
                    style={{
                      filter: imageLoaded ? 'brightness(0.93) contrast(1.06) saturate(1.12)' : 'blur(16px) brightness(0.3)',
                      transform: 'scale(1)',
                      transition: 'filter 0.9s ease, transform 0.7s ease',
                    }}
                    onLoad={e => { setImageLoaded(true); (e.currentTarget as HTMLElement).style.filter = 'brightness(0.93) contrast(1.06) saturate(1.12)' }}
                    onError={() => setImageError(true)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.07)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                  />
                  <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 42%, rgba(4,10,5,0.55) 100%)' }} />
                  {/* Badge */}
                  <div
                    className="absolute bottom-[13%] left-1/2 z-20 pointer-events-none"
                    style={{
                      transform: 'translateX(-50%)',
                      ...(mounted ? {
                        animationName: 'badgePop',
                        animationDuration: '0.5s',
                        animationTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)',
                        animationDelay: '1.2s',
                        animationFillMode: 'both',
                      } : {}),
                    }}
                  >
                    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'rgba(4,10,5,0.85)', backdropFilter: 'blur(14px)', border: '1px solid rgba(184,115,51,0.38)', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
                      <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#F0B96A' }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] font-sans" style={{ color: '#F0B96A' }}>Best Seller</span>
                      <span className="text-[9px] font-mono tabular-nums" style={{ color: 'rgba(240,232,210,0.42)' }}>· {soldCount} sold</span>
                    </div>
                  </div>
                </Link>
              ) : loading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '2px solid rgba(184,115,51,0.12)', borderTopColor: '#C07840' }} />
                    <div className="absolute inset-2 rounded-full animate-spin" style={{ border: '1.5px solid rgba(240,185,106,0.08)', borderBottomColor: '#F0B96A', animationDuration: '1.4s', animationDirection: 'reverse' }} />
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-serif font-black" style={{ fontSize: '5rem', color: '#F0B96A', textShadow: '0 0 40px rgba(184,115,51,0.5)' }}>B</span>
                </div>
              )}
            </div>
            {/* Float Cards */}
            <FloatCard
              style={{
                top: '4%', left: '-7%',
                transform: `translateZ(95px) translate(${(mousePos.x - 0.5) * -24}px, ${(mousePos.y - 0.5) * -24}px)`,
                ...(mounted ? { animation: 'floatA 6s ease-in-out infinite' } : {}),
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(184,115,51,0.18)' }}>
                  <svg className="w-3.5 h-3.5" style={{ color: '#F0B96A' }} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide font-sans" style={{ color: 'rgba(240,232,210,0.88)' }}>Premium</span>
              </div>
              <p className="text-[10px] leading-snug font-sans" style={{ color: 'rgba(240,232,210,0.38)' }}>Heritage-grade goods</p>
            </FloatCard>
            <FloatCard
              style={{
                bottom: '2%', right: '-2%',
                transform: `translateZ(75px) translate(${(mousePos.x - 0.5) * 22}px, ${(mousePos.y - 0.5) * 22}px)`,
                ...(mounted ? { animation: 'floatB 7.5s ease-in-out infinite' } : {}),
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide font-sans" style={{ color: '#D4954A' }}>Live Status</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#34D399', boxShadow: '0 0 6px 2px rgba(52,211,153,0.5)', animation: 'livePulse 2s ease-in-out infinite' }} />
                  <span className="text-[8px] font-bold font-mono" style={{ color: '#34D399' }}>LIVE</span>
                </div>
              </div>
              <p className="text-[10px] font-sans" style={{ color: 'rgba(240,232,210,0.35)' }}>Orders shipping now</p>
            </FloatCard>
            <div
              className="absolute pointer-events-none"
              style={{
                top: '16%', right: '2%',
                transform: `translateZ(115px) translate(${(mousePos.x - 0.5) * 30}px, ${(mousePos.y - 0.5) * 30}px)`,
                transition: 'transform 0.12s linear',
                ...(mounted ? { animation: 'floatC 5.5s ease-in-out infinite' } : {}),
              }}
            >
              <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(140,0,50,0.22)', backdropFilter: 'blur(18px)', border: '1px solid rgba(200,0,80,0.3)', boxShadow: '0 8px 24px rgba(120,0,40,0.3)' }}>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] font-sans text-center" style={{ color: '#F48FB1' }}>bKash</p>
                <p className="text-[8px] font-sans text-center mt-0.5" style={{ color: 'rgba(240,232,210,0.4)' }}>Secure Pay</p>
              </div>
            </div>
            <FloatCard
              style={{
                bottom: '15%', left: '-6%',
                transform: `translateZ(65px) translate(${(mousePos.x - 0.5) * -18}px, ${(mousePos.y - 0.5) * 18}px)`,
                ...(mounted ? { animation: 'floatD 8s ease-in-out infinite' } : {}),
                minWidth: 112,
              }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#6EE7B7' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="text-[9px] font-bold font-sans uppercase tracking-wide" style={{ color: '#6EE7B7' }}>Delivery</span>
              </div>
              <p className="text-[8px] font-sans" style={{ color: 'rgba(240,232,210,0.36)' }}>All BD districts</p>
            </FloatCard>
          </div>
        </div>
      </div>
      {/* ═══ Mobile product circle ═══ */}
      <div
        className="md:hidden absolute right-2 top-6 pointer-events-none"
        style={{
          width: 'clamp(100px, 26vw, 140px)',
          height: 'clamp(100px, 26vw, 140px)',
          top: '16px',
          transform: 'none',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid rgba(184,115,51,0.16)', animation: 'spin 50s linear infinite' }}
        />
        <div
          className="absolute inset-[10%] rounded-full overflow-hidden"
          style={{ boxShadow: '0 0 0 1.5px rgba(184,115,51,0.24), 0 18px 48px rgba(0,0,0,0.65)' }}
        >
          {productImage ? (
            <Link href={`/product/${topProduct!.id}`} className="block w-full h-full pointer-events-auto">
              <img
                src={productImage}
                alt={topProduct!.name}
                className="w-full h-full object-cover"
                style={{
                  filter: imageLoaded ? 'brightness(0.92) saturate(1.1)' : 'blur(10px) brightness(0.2)',
                  transition: 'filter 0.9s ease',
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 42%, rgba(4,10,5,0.5) 100%)' }} />
            </Link>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#0a1a0b' }}>
              <span className="font-serif font-black text-4xl" style={{ color: '#F0B96A', textShadow: '0 0 20px rgba(184,115,51,0.5)' }}>B</span>
            </div>
          )}
        </div>
        {/* Mobile badge */}
        {topProduct && (
          <div
            className="absolute -bottom-2 left-1/2 z-20"
            style={{
              transform: 'translateX(-50%)',
              ...(mounted ? {
                animationName: 'badgePop',
                animationDuration: '0.5s',
                animationTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)',
                animationDelay: '1.1s',
                animationFillMode: 'both',
              } : {}),
            }}
          >
            <div className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'rgba(4,10,5,0.92)', border: '1px solid rgba(184,115,51,0.35)', backdropFilter: 'blur(12px)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[8px] font-bold font-mono tabular-nums" style={{ color: '#F0B96A' }}>{soldCount} sold</span>
            </div>
          </div>
        )}
      </div>
      {/* Keyframes */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes expandLine {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pPulse {
          from { opacity: 0.06; }
          to   { opacity: 0.36; }
        }
        @keyframes floatA {
          0%,100% { translate: 0 0px; }
          50%      { translate: 0 -10px; }
        }
        @keyframes floatB {
          0%,100% { translate: 0 0px; }
          50%      { translate: 0 -12px; }
        }
        @keyframes floatC {
          0%,100% { translate: 0 0px; }
          50%      { translate: 0 8px; }
        }
        @keyframes floatD {
          0%,100% { translate: 0 0px; }
          50%      { translate: 0 -7px; }
        }
        @keyframes dotBounce {
          from { transform: scale(0.7); opacity: 0.45; }
          to   { transform: scale(1.3); opacity: 1; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes badgePop {
          from { opacity: 0; transform: translateX(-50%) scale(0.6); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes livePulse {
          0%,100% { box-shadow: 0 0 6px 2px rgba(52,211,153,0.5); }
          50%      { box-shadow: 0 0 10px 4px rgba(52,211,153,0.7); }
        }
        @keyframes orbMorph1 {
          0%,100% { border-radius: 58% 42% 68% 32% / 48% 62% 38% 52%; }
          40%      { border-radius: 42% 58% 32% 68% / 62% 38% 62% 38%; }
          70%      { border-radius: 68% 32% 52% 48% / 38% 52% 58% 42%; }
        }
        @keyframes orbMorph2 {
          0%,100% { border-radius: 52% 48% 60% 40% / 58% 42% 50% 50%; }
          50%      { border-radius: 38% 62% 42% 58% / 48% 58% 42% 52%; }
        }
        @keyframes orbPulse {
          0%,100% { transform: scale(1);   opacity: 0.5; }
          50%      { transform: scale(1.35); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── Reusable float card shell
function FloatCard({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        transition: 'transform 0.14s linear',
        ...style,
      }}
    >
      <div
        className="rounded-2xl"
        style={{
          padding: '10px 14px',
          background: 'rgba(6,13,7,0.88)',
          backdropFilter: 'blur(22px)',
          border: '1px solid rgba(184,115,51,0.2)',
          boxShadow: '0 14px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(240,185,106,0.07)',
          minWidth: 120,
        }}
      >
        {children}
      </div>
    </div>
  )
}