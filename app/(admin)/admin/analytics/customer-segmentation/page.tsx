/**
 * ============================================================================
 * CUSTOMER SEGMENTATION - ADMIN PAGE
 * ============================================================================
 * 
 * This page provides the admin with AI-powered customer segmentation using
 * K-Means clustering. It analyzes purchasing behavior to divide customers
 * into 5 distinct segments: VIP, Loyal, Normal, High Risk, and Fake Orders.
 * 
 * FEATURES:
 * - Fetches historical order data from Supabase
 * - Prepares customer metrics (Total Spent, Frequency, Variance)
 * - Runs K-Means clustering algorithm
 * - Displays segment summaries with counts and revenue
 * - Shows detailed customer lists per segment
 * - Provides mathematically-backed discount recommendations per segment
 * 
 * ALGORITHM: K-Means Clustering with K-Means++ initialization
 * ============================================================================
 */

import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { Metadata } from 'next'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import { cn } from '@/app/lib/utils/cn'
import Link from 'next/link'
import {
  segmentCustomers,
  prepareCustomerMetrics,
  generateSegmentSummary,
  recommendCategoryDiscounts,
  type CustomerSegment,
  type SegmentType,
} from '@/lib/analytics/customerSegmentation'

export const metadata: Metadata = {
  title: 'Customer Segmentation',
  description: 'AI-powered customer segmentation using K-Means clustering.',
}

// ─── Segment UI Configuration ───────────────────────────────────────────────

const SEGMENT_CONFIG: Record<SegmentType, {
  color: string
  bg: string
  border: string
  icon: string
  description: string
  action: string
}> = {
  'VIP': {
    color: 'text-bushal-copper',
    bg: 'bg-bushal-copper/10',
    border: 'border-bushal-copper/20',
    icon: '',
    description: 'High spenders, frequent buyers. Your most valuable customers.',
    action: 'Provide exclusive early access and personalized offers.',
  },
  'Loyal': {
    color: 'text-bushal-forest',
    bg: 'bg-bushal-forest/10',
    border: 'border-bushal-forest/20',
    icon: '💎',
    description: 'Consistent buyers with good lifetime value.',
    action: 'Implement loyalty rewards program. Encourage referrals.',
  },
  'Normal': {
    color: 'text-bushal-inkMid',
    bg: 'bg-bushal-ivoryDeep',
    border: 'border-bushal-border',
    icon: '🛍️',
    description: 'Average purchasing behavior.',
    action: 'Send regular promotional emails. Upsell related products.',
  },
  'High Risk': {
    color: 'text-bushal-warning',
    bg: 'bg-bushal-warningBg',
    border: 'border-bushal-warning/20',
    icon: '⚠️',
    description: 'Declining engagement, churn risk.',
    action: 'Launch re-engagement campaign with aggressive discounts.',
  },
  'Fake Orders': {
    color: 'text-bushal-danger',
    bg: 'bg-bushal-dangerBg',
    border: 'border-bushal-danger/20',
    icon: '',
    description: 'Abnormal patterns (bots, fraud, or testing).',
    action: 'Review for fraud. Block suspicious accounts.',
  },
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default async function CustomerSegmentationPage() {
  const auth = await requireAdmin()
  if (!auth.success) return auth.response

  const supabase = await auth.supabase

  // 1. Fetch all fulfilled orders (last 12 months for relevance)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, total, created_at')
    .eq('status', 'fulfilled')
    .gte('created_at', twelveMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('[Customer Segmentation] Error fetching orders:', ordersError)
  }

  // 2. Fetch all customer profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('role', 'customer')

  if (profilesError) {
    console.error('[Customer Segmentation] Error fetching profiles:', profilesError)
  }

  // 3. Prepare Customer Metrics
  const rawOrders = (orders ?? []).map((o: any) => ({
    user_id: o.user_id,
    total: o.total,
    created_at: o.created_at,
  }))

  const customerMetrics = prepareCustomerMetrics(rawOrders)

  // 4. Run K-Means Clustering
  const segments = segmentCustomers(customerMetrics, {
    k: 5,
    maxIterations: 100,
    tolerance: 0.0001,
  })

  // 5. Generate Segment Summaries
  const summaries = generateSegmentSummary(segments)

  // 6. Build Profile Map for UI display
  const profileMap = new Map<string, { name: string; email: string }>()
  ;(profiles ?? []).forEach((p: any) => {
    profileMap.set(p.id, { name: p.full_name ?? 'Anonymous', email: p.email ?? 'No email' })
  })

  // 7. Group customers by segment for detailed view
  const customersBySegment = new Map<SegmentType, CustomerSegment[]>()
  summaries.forEach((s) => customersBySegment.set(s.segment, []))
  segments.forEach((seg) => {
    const list = customersBySegment.get(seg.segment)
    if (list) list.push(seg)
  })

  // Sort each segment's customers by total_spent descending
  customersBySegment.forEach((list) => {
    list.sort((a, b) => b.total_spent - a.total_spent)
  })

  // 8. Calculate Global Category Sales (Mock data for demonstration)
  // In a real app, you'd aggregate this from order_items + products
  const globalCategorySales: Record<string, number> = {
    'Accessories': 45000,
    'Clothing': 120000,
    'Electronics': 85000,
    'Home': 32000,
    'Beauty': 28000,
  }
  const allCategories = Object.keys(globalCategorySales)

  // 9. Generate Category Discount Recommendations
  const discountRecommendations = recommendCategoryDiscounts(
    segments,
    allCategories,
    globalCategorySales
  )

  // 10. Calculate Overall Metrics
  const totalCustomers = segments.length
  const vipCount = segments.filter((s) => s.segment === 'VIP').length
  const highRiskCount = segments.filter((s) => s.segment === 'High Risk').length
  const fakeOrdersCount = segments.filter((s) => s.segment === 'Fake Orders').length
  const totalRevenue = segments.reduce((sum, s) => sum + s.total_spent, 0)

  // ─── Render UI ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bushal-success animate-pulse" />
            <span className="text-[10px] font-bold text-bushal-success uppercase tracking-widest">
              Live · AI-Powered
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-bushal-forest tracking-tight font-heading">
            Customer Segmentation
          </h1>
          <p className="text-sm text-bushal-inkSoft mt-1">
            K-Means Clustering · {totalCustomers} customers analyzed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-2 text-sm font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Analytics
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Total Customers
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {totalCustomers}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Active buyers</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            VIP Customers
          </p>
          <p className="text-2xl font-extrabold text-bushal-copper tabular-nums font-heading">
            {vipCount}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">
            {totalCustomers > 0 ? ((vipCount / totalCustomers) * 100).toFixed(1) : 0}% of base
          </p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            High Risk
          </p>
          <p className="text-2xl font-extrabold text-bushal-warning tabular-nums font-heading">
            {highRiskCount}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Need re-engagement</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Fake Orders
          </p>
          <p className="text-2xl font-extrabold text-bushal-danger tabular-nums font-heading">
            {fakeOrdersCount}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Suspicious activity</p>
        </div>

        <div className="bg-bushal-surface rounded-2xl border border-bushal-border p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-bushal-inkSoft mb-2">
            Total Revenue
          </p>
          <p className="text-2xl font-extrabold text-bushal-forest tabular-nums font-heading">
            {formatPrice(totalRevenue)}
          </p>
          <p className="text-xs text-bushal-inkSoft mt-1">Last 12 months</p>
        </div>
      </div>

      {/* Algorithm Info Banner */}
      <div className="bg-gradient-to-br from-bushal-forest to-bushal-forestMid rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-bushal-copperGlow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-bushal-copperGlow mb-2">
              About This Analysis
            </h3>
            <p className="text-xs text-white/80 leading-relaxed mb-3">
              This system uses <strong className="text-white">K-Means clustering</strong> to group customers based on 
              three key features: <strong className="text-white">Total Spent</strong>, <strong className="text-white">Order Frequency</strong>, 
              and <strong className="text-white">Order Variance</strong>. The algorithm automatically detects abnormal patterns 
              to flag potential fake orders or bots.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[10px]">
              {(['VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders'] as SegmentType[]).map((seg) => (
                <div key={seg} className="bg-white/5 rounded-lg p-2">
                  <p className="text-bushal-copperGlow font-bold">{SEGMENT_CONFIG[seg].icon} {seg}</p>
                  <p className="text-white/60 mt-0.5">{summaries.find((s) => s.segment === seg)?.count ?? 0} customers</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Segment Detail Cards */}
      <div className="space-y-6">
        {(['VIP', 'Loyal', 'Normal', 'High Risk', 'Fake Orders'] as SegmentType[]).map((segmentType) => {
          const config = SEGMENT_CONFIG[segmentType]
          const summary = summaries.find((s) => s.segment === segmentType)
          const customers = customersBySegment.get(segmentType) ?? []
          
          if (!summary) return null

          return (
            <div key={segmentType} className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
              {/* Segment Header */}
              <div className={cn('px-6 py-4 border-b border-bushal-border', config.bg)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl', config.bg, config.border, 'border')}>
                      {config.icon}
                    </div>
                    <div>
                      <h2 className={cn('text-lg font-bold font-heading', config.color)}>
                        {segmentType} Customers
                      </h2>
                      <p className="text-xs text-bushal-inkSoft mt-0.5">
                        {config.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-2xl font-extrabold tabular-nums font-heading', config.color)}>
                      {summary.count}
                    </p>
                    <p className="text-xs text-bushal-inkSoft">
                      {formatPrice(summary.avg_spent)} avg spent
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommended Action */}
              <div className="px-6 py-3 bg-bushal-ivoryDeep/50 border-b border-bushal-border">
                <p className="text-xs font-bold text-bushal-ink uppercase tracking-wide mb-1">
                  Recommended Action:
                </p>
                <p className="text-sm text-bushal-inkMid">
                  {summary.recommended_action}
                </p>
              </div>

              {/* Customer Table */}
              {customers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-bushal-ivoryDeep/50 border-b border-bushal-border">
                        <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Total Spent
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Orders
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Confidence
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Top Category
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                          Recommended Discount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bushal-ivory">
                      {customers.slice(0, 10).map((customer) => {
                        const profile = profileMap.get(customer.user_id)
                        return (
                          <tr key={customer.user_id} className="hover:bg-bushal-ivoryDeep/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white', config.bg.replace('/10', '').replace('Bg', ''))} style={{ backgroundColor: segmentType === 'VIP' ? '#B87333' : segmentType === 'Loyal' ? '#1A362D' : segmentType === 'High Risk' ? '#D97706' : segmentType === 'Fake Orders' ? '#DC2626' : '#6B7280' }}>
                                  {(profile?.name ?? 'A').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-bushal-ink truncate max-w-[200px]">
                                    {profile?.name ?? 'Anonymous'}
                                  </p>
                                  <p className="text-xs text-bushal-inkSoft truncate max-w-[200px]">
                                    {profile?.email ?? 'No email'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-bold text-bushal-forest tabular-nums">
                                {formatPrice(customer.total_spent)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm text-bushal-ink tabular-nums">
                                {customer.order_count}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn(
                                'inline-flex px-2 py-1 rounded-full text-xs font-bold',
                                customer.confidence_score > 0.8 ? 'bg-bushal-successBg text-bushal-success' :
                                customer.confidence_score > 0.5 ? 'bg-bushal-warningBg text-bushal-warning' :
                                'bg-bushal-ivoryDeep text-bushal-inkSoft'
                              )}>
                                {(customer.confidence_score * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-bushal-ivoryDeep text-bushal-inkMid">
                                {customer.top_category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={cn('text-sm font-bold tabular-nums', config.color)}>
                                {customer.recommended_discount}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {customers.length > 10 && (
                    <div className="px-6 py-3 bg-bushal-ivoryDeep/30 border-t border-bushal-border text-center">
                      <p className="text-xs text-bushal-inkSoft">
                        Showing top 10 of {customers.length} {segmentType.toLowerCase()} customers
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <p className="text-sm text-bushal-inkSoft">No customers in this segment yet.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Category Discount Recommendations */}
      {discountRecommendations.length > 0 && (
        <div className="bg-bushal-surface rounded-2xl border border-bushal-border overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-bushal-border bg-bushal-copper/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bushal-copper/10 text-bushal-copper flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-bushal-forest">
                  Category-Specific Discount Recommendations
                </h2>
                <p className="text-xs text-bushal-inkSoft">
                  Mathematically backed suggestions based on segment affinity lift
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bushal-ivoryDeep/50 border-b border-bushal-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Segment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Recommended Discount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-bushal-inkSoft uppercase tracking-wide">
                    Reasoning
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bushal-ivory">
                {discountRecommendations.slice(0, 10).map((rec, i) => {
                  const segConfig = SEGMENT_CONFIG[rec.segment]
                  return (
                    <tr key={i} className="hover:bg-bushal-ivoryDeep/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border', segConfig.bg, segConfig.color, segConfig.border)}>
                          {segConfig.icon} {rec.segment}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-bushal-ink">
                          {rec.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-bushal-copper tabular-nums">
                          {rec.recommended_discount}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-bushal-inkSoft leading-relaxed">
                          {rec.reasoning}
                        </p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div className="text-center text-xs text-bushal-inkSoft">
        <p>
          Analysis based on {totalCustomers} customers · Last 12 months of order history · K-Means algorithm with K=5
        </p>
        <p className="mt-1">
          Last updated: {formatDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}