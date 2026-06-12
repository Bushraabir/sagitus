// app/components/admin/AdminOverviewClient.tsx

// Premium Admin Overview Client with animated counters, sparklines, 
// revenue charts, donut charts, and business insights.

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  productCount: number
  orderCount: number
  userCount: number
  totalRevenue: number
  fulfilledOrdersCount: number
  pendingOrders: number
  cancelledOrders: number
  outOfStock: number
  lowStock: number
  healthyStock: number
}

interface DailyMetric {
  label: string
  revenue: number
  orders: number
  avgOrderValue: number
}

interface Props {
  stats: Stats
  dailyMetrics: DailyMetric[]
  orderPoints: number[]
  orderSegments: { value: number; color: string; label: string }[]
  catEntries: { label: string; value: number; color: string }[]
  inventorySegments: { value: number; color: string; label: string }[]
  topByValue: any[]
  recentOrders: any[]
}

// ─── Animated Counter ────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, duration = 1400, delay = 0) {
  const [current, setCurrent] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started) setStarted(true)
    }, { threshold: 0.1 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => {
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1)
        const ease = 1 - Math.pow(1 - p, 4)
        setCurrent(Math.floor(ease * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(t)
  }, [target, duration, delay, started])

  return { current, ref }
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ data, color, filled = false }: { data: number[]; color: string; filled?: boolean }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80, h = 28
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h * 0.85,
  }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const area = `${line} L ${w} ${h} L 0 ${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {filled && <path d={area} fill={color} opacity="0.12" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
type Accent = 'copper' | 'forest' | 'blue' | 'violet' | 'rose'

const accentMap: Record<Accent, { border: string; glow: string; text: string; dot: string; iconBg: string }> = {
  copper: {
    border: 'border-bushal-copper/25',
    glow: 'hover:shadow-[0_8px_40px_rgba(184,115,51,0.18)]',
    text: 'text-bushal-copper',
    dot: 'bg-bushal-copper',
    iconBg: 'bg-bushal-copper/10 text-bushal-copper',
  },
  forest: {
    border: 'border-bushal-forest/20',
    glow: 'hover:shadow-[0_8px_40px_rgba(27,58,45,0.15)]',
    text: 'text-bushal-forest',
    dot: 'bg-bushal-forest',
    iconBg: 'bg-bushal-forest/10 text-bushal-forest',
  },
  blue: {
    border: 'border-blue-200',
    glow: 'hover:shadow-[0_8px_40px_rgba(59,130,246,0.15)]',
    text: 'text-blue-600',
    dot: 'bg-blue-500',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  violet: {
    border: 'border-violet-200',
    glow: 'hover:shadow-[0_8px_40px_rgba(139,92,246,0.15)]',
    text: 'text-violet-600',
    dot: 'bg-violet-500',
    iconBg: 'bg-violet-50 text-violet-600',
  },
  rose: {
    border: 'border-rose-200',
    glow: 'hover:shadow-[0_8px_40px_rgba(244,63,94,0.15)]',
    text: 'text-rose-600',
    dot: 'bg-rose-500',
    iconBg: 'bg-rose-50 text-rose-600',
  },
}

function KPICard({
  label, value, sub, icon, accent, delay = 0, isPrice = false, sparkData, trend,
}: {
  label: string; value: number; sub?: string; icon: React.ReactNode
  accent: Accent; delay?: number; isPrice?: boolean
  sparkData?: number[]; trend?: { value: number; positive: boolean }
}) {
  const { current, ref } = useAnimatedNumber(value, 1400, delay)
  const a = accentMap[accent]

  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-bushal-surface p-5 flex flex-col gap-3',
        'transition-all duration-500 hover:-translate-y-1 cursor-default',
        a.border, a.glow,
        'animate-fade-in-up'
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />

      <div className="flex items-start justify-between relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft">{label}</p>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', a.iconBg)}>
          {icon}
        </div>
      </div>

      <div className="relative z-10">
        <p className={cn('text-[2rem] font-extrabold tracking-tight tabular-nums leading-none', a.text)}>
          {isPrice ? formatPrice(current) : current.toLocaleString()}
        </p>
        {sub && <p className="text-[11px] text-bushal-inkSoft mt-1.5">{sub}</p>}
      </div>

      <div className="flex items-center justify-between relative z-10">
        {trend && (
          <span className={cn(
            'text-[11px] font-bold px-2 py-0.5 rounded-full',
            trend.positive ? 'bg-bushal-successBg text-bushal-success' : 'bg-bushal-dangerBg text-bushal-danger'
          )}>
            {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
        {sparkData && <Sparkline data={sparkData} color={a.dot.replace('bg-', '').includes('#') ? a.dot : '#B87333'} filled />}
      </div>
    </div>
  )
}

// ─── Advanced Revenue Chart ───────────────────────────────────────────────────
function RevenueChart({ data }: { data: DailyMetric[] }) {
  const [active, setActive] = useState({ revenue: true, orders: true, aov: false })
  const [hovered, setHovered] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setTimeout(() => setMounted(true), 300) }, [])

  if (!data.length) return null

  const W = 900, H = 280
  const PAD = { top: 16, right: 24, bottom: 40, left: 56 }
  const CW = W - PAD.left - PAD.right
  const CH = H - PAD.top - PAD.bottom

  const maxRev = Math.max(...data.map(d => d.revenue), 1)
  const maxOrd = Math.max(...data.map(d => d.orders), 1)
  const maxAov = Math.max(...data.map(d => d.avgOrderValue), 1)

  const px = (i: number) => PAD.left + (i / (data.length - 1)) * CW
  const py = (v: number, max: number) => PAD.top + CH - (v / max) * CH

  const smoothPath = (vals: number[], max: number) => {
    const pts = vals.map((v, i) => ({ x: px(i), y: py(v, max) }))
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i], n = pts[i + 1] || c
      const cp1x = p.x + (c.x - p.x) / 2.5
      const cp1y = p.y
      const cp2x = c.x - (n.x - p.x) / 6
      const cp2y = c.y - (n.y - p.y) / 6
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${c.x} ${c.y}`
    }
    return d
  }

  const revPath = smoothPath(data.map(d => d.revenue), maxRev)
  const ordPath = smoothPath(data.map(d => d.orders), maxOrd)
  const aovPath = smoothPath(data.map(d => d.avgOrderValue), maxAov)

  const yGridVals = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[
          { key: 'revenue' as const, label: 'Revenue', color: '#B87333' },
          { key: 'orders' as const, label: 'Orders', color: '#1B3A2D' },
          { key: 'aov' as const, label: 'Avg Order Value', color: '#8B5CF6' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setActive(a => ({ ...a, [s.key]: !a[s.key] }))}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200 border',
              active[s.key]
                ? 'border-transparent text-bushal-ink shadow-sm'
                : 'border-bushal-border text-bushal-inkSoft opacity-50'
            )}
            style={active[s.key] ? { background: `${s.color}18`, borderColor: `${s.color}40` } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative w-full" style={{ paddingBottom: '31%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B87333" stopOpacity="0.25" />
              <stop offset="85%" stopColor="#B87333" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B3A2D" stopOpacity="0.2" />
              <stop offset="85%" stopColor="#1B3A2D" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gAov" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.18" />
              <stop offset="85%" stopColor="#8B5CF6" stopOpacity="0" />
            </linearGradient>
            <clipPath id="chartClip">
              <rect x={PAD.left} y={PAD.top} width={CW} height={CH} />
            </clipPath>
          </defs>

          {yGridVals.map((t, i) => {
            const y = PAD.top + CH * (1 - t)
            const val = maxRev * t
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="#E0D9CE" strokeWidth="1" strokeDasharray={i === 0 ? 'none' : '3 5'} opacity="0.6" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#6B6B65" fontWeight="600">
                  {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                </text>
              </g>
            )
          })}

          <g clipPath="url(#chartClip)">
            {active.revenue && <path d={`${revPath} L ${px(data.length - 1)} ${PAD.top + CH} L ${px(0)} ${PAD.top + CH} Z`} fill="url(#gRev)" />}
            {active.orders && <path d={`${ordPath} L ${px(data.length - 1)} ${PAD.top + CH} L ${px(0)} ${PAD.top + CH} Z`} fill="url(#gOrd)" />}
            {active.aov && <path d={`${aovPath} L ${px(data.length - 1)} ${PAD.top + CH} L ${px(0)} ${PAD.top + CH} Z`} fill="url(#gAov)" />}

            {active.revenue && <path d={revPath} fill="none" stroke="#B87333" strokeWidth="2.5" strokeLinecap="round" />}
            {active.orders && <path d={ordPath} fill="none" stroke="#1B3A2D" strokeWidth="2.5" strokeLinecap="round" />}
            {active.aov && <path d={aovPath} fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />}

            {hovered !== null && (
              <line x1={px(hovered)} y1={PAD.top} x2={px(hovered)} y2={PAD.top + CH}
                stroke="#6B6B65" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            )}

            {data.map((d, i) => (
              <g key={i}>
                <rect
                  x={px(i) - CW / (data.length * 2)}
                  y={PAD.top} width={CW / data.length} height={CH}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-crosshair"
                />
                {active.revenue && hovered === i && (
                  <circle cx={px(i)} cy={py(d.revenue, maxRev)} r="5" fill="#B87333" stroke="white" strokeWidth="2" />
                )}
                {active.orders && hovered === i && (
                  <circle cx={px(i)} cy={py(d.orders, maxOrd)} r="5" fill="#1B3A2D" stroke="white" strokeWidth="2" />
                )}
                {active.aov && hovered === i && (
                  <circle cx={px(i)} cy={py(d.avgOrderValue, maxAov)} r="5" fill="#8B5CF6" stroke="white" strokeWidth="2" />
                )}
              </g>
            ))}
          </g>

          {data.map((d, i) => (
            <text key={i} x={px(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#6B6B65" fontWeight="600">
              {d.label}
            </text>
          ))}
        </svg>

        {hovered !== null && (
          <div className="absolute z-20 pointer-events-none animate-scale-in"
            style={{
              left: `${(hovered / (data.length - 1)) * 82 + 6}%`,
              top: '8%',
              transform: 'translateX(-50%)',
            }}>
            <div className="bg-bushal-forest/95 backdrop-blur-sm text-white rounded-xl px-4 py-3 shadow-xl min-w-[140px]">
              <p className="text-[10px] font-bold text-bushal-copperGlow mb-2 uppercase tracking-wider">{data[hovered].label}</p>
              {active.revenue && (
                <div className="flex items-center justify-between gap-4 text-[11px]">
                  <span className="text-white/60">Revenue</span>
                  <span className="font-bold text-bushal-copperGlow">{formatPrice(data[hovered].revenue)}</span>
                </div>
              )}
              {active.orders && (
                <div className="flex items-center justify-between gap-4 text-[11px]">
                  <span className="text-white/60">Orders</span>
                  <span className="font-bold">{data[hovered].orders}</span>
                </div>
              )}
              {active.aov && (
                <div className="flex items-center justify-between gap-4 text-[11px]">
                  <span className="text-white/60">Avg Order</span>
                  <span className="font-bold text-violet-300">{formatPrice(data[hovered].avgOrderValue)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({
  segments, size = 144, centerLabel, centerSub
}: {
  segments: { value: number; color: string; label: string }[]
  size?: number; centerLabel?: string; centerSub?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  useEffect(() => { setTimeout(() => setMounted(true), 200) }, [])

  const total = segments.reduce((s, g) => s + g.value, 0) || 1
  const r = 44, cx = 60, cy = 60
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="relative flex flex-col items-center">
      <div style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
          {segments.map((seg, i) => {
            const pct = seg.value / total
            const dash = pct * circ
            const gap = circ - dash
            const cur = offset
            offset += dash
            const isH = hovered === i

            return (
              <circle key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={seg.color}
                strokeWidth={isH ? "18" : "14"}
                strokeLinecap="round"
                strokeDasharray={mounted ? `${dash - 2} ${gap + 2}` : `0 ${circ}`}
                strokeDashoffset={-cur}
                className="transition-all duration-500 cursor-pointer"
                style={{ transitionDelay: `${i * 120}ms`, filter: isH ? `drop-shadow(0 0 6px ${seg.color})` : 'none' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}
          <circle cx={cx} cy={cy} r="32" fill="var(--bushal-surface, #FEFCF8)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-extrabold text-bushal-forest tabular-nums leading-none">
            {hovered !== null ? segments[hovered].value : centerLabel}
          </p>
          <p className="text-[9px] font-bold text-bushal-inkSoft uppercase tracking-widest mt-0.5">
            {hovered !== null ? segments[hovered].label : centerSub}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full mt-4">
        {segments.map((s, i) => (
          <div key={s.label}
            className="flex items-center justify-between cursor-pointer group"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-white flex-shrink-0 group-hover:scale-125 transition-transform"
                style={{ background: s.color }} />
              <span className="text-[11px] font-semibold text-bushal-ink group-hover:text-bushal-forest transition-colors">{s.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-bushal-forest tabular-nums">{s.value}</span>
              <span className="text-[10px] text-bushal-inkSoft w-8 text-right tabular-nums">
                {((s.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────
function HorizontalBarChart({ entries }: { entries: { label: string; value: number; color: string }[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setTimeout(() => setMounted(true), 400) }, [])
  const max = Math.max(...entries.map(e => e.value), 1)

  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <div key={e.label} className="group">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-bushal-ink truncate max-w-[120px]">{e.label}</span>
            <span className="text-[11px] font-bold text-bushal-forest tabular-nums">{e.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bushal-ivoryDeep overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: mounted ? `${(e.value / max) * 100}%` : '0%',
                background: e.color,
                transitionDelay: `${i * 80}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stock Health Gauge ───────────────────────────────────────────────────────
function StockGauge({ healthy, low, out }: { healthy: number; low: number; out: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setTimeout(() => setMounted(true), 500) }, [])

  const total = healthy + low + out || 1
  const pct = (healthy / total) * 100

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-14 overflow-hidden">
        <svg viewBox="0 0 120 60" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#C0392B" />
              <stop offset="40%" stopColor="#D4954A" />
              <stop offset="100%" stopColor="#1B3A2D" />
            </linearGradient>
          </defs>
          <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="#E0D9CE" strokeWidth="10" strokeLinecap="round" />
          <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="url(#gaugeGrad)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${mounted ? pct * 1.57 : 0} 157`}
            className="transition-all duration-1000 ease-out"
          />
          <text x="60" y="50" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1B3A2D">
            {Math.round(pct)}%
          </text>
        </svg>
      </div>
      <p className="text-[10px] text-bushal-inkSoft font-semibold uppercase tracking-wider">Stock Health</p>
      <div className="grid grid-cols-3 gap-2 w-full text-center">
        {[
          { label: 'Healthy', value: healthy, color: 'text-bushal-success' },
          { label: 'Low', value: low, color: 'text-bushal-warning' },
          { label: 'Out', value: out, color: 'text-bushal-danger' },
        ].map(s => (
          <div key={s.label}>
            <p className={cn('text-base font-extrabold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] text-bushal-inkSoft font-semibold uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Revenue Progress Ring ────────────────────────────────────────────────────
function RevenueRing({ value, target = 200000 }: { value: number; target?: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setTimeout(() => setMounted(true), 600) }, [])

  const pct = Math.min(value / target, 1)
  const r = 38, cx = 48, cy = 48
  const circ = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E0D9CE" strokeWidth="8" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#B87333" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={mounted ? circ * (1 - pct) : circ}
            className="transition-all duration-1200 ease-out"
            style={{ filter: 'drop-shadow(0 0 8px rgba(184,115,51,0.4))' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-bold text-bushal-copper tabular-nums">{(pct * 100).toFixed(0)}%</p>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-bushal-inkSoft">Monthly Target</p>
        <p className="text-lg font-extrabold text-bushal-forest tabular-nums mt-0.5">{formatPrice(value)}</p>
        <p className="text-[11px] text-bushal-inkSoft mt-0.5">of {formatPrice(target)}</p>
      </div>
    </div>
  )
}

// ─── Recent Orders Table ──────────────────────────────────────────────────────
const statusCfg: Record<string, { pill: string; dot: string; label: string }> = {
  order_placed:     { pill: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-400', label: 'Placed' },
  confirmed:        { pill: 'bg-bushal-copper/10 text-bushal-copper border border-bushal-copper/25', dot: 'bg-bushal-copper', label: 'Confirmed' },
  processing:       { pill: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-400', label: 'Processing' },
  shipped:          { pill: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-400', label: 'Shipped' },
  out_for_delivery: { pill: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-400', label: 'Delivery' },
  delivered:        { pill: 'bg-bushal-successBg text-bushal-success border border-bushal-success/20', dot: 'bg-bushal-success', label: 'Delivered' },
  fulfilled:        { pill: 'bg-bushal-successBg text-bushal-success border border-bushal-success/20', dot: 'bg-bushal-success', label: 'Fulfilled' },
  pending:          { pill: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-400', label: 'Pending' },
  cancelled:        { pill: 'bg-bushal-dangerBg text-bushal-danger border border-bushal-danger/20', dot: 'bg-bushal-danger', label: 'Cancelled' },
}

function RecentOrdersTable({ orders }: { orders: any[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-bushal-forest">Recent Orders</h2>
          <p className="text-[11px] text-bushal-inkSoft mt-0.5">Latest {orders.length} transactions</p>
        </div>
        <Link href="/admin/orders"
          className="text-[11px] font-bold text-bushal-copper hover:text-bushal-copperLight flex items-center gap-1 group transition-colors">
          All orders
          <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-bushal-inkSoft">
          <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <p className="text-xs font-medium">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {orders.map((o, i) => {
            const status = o.status || 'order_placed'
            const cfg = statusCfg[status] || statusCfg.pending
            const isH = hovered === o.id

            return (
              <Link key={o.id} href={`/admin/orders/${o.id}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group',
                  isH ? 'bg-bushal-ivoryDeep' : 'hover:bg-bushal-ivoryDeep/60'
                )}
                onMouseEnter={() => setHovered(o.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-bushal-ink font-mono">
                    #{o.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-[10px] text-bushal-inkSoft mt-0.5 truncate">
                    {new Date(o.created_at).toLocaleDateString('en-BD', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {/* FIX: Gracefully handles missing customer data to ensure orders are always visible */}
                    {o.customer?.name && o.customer.name !== 'Guest' && (
                      <span className="ml-1.5 text-bushal-inkMid">· {o.customer.name}</span>
                    )}
                  </p>
                </div>

                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1', cfg.pill)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse-soft', cfg.dot)} />
                  {cfg.label}
                </span>

                <span className="text-xs font-extrabold text-bushal-forest flex-shrink-0 tabular-nums">
                  {formatPrice(o.total)}
                </span>

                <svg className={cn('w-3.5 h-3.5 text-bushal-inkSoft/40 flex-shrink-0 transition-transform duration-200', isH && 'translate-x-0.5 text-bushal-copper/60')}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Top Products Table ───────────────────────────────────────────────────────
function TopProductsTable({ products }: { products: any[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-bushal-forest">Top Stock Value</h2>
          <p className="text-[11px] text-bushal-inkSoft mt-0.5">By inventory worth</p>
        </div>
        <Link href="/admin/products"
          className="text-[11px] font-bold text-bushal-copper hover:text-bushal-copperLight flex items-center gap-1 group transition-colors">
          All products
          <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
        </Link>
      </div>

      <div className="space-y-1">
        {products.slice(0, 6).map((p, i) => {
          const stockVal = p.price * p.stock_quantity
          const img = p.images?.[0] || p.image_url

          return (
            <Link key={p.id} href={`/admin/products/${p.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bushal-ivoryDeep/60 transition-all duration-200 group">
              <span className="text-[10px] font-bold text-bushal-inkSoft/40 w-4 tabular-nums flex-shrink-0">{i + 1}</span>
              <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-bushal-ivoryDeep">
                {img ? (
                  <img src={img} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-bushal-inkSoft/30">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-bushal-ink truncate group-hover:text-bushal-forest transition-colors">{p.name}</p>
                <p className="text-[10px] text-bushal-inkSoft">{p.stock_quantity} units · {formatPrice(p.price)}</p>
              </div>
              <p className="text-[11px] font-bold text-bushal-forest tabular-nums flex-shrink-0">{formatPrice(stockVal)}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── Quick Action Button ──────────────────────────────────────────────────────
function QuickAction({ label, href, icon, color }: { label: string; href: string; icon: React.ReactNode; color: string }) {
  return (
    <Link href={href}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-bushal-border hover:border-transparent transition-all duration-300 group hover:shadow-md hover:-translate-y-0.5"
      style={{ '--hover-bg': color } as any}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}10`)}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
        style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <span className="text-[11px] font-bold text-bushal-ink group-hover:text-bushal-forest transition-colors">{label}</span>
      <svg className="w-3.5 h-3.5 text-bushal-inkSoft/30 ml-auto group-hover:translate-x-0.5 group-hover:text-bushal-copper/60 transition-all"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

// ─── Insight Row ─────────────────────────────────────────────────────────────
function InsightRow({
  label, value, note, positive, labelClass = "text-bushal-inkSoft", valueClass = "text-bushal-forest"
}: {
  label: string; value: string; note?: string; positive?: boolean
  labelClass?: string; valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0">
      <span className={cn("text-[11px] font-medium", labelClass)}>{label}</span>
      <div className="flex items-center gap-2">
        {note && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            positive
              ? "bg-white/10 text-emerald-300"
              : "bg-white/10 text-rose-300"
          )}>{note}</span>
        )}
        <span className={cn("text-xs font-extrabold tabular-nums", valueClass)}>{value}</span>
      </div>
    </div>
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function AdminOverviewClient({
  stats, dailyMetrics, orderPoints, orderSegments, catEntries,
  inventorySegments, topByValue, recentOrders,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const avgOrder = stats.orderCount > 0 ? stats.totalRevenue / stats.orderCount : 0
  const fulfillRate = stats.orderCount > 0 ? (stats.fulfilledOrdersCount / stats.orderCount) * 100 : 0
  const cancellRate = stats.orderCount > 0 ? (stats.cancelledOrders / stats.orderCount) * 100 : 0
  const stockHealthPct = stats.productCount > 0 ? (stats.healthyStock / stats.productCount) * 100 : 0

  const revSpark = dailyMetrics.map(d => d.revenue)
  const ordSpark = dailyMetrics.map(d => d.orders)

  return (
    <div className={cn('space-y-5 pb-12 transition-opacity duration-500', mounted ? 'opacity-100' : 'opacity-0')}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bushal-success animate-pulse" />
            <span className="text-[10px] font-bold text-bushal-success uppercase tracking-widest">Live · Bushal Admin</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-bushal-forest tracking-tight">Store Overview</h1>
          <p className="text-[11px] text-bushal-inkSoft mt-1">
            <span suppressHydrationWarning>
              {new Date().toLocaleDateString('en-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/products/new"
            className="inline-flex items-center gap-2 bg-bushal-forest text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </Link>
          <Link href="/admin/orders"
            className="inline-flex items-center gap-2 bg-bushal-copper text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            View Orders
          </Link>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Revenue" value={stats.totalRevenue} sub={`${stats.fulfilledOrdersCount} fulfilled orders`}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          accent="copper" delay={0} isPrice sparkData={revSpark}
          trend={{ value: 12, positive: true }}
        />
        <KPICard label="Total Orders" value={stats.orderCount} sub={`${stats.pendingOrders} pending`}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
          accent="blue" delay={80} sparkData={ordSpark}
          trend={{ value: 8, positive: true }}
        />
        <KPICard label="Products" value={stats.productCount} sub={`${stats.outOfStock} out of stock`}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          accent="violet" delay={160}
          trend={stats.outOfStock > 0 ? { value: stats.outOfStock, positive: false } : undefined}
        />
        <KPICard label="Customers" value={stats.userCount} sub="Registered accounts"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          accent="forest" delay={240}
          trend={{ value: 5, positive: true }}
        />
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────── */}
      <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
          <div>
            <h2 className="text-sm font-bold text-bushal-forest">Business Trends</h2>
            <p className="text-[11px] text-bushal-inkSoft mt-0.5">Last 7 days · Toggle series to compare</p>
          </div>
          <div className="flex items-center gap-3">
            <RevenueRing value={stats.totalRevenue} />
          </div>
        </div>
        <RevenueChart data={dailyMetrics} />
      </div>

      {/* ── Middle Row: Orders + Stock + Categories ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h2 className="text-sm font-bold text-bushal-forest mb-0.5">Order Status</h2>
          <p className="text-[11px] text-bushal-inkSoft mb-4">Hover to inspect</p>
          <DonutChart
            segments={orderSegments}
            size={144}
            centerLabel={`${stats.orderCount}`}
            centerSub="Total"
          />
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h2 className="text-sm font-bold text-bushal-forest mb-0.5">Inventory Health</h2>
          <p className="text-[11px] text-bushal-inkSoft mb-4">Stock status across all products</p>
          <StockGauge healthy={stats.healthyStock} low={stats.lowStock} out={stats.outOfStock} />
          {stats.outOfStock > 0 && (
            <Link href="/admin/products?filter=out_of_stock"
              className="mt-4 flex items-center gap-2 text-[11px] font-bold text-bushal-danger hover:text-bushal-danger/80 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-bushal-danger animate-pulse" />
              {stats.outOfStock} product{stats.outOfStock !== 1 ? 's' : ''} need restocking →
            </Link>
          )}
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h2 className="text-sm font-bold text-bushal-forest mb-0.5">By Category</h2>
          <p className="text-[11px] text-bushal-inkSoft mb-4">Product distribution</p>
          <HorizontalBarChart entries={catEntries} />
        </div>
      </div>

      {/* ── Bottom Row: Recent Orders + Top Products + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <RecentOrdersTable orders={recentOrders} />
        </div>

        <div className="lg:col-span-1 bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <TopProductsTable products={topByValue} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <h2 className="text-sm font-bold text-bushal-forest mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              <QuickAction label="Add New Product" href="/admin/products/new" color="#B87333"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>} />
              <QuickAction label="Manage Orders" href="/admin/orders" color="#1B3A2D"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
              <QuickAction label="Manage Products" href="/admin/products" color="#3B82F6"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-bushal-forest to-bushal-forestMid rounded-2xl p-5 text-white shadow-lg flex-1">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h2 className="text-xs font-bold uppercase tracking-wider text-bushal-copperGlow">Performance Insights</h2>
            </div>

            <InsightRow label="Avg Order Value" value={formatPrice(avgOrder)}
              labelClass="text-white/60" valueClass="text-white" />
            <InsightRow label="Fulfillment Rate" value={`${fulfillRate.toFixed(1)}%`}
              note={fulfillRate >= 80 ? '↑ Good' : '↓ Low'} positive={fulfillRate >= 80}
              labelClass="text-white/60" valueClass="text-white" />
            <InsightRow label="Cancellation Rate" value={`${cancellRate.toFixed(1)}%`}
              note={cancellRate <= 5 ? '↓ Low' : '↑ High'} positive={cancellRate <= 5}
              labelClass="text-white/60" valueClass="text-white" />
            <InsightRow label="Stock Health" value={`${stockHealthPct.toFixed(0)}%`}
              note={stockHealthPct >= 70 ? '↑ Healthy' : '↓ Attention'} positive={stockHealthPct >= 70}
              labelClass="text-white/60" valueClass="text-white" />
            <InsightRow label="Revenue / Product"
              value={formatPrice(stats.productCount > 0 ? stats.totalRevenue / stats.productCount : 0)}
              labelClass="text-white/60" valueClass="text-white" />
            <InsightRow label="Revenue / Customer"
              value={formatPrice(stats.userCount > 0 ? stats.totalRevenue / stats.userCount : 0)}
              labelClass="text-white/60" valueClass="text-white" />
          </div>
        </div>
      </div>
    </div>
  )
}
