'use client'
// app/components/admin/AdminAnalyticsClient.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'

interface Summary {
  totalRevenue: number
  totalCOGS: number
  totalDeliveryCharges: number
  totalExtraCosts: number
  totalProfit: number
  productsAdded30d: number
  soldIn30d: number
  recentProfit30d: number
  totalInventoryValue: number
  fulfilledOrdersCount: number
}

interface MonthlyPoint {
  label: string
  revenue: number
  cost: number
  profit: number
}

interface Product {
  id: string
  name: string
  cost_price?: number
  delivery_charge?: number
  price: number
}

interface Expense {
  id: string
  product_id?: string | null
  label: string
  amount: number
  created_at: string
}

interface Props {
  summary: Summary
  monthlyData: MonthlyPoint[]
  products: Product[]
  expenses: Expense[]
}

function KPICard({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent: string; icon: React.ReactNode }) {
  const styles: Record<string, string> = {
    green:  'from-emerald-50 to-emerald-100/60 border-emerald-200',
    orange: 'from-orange-50 to-orange-100/60 border-orange-200',
    rose:   'from-rose-50 to-rose-100/60 border-rose-200',
    blue:   'from-blue-50 to-blue-100/60 border-blue-200',
    violet: 'from-violet-50 to-violet-100/60 border-violet-200',
    amber:  'from-amber-50 to-amber-100/60 border-amber-200',
    cyan:   'from-cyan-50 to-cyan-100/60 border-cyan-200',
    slate:  'from-slate-50 to-slate-100/60 border-slate-200',
  }
  const textStyles: Record<string, string> = {
    green:  'text-emerald-700',
    orange: 'text-orange-700',
    rose:   'text-rose-600',
    blue:   'text-blue-700',
    violet: 'text-violet-700',
    amber:  'text-amber-700',
    cyan:   'text-cyan-700',
    slate:  'text-slate-700',
  }
  return (
    <div className={cn('bg-gradient-to-br rounded-2xl border p-5 flex flex-col gap-3', styles[accent])}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{label}</p>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center opacity-70', `bg-${accent}-200/50`)}>
          {icon}
        </div>
      </div>
      <div>
        <p className={cn('text-2xl font-extrabold tracking-tight', textStyles[accent])}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ProfitChart({ data }: { data: MonthlyPoint[] }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.profit, 1)), 1)
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Revenue vs Profit</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Last 6 months · fulfilled orders</p>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-blue-500 inline-block" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" />Profit</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-rose-400 inline-block" />Cost</span>
        </div>
      </div>
      <div className="flex items-end gap-2 h-40 relative">
        {data.map((d, i) => {
          const revH = Math.max((d.revenue / maxVal) * 100, d.revenue > 0 ? 4 : 1)
          const profH = Math.max((Math.max(d.profit, 0) / maxVal) * 100, d.profit > 0 ? 4 : 1)
          const costH = Math.max((d.cost / maxVal) * 100, d.cost > 0 ? 4 : 1)
          return (
            <div key={i} className="flex-1 flex gap-0.5 items-end cursor-default" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t-md bg-blue-400 transition-all duration-500 relative group" style={{ height: `${revH}%` }}>
                  {hovered === i && d.revenue > 0 && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                      Rev: {formatPrice(d.revenue)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t-md bg-rose-400 transition-all duration-500 relative" style={{ height: `${costH}%` }}>
                  {hovered === i && d.cost > 0 && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                      Cost: {formatPrice(d.cost)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className={cn('w-full rounded-t-md transition-all duration-500 relative', d.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500')} style={{ height: `${profH}%` }}>
                  {hovered === i && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                      Profit: {formatPrice(d.profit)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 mt-3">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-slate-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddExpenseModal({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ label: '', amount: '', product_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.label.trim() || !form.amount) { setError('Label and amount are required'); return }
    setSaving(true)
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: form.label.trim(), amount: parseFloat(form.amount), product_id: form.product_id || null }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Add Expense</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Expense Label *</label>
            <input type="text" placeholder="e.g. Packaging cost, Marketing, Shipping fee"
              value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Amount (৳) *</label>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Related Product (optional)</label>
            <select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15">
              <option value="">General expense (all products)</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminAnalyticsClient({ summary, monthlyData, products, expenses }: Props) {
  const router = useRouter()
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<string | null>(null)

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    setDeletingExpense(id)
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    setDeletingExpense(null)
    router.refresh()
  }

  const margin = summary.totalRevenue > 0 ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-7 animate-fade-in-up pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Profit Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Revenue, costs, and net profit · all-time</p>
        </div>
        <button
          onClick={() => setShowExpenseModal(true)}
          className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20 hover:-translate-y-0.5 active:scale-[0.97]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total Revenue"
          value={formatPrice(summary.totalRevenue)}
          sub={`${summary.fulfilledOrdersCount} fulfilled orders`}
          accent="blue"
          icon={<svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard
          label="Product Cost (COGS)"
          value={formatPrice(summary.totalCOGS)}
          sub="cost price × qty sold"
          accent="rose"
          icon={<svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
        />
        <KPICard
          label="Delivery Charges"
          value={formatPrice(summary.totalDeliveryCharges)}
          sub="delivery cost × qty sold"
          accent="amber"
          icon={<svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" /></svg>}
        />
        <KPICard
          label="Extra Expenses"
          value={formatPrice(summary.totalExtraCosts)}
          sub={`${expenses.length} expense entries`}
          accent="violet"
          icon={<svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
        />
        <KPICard
          label="Net Profit"
          value={formatPrice(summary.totalProfit)}
          sub={`${margin}% margin`}
          accent={summary.totalProfit >= 0 ? 'green' : 'rose'}
          icon={<svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <KPICard
          label="Products Added (30d)"
          value={String(summary.productsAdded30d)}
          sub="new inventory items"
          accent="cyan"
          icon={<svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
        />
        <KPICard
          label="Units Sold (30d)"
          value={String(summary.soldIn30d)}
          sub="from fulfilled orders"
          accent="orange"
          icon={<svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
        />
        <KPICard
          label="Profit (30d)"
          value={formatPrice(summary.recentProfit30d)}
          sub="last 30 days"
          accent={summary.recentProfit30d >= 0 ? 'green' : 'rose'}
          icon={<svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
      </div>

      {/* Profit breakdown bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Profit Breakdown</h3>
        <div className="space-y-3">
          {[
            { label: 'Revenue',         value: summary.totalRevenue,          color: 'bg-blue-500',   pct: 100 },
            { label: 'Product Costs',   value: summary.totalCOGS,            color: 'bg-rose-400',   pct: summary.totalRevenue > 0 ? (summary.totalCOGS / summary.totalRevenue) * 100 : 0 },
            { label: 'Delivery',        value: summary.totalDeliveryCharges,  color: 'bg-amber-400',  pct: summary.totalRevenue > 0 ? (summary.totalDeliveryCharges / summary.totalRevenue) * 100 : 0 },
            { label: 'Extra Expenses',  value: summary.totalExtraCosts,       color: 'bg-violet-400', pct: summary.totalRevenue > 0 ? (summary.totalExtraCosts / summary.totalRevenue) * 100 : 0 },
            { label: 'Net Profit',      value: summary.totalProfit,           color: summary.totalProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500', pct: summary.totalRevenue > 0 ? Math.abs(summary.totalProfit / summary.totalRevenue) * 100 : 0 },
          ].map(({ label, value, color, pct }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-28 flex-shrink-0">{label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-800 w-24 text-right flex-shrink-0">{formatPrice(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Chart */}
      <ProfitChart data={monthlyData} />

      {/* Expenses list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Extra Expenses</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Additional costs beyond product and delivery charges</p>
          </div>
          <button onClick={() => setShowExpenseModal(true)} className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
        {expenses.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-slate-400">No extra expenses recorded yet.</p>
            <button onClick={() => setShowExpenseModal(true)} className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">Add your first expense →</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {expenses.map((exp) => (
              <div key={exp.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{exp.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{new Date(exp.created_at).toLocaleDateString('en-BD', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <p className="text-sm font-bold text-slate-900 flex-shrink-0">{formatPrice(exp.amount)}</p>
                <button
                  onClick={() => handleDeleteExpense(exp.id)}
                  disabled={deletingExpense === exp.id}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showExpenseModal && (
        <AddExpenseModal
          products={products}
          onClose={() => setShowExpenseModal(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}