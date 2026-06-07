// app/(admin)/admin/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import Link from 'next/link'

// ── Inline chart components (no external deps — pure CSS/SVG) ─────────────────

function MiniDonut({
  segments,
  size = 120,
}: {
  segments: { value: number; color: string; label: string }[]
  size?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  const r = 40
  const cx = 60
  const cy = 60
  const circumference = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.map((seg) => {
    const pct = seg.value / total
    const dash = pct * circumference
    const gap = circumference - dash
    const arc = { ...seg, dash, gap, offset, pct }
    offset += dash
    return arc
  })

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="rotate-[-90deg]">
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth="20"
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
          strokeLinecap="butt"
        />
      ))}
      <circle cx={cx} cy={cy} r="30" fill="white" />
    </svg>
  )
}

function BarChart({
  data,
  maxVal,
}: {
  data: { label: string; value: number; color: string }[]
  maxVal: number
}) {
  return (
    <div className="flex items-end gap-2 h-28 w-full">
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-700">{d.value}</span>
            <div className="w-full rounded-t-md transition-all duration-700 relative group" style={{ height: `${Math.max(pct, 4)}%`, background: d.color }}>
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {d.label}: {d.value}
              </div>
            </div>
            <span className="text-[9px] text-slate-400 text-center leading-tight">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function SparkLine({ points, color = '#ea580c' }: { points: number[]; color?: string }) {
  if (points.length < 2) return null
  const max = Math.max(...points, 1)
  const min = Math.min(...points)
  const range = max - min || 1
  const w = 100
  const h = 32
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const supabase = createServerClient()

  const [
    { count: productCount },
    { count: orderCount },
    { count: userCount },
    { data: products },
    { data: orders },
    { data: categories },
    { data: recentOrdersRaw },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('products')
      .select('id, name, price, stock_quantity, in_stock, discount_percent, images, image_url, category, created_at')
      .order('stock_quantity', { ascending: true })
      .limit(50),
    supabase
      .from('orders')
      .select('total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('categories').select('id, name, color').order('name'),
    supabase
      .from('orders')
      .select('id, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // ── Revenue metrics ──────────────────────────────────────────────────────────
  const fulfilledOrders = (orders ?? []).filter((o) => o.status === 'fulfilled')
  const totalRevenue    = fulfilledOrders.reduce((sum, o) => sum + Number(o.total), 0)
  const pendingOrders   = (orders ?? []).filter((o) => o.status === 'pending').length
  const cancelledOrders = (orders ?? []).filter((o) => o.status === 'cancelled').length

  // ── Stock metrics ────────────────────────────────────────────────────────────
  const outOfStock = (products ?? []).filter((p) => !p.in_stock).length
  const lowStock   = (products ?? []).filter((p) => p.in_stock && p.stock_quantity <= 5).length
  const healthyStock = (productCount ?? 0) - outOfStock - lowStock

  // ── Category breakdown ───────────────────────────────────────────────────────
  const catMap: Record<string, number> = {}
  for (const p of products ?? []) {
    const cat = p.category ?? 'General'
    catMap[cat] = (catMap[cat] ?? 0) + 1
  }
  const catColors = [
    '#ea580c', '#3b82f6', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ]
  const catEntries = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: catColors[i % catColors.length],
    }))

  // ── Revenue by day (last 7 days) ─────────────────────────────────────────────
  const revenueByDay: Record<string, number> = {}
  const dayLabels: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-BD', { weekday: 'short' })
    revenueByDay[key] = 0
    dayLabels.push(label)
  }
  for (const o of orders ?? []) {
    const day = o.created_at.slice(0, 10)
    if (day in revenueByDay && o.status === 'fulfilled') {
      revenueByDay[day] += Number(o.total)
    }
  }
  const revenuePoints = Object.values(revenueByDay)
  const revenueBarData = Object.entries(revenueByDay).map(([, v], i) => ({
    label: dayLabels[i],
    value: Math.round(v),
    color: v > 0 ? '#ea580c' : '#e2e8f0',
  }))
  const maxRevBar = Math.max(...revenueBarData.map((d) => d.value), 1)

  // ── Orders by day ────────────────────────────────────────────────────────────
  const ordersByDay: Record<string, number> = {}
  for (const key of Object.keys(revenueByDay)) ordersByDay[key] = 0
  for (const o of orders ?? []) {
    const day = o.created_at.slice(0, 10)
    if (day in ordersByDay) ordersByDay[day]++
  }
  const orderPoints = Object.values(ordersByDay)

  // ── Top products by stock value ──────────────────────────────────────────────
  const topByValue = [...(products ?? [])]
    .sort((a, b) => b.price * b.stock_quantity - a.price * a.stock_quantity)
    .slice(0, 8)

  const maxValue = Math.max(...topByValue.map((p) => p.price * p.stock_quantity), 1)

  // ── Inventory health donut segments ─────────────────────────────────────────
  const inventorySegments = [
    { value: healthyStock, color: '#10b981', label: 'Healthy' },
    { value: lowStock,     color: '#f59e0b', label: 'Low' },
    { value: outOfStock,   color: '#f43f5e', label: 'Out' },
  ]

  // ── Order status donut ───────────────────────────────────────────────────────
  const orderSegments = [
    { value: fulfilledOrders.length, color: '#10b981', label: 'Fulfilled' },
    { value: pendingOrders,          color: '#f59e0b', label: 'Pending' },
    { value: cancelledOrders,        color: '#f43f5e', label: 'Cancelled' },
  ]

  return (
    <div className="space-y-7 animate-fade-in-up pb-10">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Analytics Overview</h1>
          <p className="text-sm text-slate-400 mt-0.5">Real-time store performance · Bushal Admin</p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20 hover:-translate-y-0.5 active:scale-[0.97]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </Link>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Revenue',
            value: formatPrice(totalRevenue),
            sub: `${fulfilledOrders.length} fulfilled orders`,
            icon: '৳',
            iconBg: 'bg-violet-600',
            trend: revenuePoints,
            trendColor: '#7c3aed',
          },
          {
            label: 'Total Orders',
            value: orderCount ?? 0,
            sub: `${pendingOrders} pending`,
            icon: '📦',
            iconBg: 'bg-orange-500',
            trend: orderPoints,
            trendColor: '#ea580c',
          },
          {
            label: 'Products',
            value: productCount ?? 0,
            sub: `${outOfStock} out of stock`,
            icon: '🏷',
            iconBg: 'bg-blue-500',
            trend: null,
            trendColor: '#3b82f6',
          },
          {
            label: 'Customers',
            value: userCount ?? 0,
            sub: 'registered accounts',
            icon: '👤',
            iconBg: 'bg-emerald-500',
            trend: null,
            trendColor: '#10b981',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/60 transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center text-base shadow-md`}>
                {typeof stat.icon === 'string' && stat.icon.length <= 2 ? (
                  <span className="text-white font-bold text-sm">{stat.icon}</span>
                ) : (
                  <span>{stat.icon}</span>
                )}
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{stat.label}</p>
            {stat.trend && stat.trend.some((v) => v > 0) && (
              <div className="mt-3">
                <SparkLine points={stat.trend} color={stat.trendColor} />
              </div>
            )}
            {stat.sub && (
              <p className="text-[11px] text-slate-400 mt-1.5">{stat.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Revenue chart + Order status donut ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Revenue bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Revenue — Last 7 Days</h2>
              <p className="text-xs text-slate-400 mt-0.5">Fulfilled orders only · in BDT</p>
            </div>
            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
              {formatPrice(totalRevenue)}
            </span>
          </div>
          <div className="mt-6">
            <BarChart data={revenueBarData} maxVal={maxRevBar} />
          </div>
        </div>

        {/* Order status donut */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Order Status</h2>
          <p className="text-xs text-slate-400 mb-4">Last 200 orders</p>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <MiniDonut segments={orderSegments} size={100} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-extrabold text-slate-900">{(orders ?? []).length}</p>
                  <p className="text-[9px] text-slate-400">total</p>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {orderSegments.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-xs text-slate-600 font-medium">{s.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">{s.value}</span>
                  <span className="text-[10px] text-slate-400">
                    ({Math.round((s.value / ((orders ?? []).length || 1)) * 100)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Category pie + Inventory donut ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Category distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Products by Category</h2>
              <p className="text-xs text-slate-400">{productCount ?? 0} total products</p>
            </div>
            <Link href="/admin/categories" className="text-xs font-semibold text-orange-600 hover:underline">
              Manage →
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <MiniDonut segments={catEntries} size={120} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-extrabold text-slate-900">{catEntries.length}</p>
                  <p className="text-[9px] text-slate-400">categories</p>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 overflow-hidden">
              {catEntries.slice(0, 6).map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-xs text-slate-600 truncate flex-1">{c.label}</span>
                  <span className="text-xs font-bold text-slate-900 flex-shrink-0">{c.value}</span>
                  <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(c.value / (productCount || 1)) * 100}%`, background: c.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inventory health */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inventory Health</h2>
              <p className="text-xs text-slate-400">Stock status across all products</p>
            </div>
            <Link href="/admin/products" className="text-xs font-semibold text-orange-600 hover:underline">
              View all →
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <MiniDonut segments={inventorySegments} size={120} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-extrabold text-emerald-600">{healthyStock}</p>
                  <p className="text-[9px] text-slate-400">healthy</p>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {[
                { label: 'In Stock', count: healthyStock, color: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50', pct: (healthyStock / (productCount || 1)) * 100 },
                { label: 'Low Stock (≤5)', count: lowStock, color: 'bg-amber-400', textColor: 'text-amber-700', bg: 'bg-amber-50', pct: (lowStock / (productCount || 1)) * 100 },
                { label: 'Out of Stock', count: outOfStock, color: 'bg-rose-400', textColor: 'text-rose-700', bg: 'bg-rose-50', pct: (outOfStock / (productCount || 1)) * 100 },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${s.textColor}`}>{s.label}</span>
                    <span className={`text-xs font-bold ${s.textColor}`}>{s.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(outOfStock > 0 || lowStock > 0) && (
            <div className={`mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-medium ${outOfStock > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {outOfStock > 0
                ? `${outOfStock} product${outOfStock > 1 ? 's are' : ' is'} out of stock — hidden from customers.`
                : `${lowStock} product${lowStock > 1 ? 's are' : ' is'} running low (≤ 5 units).`}
            </div>
          )}
        </div>
      </div>

      {/* ── Top products by inventory value + Recent orders ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Top products by value */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Top Products — Inventory Value</h2>
              <p className="text-xs text-slate-400">price × stock quantity</p>
            </div>
            <Link href="/admin/products" className="text-xs font-semibold text-orange-600 hover:underline">
              Manage →
            </Link>
          </div>

          <div className="space-y-3">
            {topByValue.map((p, i) => {
              const val   = p.price * p.stock_quantity
              const pct   = (val / maxValue) * 100
              const cover = (Array.isArray(p.images) && p.images[0]) || p.image_url
              const isOut = p.stock_quantity === 0
              const isLow = p.stock_quantity > 0 && p.stock_quantity <= 5

              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-[11px] font-bold text-slate-400 text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100">
                    {cover ? (
                      <img src={cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-base">🏷</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800 truncate pr-2">{p.name}</span>
                      <span className="text-xs font-bold text-slate-900 flex-shrink-0">{formatPrice(val)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isOut ? 'bg-rose-400' : isLow ? 'bg-amber-400' : 'bg-orange-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isOut ? 'bg-rose-100 text-rose-600' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isOut ? 'Out of stock' : `${p.stock_quantity} units`}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatPrice(p.price)} each</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent orders + Quick actions */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Recent orders */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Recent Orders</h2>
              <Link href="/admin/orders" className="text-xs font-semibold text-orange-600 hover:underline">
                All orders →
              </Link>
            </div>
            <div className="space-y-3">
              {(recentOrdersRaw ?? []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No orders yet.</p>
              ) : (
                (recentOrdersRaw ?? []).map((o: any) => {
                  const statusColors: Record<string, string> = {
                    fulfilled: 'bg-emerald-100 text-emerald-700',
                    pending:   'bg-amber-100 text-amber-700',
                    cancelled: 'bg-rose-100 text-rose-600',
                    refunded:  'bg-slate-100 text-slate-600',
                  }
                  const label = o.status.charAt(0).toUpperCase() + o.status.slice(1)
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 font-mono truncate">
                          #{o.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(o.created_at).toLocaleDateString('en-BD', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColors[o.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {label}
                      </span>
                      <span className="text-xs font-bold text-slate-900 flex-shrink-0">{formatPrice(o.total)}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Add Product', href: '/admin/products/new', icon: '＋', color: 'bg-orange-500 text-white hover:bg-orange-600' },
                { label: 'Orders',      href: '/admin/orders',       icon: '📋', color: 'bg-emerald-500 text-white hover:bg-emerald-600' },
                { label: 'Products',   href: '/admin/products',      icon: '🏷',  color: 'bg-blue-500 text-white hover:bg-blue-600' },
                { label: 'Categories', href: '/admin/categories',    icon: '🗂',  color: 'bg-violet-500 text-white hover:bg-violet-600' },
              ].map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.97] shadow-sm ${a.color}`}
                >
                  <span className="text-base">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}