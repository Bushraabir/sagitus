'use client'
// app/components/profile/ProfileClient.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { formatDate } from '@/app/lib/utils/formatDate'
import { cn } from '@/app/lib/utils/cn'

interface Profile {
  id: string
  full_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  role: string
  created_at: string
}

interface Order {
  id: string
  total: number
  status: string
  delivery_status: string
  created_at: string
  order_items: any[]
}

interface Stats {
  totalOrders: number
  totalSpent: number
  pendingOrders: number
  deliveredOrders: number
}

const DELIVERY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  order_placed:    { label: 'Order Placed',     color: 'text-slate-700',   bg: 'bg-slate-100'   },
  confirmed:       { label: 'Confirmed',         color: 'text-blue-700',    bg: 'bg-blue-100'    },
  processing:      { label: 'Processing',        color: 'text-violet-700',  bg: 'bg-violet-100'  },
  shipped:         { label: 'Shipped',           color: 'text-amber-700',   bg: 'bg-amber-100'   },
  out_for_delivery:{ label: 'Out for Delivery',  color: 'text-orange-700',  bg: 'bg-orange-100'  },
  delivered:       { label: 'Delivered',         color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cancelled:       { label: 'Cancelled',         color: 'text-rose-700',    bg: 'bg-rose-100'    },
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  const colors: Record<string, string> = {
    orange: 'from-orange-50 to-orange-100/50 border-orange-200',
    blue:   'from-blue-50 to-blue-100/50 border-blue-200',
    green:  'from-emerald-50 to-emerald-100/50 border-emerald-200',
    violet: 'from-violet-50 to-violet-100/50 border-violet-200',
  }
  const textColors: Record<string, string> = {
    orange: 'text-orange-700',
    blue:   'text-blue-700',
    green:  'text-emerald-700',
    violet: 'text-violet-700',
  }
  return (
    <div className={cn('bg-gradient-to-br rounded-2xl border p-5 flex flex-col gap-1', colors[accent])}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('text-2xl font-extrabold tracking-tight', textColors[accent])}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export default function ProfileClient({ profile, orders, stats }: { profile: Profile | null; orders: Order[]; stats: Stats }) {
  const supabase = createBrowserClient()
  const router = useRouter()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim(), address: form.address.trim() })
      .eq('id', profile!.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setEditing(false)
    setTimeout(() => setSuccess(false), 3000)
    router.refresh()
  }

  const recentOrders = orders.slice(0, 5)
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-BD', { month: 'long', year: 'numeric' }) : ''

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
          <span className="text-2xl font-extrabold text-white">
            {(profile?.full_name ?? profile?.email ?? 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {profile?.full_name ?? 'My Profile'}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{profile?.email} · Member since {memberSince}</p>
          {profile?.address && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {profile.address}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Orders"    value={stats.totalOrders}              accent="blue"   />
        <StatCard label="Total Spent"     value={formatPrice(stats.totalSpent)}  accent="orange" sub="fulfilled orders" />
        <StatCard label="Delivered"       value={stats.deliveredOrders}          accent="green"  />
        <StatCard label="Pending"         value={stats.pendingOrders}            accent="violet" />
      </div>

      {/* Profile info card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Account Details</h2>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1.5 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setError('') }} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="text-xs font-semibold bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {success && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Profile updated successfully
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl">{error}</div>
        )}

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { label: 'Full Name', key: 'full_name', value: profile?.full_name, placeholder: 'Enter your name' },
            { label: 'Phone Number', key: 'phone', value: profile?.phone, placeholder: '+880 1XXX-XXXXXX' },
          ].map(({ label, key, value, placeholder }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
              {editing ? (
                <input
                  type="text"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
                />
              ) : (
                <p className="text-sm text-slate-800 font-medium">{value ?? <span className="text-slate-400">Not set</span>}</p>
              )}
            </div>
          ))}

          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Delivery Address</p>
            {editing ? (
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="House/flat, road, area, city, Bangladesh"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 resize-none"
              />
            ) : (
              <p className="text-sm text-slate-800 font-medium">{profile?.address ?? <span className="text-slate-400">No address saved</span>}</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</p>
            <p className="text-sm text-slate-800 font-medium">{profile?.email}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Contact support to change email</p>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Recent Orders</h2>
            <a href="/orders" className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">View all →</a>
          </div>
          <div className="divide-y divide-slate-50">
            {recentOrders.map((order) => {
              const ds = DELIVERY_LABELS[order.delivery_status] ?? DELIVERY_LABELS['order_placed']
              const itemCount = (order.order_items ?? []).reduce((s: number, i: any) => s + i.quantity, 0)
              return (
                <div key={order.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.created_at)} · {itemCount} item{itemCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', ds.bg, ds.color)}>{ds.label}</span>
                  <p className="text-sm font-bold text-slate-900 flex-shrink-0">{formatPrice(order.total)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Spending chart */}
      {orders.length > 0 && (
        <SpendingInsight orders={orders} />
      )}
    </main>
  )
}

function SpendingInsight({ orders }: { orders: Order[] }) {
  const last6Months: { label: string; spent: number; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-BD', { month: 'short' })
    const monthOrders = orders.filter((o) => o.created_at.startsWith(key) && o.status === 'fulfilled')
    last6Months.push({ label, spent: monthOrders.reduce((s, o) => s + Number(o.total), 0), count: monthOrders.length })
  }

  const maxSpent = Math.max(...last6Months.map((m) => m.spent), 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-sm font-bold text-slate-900 mb-1">Spending Overview</h2>
      <p className="text-[11px] text-slate-400 mb-5">Fulfilled orders · last 6 months</p>
      <div className="flex items-end gap-3 h-24">
        {last6Months.map((m, i) => {
          const pct = (m.spent / maxSpent) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
              <div className="relative w-full">
                <div className="w-full rounded-t-lg transition-all duration-700 cursor-default" style={{ height: `${Math.max(pct * 0.88, m.spent > 0 ? 6 : 2)}px`, background: m.spent > 0 ? '#ea580c' : '#e2e8f0' }} />
                {m.spent > 0 && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {formatPrice(m.spent)}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-slate-400">{m.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}