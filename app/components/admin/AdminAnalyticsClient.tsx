// app/components/admin/AdminAnalyticsClient.tsx
// Client-side analytics shell: tabbed navigation between Overview, Customers,
// Forecasting, and Retention. All heavy data arrives as props from the server
// component; this file owns tabs, animations, counters, and chart rendering.

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/app/lib/utils/cn'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import RFMMatrix, { type RFMData } from './analytics/RFMMatrix'
import CohortHeatmap, { type CohortRow } from './analytics/CohortHeatmap'
import PredictiveInsights, { type CLVData, type ForecastData } from './analytics/PredictiveInsights'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  totalRevenue: number
  totalCOGS: number
  totalDeliveryCharges: number
  totalProfit: number
  fulfilledOrdersCount: number
  pendingOrders: number
  cancelledOrders: number
  totalCustomers: number
  repeatCustomers: number
  avgOrderValue: number
  avgFulfillmentDays: number
  inventoryTurnover: number
  stockOutCost: number
  newCustomers30d: number
  soldIn30d: number
  productsAdded30d: number
  totalInventoryValue: number
  outOfStock: number
  lowStock: number
  onTimeDeliveryRate: number
  cancellationRate: number
}

interface DailyRevenue {
  date: string
  revenue: number
  orders: number
  profit: number
}

interface Forecast {
  nextMonthRevenue: number
  growthRate: number
  confidence: 'high' | 'medium' | 'low'
  trend: 'upward' | 'downward' | 'flat' | 'insufficient_data'
  slope: number
  monthlyData: { month: string; revenue: number }[]
}

interface RestockRec {
  id: string
  name: string
  price: number
  stock_quantity: number
  image_url?: string | null
  images?: string[] | null
  sold_30d: number
  days_until_stockout: number
  revenue_30d: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  recommended_restock: number
}

interface CategoryTrend {
  category: string
  currentRevenue: number
  previousRevenue: number
  growthRate: number
  units: number
  trend: 'up' | 'down' | 'stable'
}

interface CustomerInsights {
  totalCustomers: number
  activeCustomers30d: number
  newCustomers30d: number
  repeatCustomerRate: number
  avgLifetimeValue: number
  avgOrdersPerCustomer: number
  topSpender: { name: string; email: string; totalSpent: number; orderCount: number } | null
}

interface Props {
  summary: Summary
  dailyRevenue: DailyRevenue[]
  forecast: Forecast
  restockRecommendations: RestockRec[]
  categoryTrends: CategoryTrend[]
  customerInsights: CustomerInsights
  rfmData: RFMData | null
  cohortData: CohortRow[] | null
  clvData: CLVData | null
  advancedForecast: ForecastData | null
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1200, delay = 0): number {
  const [val, setVal] = useState(0)
  const rafRef = useRef<number>(0)
  const t0 = useRef<number | null>(null)
  const started = useRef(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      started.current = false
      t0.current = null
      const step = (ts: number) => {
        if (!t0.current) t0.current = ts
        const p = Math.min((ts - t0.current) / duration, 1)
        const e = 1 - Math.pow(1 - p, 4) // ease-out quart
        setVal(target * e)
        if (p < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    }, delay)

    return () => {
      clearTimeout(timeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  return val
}

// ─── Intersection observer hook ───────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return { ref, inView }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({
  label, value, prefix = '', suffix = '', sub, trendPct, icon, accentClass, delay = 0,
}: {
  label: string
  value: number
  prefix?: string
  suffix?: string
  sub?: string
  trendPct?: number
  icon: React.ReactNode
  accentClass: string
  delay?: number
}) {
  const { ref, inView } = useInView()
  const animated = useCounter(value, 1400, inView ? delay : 99999)
  const [hovered, setHovered] = useState(false)

  const fmt = (v: number) => {
    if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(2)}M${suffix}`
    if (v >= 1_000)     return `${prefix}${Math.round(v).toLocaleString()}${suffix}`
    if (v % 1 !== 0)    return `${prefix}${v.toFixed(1)}${suffix}`
    return `${prefix}${Math.round(v)}${suffix}`
  }

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative rounded-2xl border bg-bushal-surface p-5 overflow-hidden',
        'transition-all duration-500 ease-out cursor-default select-none',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        hovered ? 'shadow-cardHover -translate-y-1 border-bushal-borderMid' : 'shadow-card border-bushal-border',
      )}
      style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
    >
      {/* Subtle top accent line */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-0.5 transition-all duration-300 rounded-t-2xl',
        accentClass.includes('copper') ? 'bg-bushal-copper/40' : 'bg-bushal-forest/30',
        hovered ? 'opacity-100' : 'opacity-0'
      )} />

      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center',
          'transition-transform duration-300',
          accentClass,
          hovered ? 'scale-110' : 'scale-100'
        )}>
          {icon}
        </div>
        {trendPct !== undefined && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full transition-all duration-300',
            trendPct >= 0
              ? 'bg-bushal-successBg text-bushal-success'
              : 'bg-bushal-dangerBg text-bushal-danger',
            hovered ? 'scale-105' : 'scale-100'
          )}>
            {trendPct >= 0 ? '↑' : '↓'} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-bushal-forest tabular-nums tracking-tight font-heading">
        {fmt(animated)}
      </p>
      <p className="text-xs text-bushal-inkSoft mt-1 font-medium">{label}</p>
      {sub && (
        <p className="text-[11px] text-bushal-inkSoft/60 mt-1.5 leading-snug">{sub}</p>
      )}
    </div>
  )
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: DailyRevenue[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { ref, inView } = useInView()
  const maxRev = Math.max(...data.map(d => d.revenue), 1)
  const maxProfit = Math.max(...data.map(d => d.profit), 1)
  const combined = Math.max(maxRev, 1)

  const totalRev = data.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = data.reduce((s, d) => s + d.orders, 0)

  return (
    <div ref={ref} className="rounded-2xl border border-bushal-border bg-bushal-surface p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-bushal-forest">Revenue · Last 30 Days</h3>
          <p className="text-[11px] text-bushal-inkSoft mt-0.5">Fulfilled orders only</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-bushal-inkSoft">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bushal-copper/80" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bushal-forest/70" />
            Profit
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bushal-copper/6 rounded-xl px-3 py-2.5">
          <p className="text-xs font-bold text-bushal-copper tabular-nums">{formatPrice(totalRev)}</p>
          <p className="text-[10px] text-bushal-inkSoft">30-day revenue</p>
        </div>
        <div className="bg-bushal-forest/6 rounded-xl px-3 py-2.5">
          <p className="text-xs font-bold text-bushal-forest tabular-nums">{totalOrders}</p>
          <p className="text-[10px] text-bushal-inkSoft">total orders</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-px h-36 w-full">
        {data.map((d, i) => {
          const revH  = Math.max((d.revenue / combined) * 100, d.revenue > 0 ? 3 : 0)
          const profH = Math.max((d.profit  / combined) * 100, 0)
          const isH   = hovered === i
          const animDelay = inView ? i * 18 : 0

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-px cursor-default relative group"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isH && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-bushal-forest text-white text-[10px] px-2.5 py-1.5 rounded-lg whitespace-nowrap z-20 pointer-events-none shadow-lg animate-scale-in">
                  <p className="font-bold">{new Date(d.date).toLocaleDateString('en-BD', { month: 'short', day: 'numeric' })}</p>
                  <p>{formatPrice(d.revenue)} · {d.orders} orders</p>
                </div>
              )}

              <div className="w-full flex items-end gap-px h-full">
                <div
                  className={cn(
                    'flex-1 rounded-t-sm transition-all duration-200',
                    isH ? 'bg-bushal-copper' : 'bg-bushal-copper/55',
                  )}
                  style={{
                    height: inView ? `${revH}%` : '0%',
                    transitionDelay: `${animDelay}ms`,
                    transitionProperty: 'height, background-color',
                    transitionDuration: isH ? '150ms' : `600ms, 150ms`,
                  }}
                />
                <div
                  className={cn(
                    'flex-1 rounded-t-sm transition-all duration-200',
                    isH ? 'bg-bushal-forest' : 'bg-bushal-forest/45',
                  )}
                  style={{
                    height: inView ? `${profH}%` : '0%',
                    transitionDelay: `${animDelay + 60}ms`,
                    transitionProperty: 'height, background-color',
                    transitionDuration: isH ? '150ms' : `600ms, 150ms`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-between mt-2 text-[9px] text-bushal-inkSoft">
        <span>{data[0]?.date ? new Date(data[0].date).toLocaleDateString('en-BD', { month: 'short', day: 'numeric' }) : ''}</span>
        <span>{data[data.length - 1]?.date ? new Date(data[data.length - 1].date).toLocaleDateString('en-BD', { month: 'short', day: 'numeric' }) : ''}</span>
      </div>
    </div>
  )
}

// ─── Category Panel ───────────────────────────────────────────────────────────
function CategoryPanel({ trends }: { trends: CategoryTrend[] }) {
  const { ref, inView } = useInView()
  const maxRev = Math.max(...(trends ?? []).map(t => t.currentRevenue), 1)

  return (
    <div ref={ref} className="rounded-2xl border border-bushal-border bg-bushal-surface p-6">
      <h3 className="text-sm font-bold text-bushal-forest mb-5">Category Performance</h3>
      <div className="space-y-3">
        {(trends ?? []).slice(0, 6).map((t, i) => {
          const pos  = t.growthRate > 0
          const neg  = t.growthRate < 0
          const pct  = ((t.currentRevenue / maxRev) * 100).toFixed(0)

          return (
            <div
              key={t.category}
              className={cn(
                'group hover:bg-bushal-ivoryDeep/40 rounded-xl p-2 -mx-2 transition-all duration-300 cursor-default',
                'opacity-0 translate-x-2',
                inView && 'opacity-100 translate-x-0'
              )}
              style={{ transitionDelay: inView ? `${i * 60}ms` : '0ms', transitionProperty: 'opacity, transform, background-color' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-bushal-ink">{t.category}</span>
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-all duration-200 group-hover:scale-105',
                    pos ? 'bg-bushal-successBg text-bushal-success'
                       : neg ? 'bg-bushal-dangerBg text-bushal-danger'
                       : 'bg-bushal-ivoryDeep text-bushal-inkSoft'
                  )}>
                    {pos ? '↑' : neg ? '↓' : '→'} {Math.abs(t.growthRate)}%
                  </span>
                </div>
                <span className="text-xs font-bold text-bushal-ink tabular-nums">
                  {formatPrice(t.currentRevenue)}
                </span>
              </div>

              <div className="h-1.5 bg-bushal-ivoryDeep rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all ease-out',
                    pos ? 'bg-bushal-forest' : neg ? 'bg-bushal-danger/70' : 'bg-bushal-inkSoft/40'
                  )}
                  style={{
                    width: inView ? `${pct}%` : '0%',
                    transitionDuration: '700ms',
                    transitionDelay: `${i * 60 + 100}ms`,
                  }}
                />
              </div>

              <p className="text-[10px] text-bushal-inkSoft mt-1">{t.units} units</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Restock Panel ────────────────────────────────────────────────────────────
function RestockPanel({ recs }: { recs: RestockRec[] }) {
  const { ref, inView } = useInView()
  const urgencyMap = {
    critical: { text: 'text-bushal-danger',  bg: 'bg-bushal-dangerBg',   dot: 'bg-bushal-danger',  label: 'Critical' },
    high:     { text: 'text-bushal-copper',  bg: 'bg-bushal-copperMuted', dot: 'bg-bushal-copper',  label: 'High' },
    medium:   { text: 'text-bushal-warning', bg: 'bg-bushal-warningBg',   dot: 'bg-bushal-warning', label: 'Medium' },
    low:      { text: 'text-bushal-inkSoft', bg: 'bg-bushal-ivoryDeep',   dot: 'bg-bushal-inkSoft', label: 'Low' },
  }

  return (
    <div ref={ref} className="rounded-2xl border border-bushal-border bg-bushal-surface p-6">
      <h3 className="text-sm font-bold text-bushal-forest mb-5">Restock Alerts</h3>

      {(!recs || recs.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-bushal-successBg flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-bushal-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-bushal-forest">All stocked up</p>
          <p className="text-xs text-bushal-inkSoft mt-1">Every product has healthy inventory.</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto no-scrollbar">
          {recs.map((r, i) => {
            const u   = urgencyMap[r.urgency] ?? urgencyMap.low
            const img = r.images?.[0] ?? r.image_url

            return (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl',
                  'bg-bushal-ivoryDeep/40 hover:bg-bushal-ivoryDeep',
                  'transition-all duration-300 cursor-default group',
                  'opacity-0 translate-y-2',
                  inView && 'opacity-100 translate-y-0'
                )}
                style={{ transitionDelay: inView ? `${i * 50}ms` : '0ms', transitionProperty: 'opacity, transform, background-color' }}
              >
                {img ? (
                  <img src={img} alt={r.name} className="w-10 h-10 rounded-lg object-cover shrink-0 transition-transform duration-200 group-hover:scale-105" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-bushal-ivoryDeep flex items-center justify-center shrink-0 text-bushal-inkSoft text-xs font-bold border border-bushal-border">
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-bushal-ink truncate">{r.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('flex items-center gap-1 text-[10px] font-bold')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', u.dot)} />
                      <span className={u.text}>{u.label}</span>
                    </span>
                    <span className="text-[10px] text-bushal-inkSoft">{r.days_until_stockout}d left</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-bushal-copper tabular-nums">{r.recommended_restock} units</p>
                  <p className="text-[10px] text-bushal-inkSoft">to restock</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Operational Panel ────────────────────────────────────────────────────────
function OperationalPanel({ summary }: { summary: Summary }) {
  const { ref, inView } = useInView()
  const fulfillment = useCounter(summary.avgFulfillmentDays ?? 0, 1400, inView ? 100 : 99999)
  const onTime      = useCounter(summary.onTimeDeliveryRate  ?? 0, 1400, inView ? 200 : 99999)
  const turnover    = useCounter(summary.inventoryTurnover   ?? 0, 1400, inView ? 300 : 99999)

  const metrics = [
    {
      label: 'Fulfillment Speed',
      value: fulfillment,
      display: `${fulfillment.toFixed(1)}d`,
      max: 7,
      colour: fulfillment < 2 ? 'bg-bushal-success' : fulfillment < 4 ? 'bg-bushal-forestMid' : 'bg-bushal-danger',
      note: fulfillment < 2 ? 'Excellent' : fulfillment < 4 ? 'Good pace' : 'Needs attention',
    },
    {
      label: 'On-Time Rate',
      value: onTime,
      display: `${onTime.toFixed(1)}%`,
      max: 100,
      colour: onTime >= 90 ? 'bg-bushal-success' : onTime >= 70 ? 'bg-bushal-copper' : 'bg-bushal-danger',
      note: `${onTime.toFixed(1)}% of orders on time`,
    },
    {
      label: 'Inventory Turnover',
      value: turnover,
      display: `${turnover.toFixed(2)}×`,
      max: 10,
      colour: 'bg-bushal-copper',
      note: 'Per quarter',
    },
  ]

  return (
    <div ref={ref} className="rounded-2xl border border-bushal-border bg-bushal-surface p-6">
      <h3 className="text-sm font-bold text-bushal-forest mb-5">Operational Efficiency</h3>

      <div className="space-y-5">
        {metrics.map((m, i) => (
          <div key={m.label} className={cn('opacity-0 transition-all duration-500', inView && 'opacity-100')} style={{ transitionDelay: `${i * 80}ms` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-bushal-inkSoft">{m.label}</span>
              <span className="text-xs font-bold text-bushal-forest tabular-nums">{m.display}</span>
            </div>
            <div className="h-2 bg-bushal-ivoryDeep rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all ease-out', m.colour)}
                style={{
                  width: inView ? `${Math.min((m.value / m.max) * 100, 100)}%` : '0%',
                  transitionDuration: '900ms',
                  transitionDelay: `${i * 80 + 200}ms`,
                }}
              />
            </div>
            <p className="text-[10px] text-bushal-inkSoft mt-1">{m.note}</p>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className={cn('rounded-xl p-3 transition-all duration-500 opacity-0', inView && 'opacity-100', 'bg-bushal-dangerBg')} style={{ transitionDelay: '350ms' }}>
            <p className="text-[10px] text-bushal-inkSoft">Stock-out cost</p>
            <p className="text-sm font-bold text-bushal-danger tabular-nums">{formatPrice(summary.stockOutCost)}</p>
            <p className="text-[9px] text-bushal-inkSoft/70">Est. monthly loss</p>
          </div>
          <div className={cn('rounded-xl p-3 transition-all duration-500 opacity-0', inView && 'opacity-100', 'bg-bushal-copperMuted')} style={{ transitionDelay: '420ms' }}>
            <p className="text-[10px] text-bushal-inkSoft">Cancellation rate</p>
            <p className="text-sm font-bold text-bushal-copper tabular-nums">{summary.cancellationRate}%</p>
            <p className="text-[9px] text-bushal-inkSoft/70">Of all orders</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Customer KPI strip ───────────────────────────────────────────────────────
function CustomerSummary({ insights }: { insights: CustomerInsights }) {
  const { ref, inView } = useInView()

  const cards = [
    {
      label: 'Total customers',
      value: insights.totalCustomers,
      accentClass: 'bg-bushal-forest/10 text-bushal-forest',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      label: 'Active this month',
      value: insights.activeCustomers30d,
      accentClass: 'bg-bushal-copper/10 text-bushal-copper',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      label: 'Repeat rate',
      value: insights.repeatCustomerRate,
      suffix: '%',
      accentClass: 'bg-bushal-forestMid/10 text-bushal-forestMid',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      label: 'Avg lifetime value',
      value: insights.avgLifetimeValue,
      prefix: '৳',
      accentClass: 'bg-bushal-copperLight/10 text-bushal-copperLight',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
    },
  ]

  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <KPICard
          key={c.label}
          label={c.label}
          value={c.value}
          prefix={c.prefix}
          suffix={c.suffix}
          accentClass={c.accentClass}
          icon={c.icon}
          delay={i * 70}
        />
      ))}
    </div>
  )
}

// ─── Forecast card ────────────────────────────────────────────────────────────
function LinearForecastCard({ forecast }: { forecast: Forecast }) {
  const { ref, inView } = useInView()
  const animated = useCounter(forecast.nextMonthRevenue, 1600, inView ? 200 : 99999)

  const trendStyle = {
    upward:            { bg: 'bg-bushal-successBg',  text: 'text-bushal-success',  label: '↑ Upward' },
    downward:          { bg: 'bg-bushal-dangerBg',   text: 'text-bushal-danger',   label: '↓ Downward' },
    flat:              { bg: 'bg-bushal-ivoryDeep',  text: 'text-bushal-inkSoft',  label: '→ Flat' },
    insufficient_data: { bg: 'bg-bushal-ivoryDeep',  text: 'text-bushal-inkSoft',  label: '— Insufficient data' },
  }
  const ts = trendStyle[forecast.trend] ?? trendStyle.flat

  return (
    <div ref={ref} className="rounded-2xl border border-bushal-border bg-bushal-surface p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-bushal-forest">Linear Regression Forecast</h3>
          <p className="text-[11px] text-bushal-inkSoft mt-0.5">6-month trend · {forecast.confidence} confidence</p>
        </div>
        <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full', ts.bg, ts.text)}>
          {ts.label}
        </span>
      </div>

      <p className={cn('text-4xl font-bold font-heading tabular-nums transition-all duration-700', inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3', 'text-bushal-forest')}>
        {formatPrice(Math.round(animated))}
      </p>
      <p className="text-xs text-bushal-inkSoft mt-1.5">Projected next-month revenue</p>

      {forecast.monthlyData?.length > 0 && (
        <div className="mt-5 space-y-1.5">
          {forecast.monthlyData.slice(-4).map((m, i) => {
            const maxM = Math.max(...forecast.monthlyData.map(x => x.revenue), 1)
            const pct  = ((m.revenue / maxM) * 100).toFixed(0)
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[10px] text-bushal-inkSoft w-14 shrink-0">{m.month}</span>
                <div className="flex-1 h-1.5 bg-bushal-ivoryDeep rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bushal-forestMid rounded-full transition-all ease-out"
                    style={{ width: inView ? `${pct}%` : '0%', transitionDuration: '700ms', transitionDelay: `${i * 80 + 400}ms` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-bushal-ink tabular-nums w-20 text-right shrink-0">
                  {formatPrice(m.revenue)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-bushal-border bg-bushal-surface p-10 text-center">
      <div className="w-10 h-10 rounded-xl bg-bushal-ivoryDeep flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-bushal-inkSoft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V8l-5-5H5a2 2 0 00-2 2v13a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-bushal-forest">{message}</p>
      {sub && <p className="text-xs text-bushal-inkSoft mt-1">{sub}</p>}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',    icon: '◫' },
  { id: 'customers',  label: 'Customers',   icon: '◎' },
  { id: 'forecasting', label: 'Forecasting', icon: '◈' },
  { id: 'retention',  label: 'Retention',   icon: '◉' },
] as const

type TabId = typeof TABS[number]['id']

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AdminAnalyticsClient({
  summary,
  dailyRevenue,
  forecast,
  restockRecommendations,
  categoryTrends,
  customerInsights,
  rfmData,
  cohortData,
  clvData,
  advancedForecast,
}: Props) {
  const [tab, setTab]       = useState<TabId>('overview')
  const [mounted, setMounted] = useState(false)
  const [prevTab, setPrevTab] = useState<TabId>('overview')
  const contentKey = useRef(0)

  useEffect(() => { setMounted(true) }, [])

  const handleTabChange = useCallback((id: TabId) => {
    if (id === tab) return
    setPrevTab(tab)
    contentKey.current++
    setTab(id)
  }, [tab])

  const profitMargin = summary.totalRevenue > 0
    ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)
    : '0'

  const overviewKPIs = [
    {
      label: 'Total revenue',
      value: summary.totalRevenue,
      prefix: '৳',
      sub: `${summary.fulfilledOrdersCount} orders fulfilled`,
      accentClass: 'bg-bushal-copper/10 text-bushal-copper',
      trendPct: forecast.growthRate,
      delay: 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Net profit',
      value: summary.totalProfit,
      prefix: '৳',
      sub: `${profitMargin}% margin`,
      accentClass: 'bg-bushal-forest/10 text-bushal-forest',
      delay: 80,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: 'Avg order value',
      value: summary.avgOrderValue,
      prefix: '৳',
      accentClass: 'bg-bushal-copperLight/10 text-bushal-copperLight',
      delay: 160,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Customers',
      value: summary.totalCustomers,
      sub: `${summary.newCustomers30d} new this month`,
      accentClass: 'bg-bushal-forestLight/10 text-bushal-forestLight',
      delay: 240,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className={cn(
      'space-y-6 pb-12 transition-opacity duration-500',
      mounted ? 'opacity-100' : 'opacity-0'
    )}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-end justify-between transition-all duration-700',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
      )}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-bushal-inkSoft/60 mb-1">
            Bushal Admin
          </p>
          <h1 className="text-2xl font-bold text-bushal-forest tracking-tight font-heading">
            Analytics
          </h1>
          <p className="text-xs text-bushal-inkSoft mt-1">
            <span suppressHydrationWarning>
              {new Date().toLocaleDateString('en-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </p>
        </div>

        {/* Profit margin pill */}
        <div className="rounded-2xl bg-bushal-forest px-5 py-3 text-right shadow-lg shadow-bushal-forest/20 hover:shadow-bushal-forest/30 transition-shadow duration-300">
          <p className="text-[9px] font-bold uppercase tracking-widest text-bushal-copperGlow/80 mb-0.5">Margin</p>
          <p className="text-2xl font-bold text-white tabular-nums font-heading">{profitMargin}%</p>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className={cn(
        'flex gap-1 p-1 bg-bushal-ivoryDeep rounded-2xl border border-bushal-border',
        'transition-all duration-700',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm font-semibold',
              'transition-all duration-250 active:scale-[0.97]',
              tab === t.id
                ? 'bg-bushal-surface text-bushal-forest shadow-card border border-bushal-border'
                : 'text-bushal-inkSoft hover:text-bushal-ink hover:bg-bushal-surface/60'
            )}
          >
            <span className="hidden sm:inline text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div key={`${tab}-${contentKey.current}`} className="animate-fade-in space-y-6">

        {/* Overview ──────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {overviewKPIs.map(k => (
                <KPICard key={k.label} {...k} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RevenueChart data={dailyRevenue} />
              </div>
              <OperationalPanel summary={summary} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CategoryPanel trends={categoryTrends} />
              <RestockPanel recs={restockRecommendations} />
            </div>
          </>
        )}

        {/* Customers ─────────────────────────────────────────────────────── */}
        {tab === 'customers' && (
          <>
            <CustomerSummary insights={customerInsights} />
            {rfmData ? (
              <RFMMatrix data={rfmData} />
            ) : (
              <EmptyState
                message="RFM data not available"
                sub="Run migration 013 to enable customer segmentation."
              />
            )}
          </>
        )}

        {/* Forecasting ────────────────────────────────────────────────────── */}
        {tab === 'forecasting' && (
          <>
            {clvData && advancedForecast ? (
              <PredictiveInsights clvData={clvData} forecastData={advancedForecast} />
            ) : (
              <EmptyState
                message="Predictive models not available"
                sub="Run migration 013 to enable CLV and demand forecasting."
              />
            )}
            <LinearForecastCard forecast={forecast} />
          </>
        )}

        {/* Retention ──────────────────────────────────────────────────────── */}
        {tab === 'retention' && (
          cohortData ? (
            <CohortHeatmap data={cohortData} />
          ) : (
            <EmptyState
              message="Cohort data not available"
              sub="Run migration 013 to enable retention analysis."
            />
          )
        )}
      </div>
    </div>
  )
}