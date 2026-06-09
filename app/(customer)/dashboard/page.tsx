// app/(customer)/dashboard/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import Navbar from '@/app/components/layout/Navbar'
import Footer from '@/app/components/layout/Footer'
import BottomNav from '@/app/components/layout/BottomNav'
import HeroBanner from '@/app/components/home/HeroBanner'

import SectionHeader from '@/app/components/ui/SectionHeader'
import PageWrapper from '@/app/components/layout/PageWrapper'
import { formatPrice } from '@/app/lib/utils/formatPrice'
import Link from 'next/link'
import { Metadata } from 'next'
import CategoryFilter from '@/app/components/product/CatagoryFilter'

export const metadata: Metadata = {
  title: 'Home — Premium Curated Products',
  description: 'Shop heritage-quality, handpicked products at Bushal. Fast delivery across Bangladesh, secure bKash payments, and transparent pricing. Explore our collection today.',
  openGraph: {
    title: 'Bushal — Shop Premium Curated Products',
    description: 'Heritage-quality goods delivered across Bangladesh. Transparent pricing & secure bKash payments.',
    url: 'https://bushal.vercel.app/dashboard',
  },
}

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: products, error } = await supabase
    .from('products')
    .select(`*, comments ( rating )`)
    .order('created_at', { ascending: false })

  if (error) console.error('Error fetching products:', error)

  const allProducts = products ?? []
  const discounted = allProducts
    .filter((p) => p.discount_percent && p.discount_percent > 0 && p.in_stock)
    .sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-bushal-ivory">
      <Navbar />
      
      <PageWrapper maxWidth="7xl" className="pb-28 md:pb-12">
        <HeroBanner />


        {discounted.length > 0 && (
          <section className="mb-10">
            <SectionHeader
              title="Hot Deals"
              subtitle="Limited-time discounts on top products"
              action={
                <Link href="#products" className="text-sm font-semibold text-bushal-copper hover:text-bushal-copperLight transition-colors">
                  See all →
                </Link>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {discounted.map((p) => {
                const cover = (Array.isArray(p.images) && p.images[0]) || p.image_url
                const discountedPrice = p.price * (1 - (p.discount_percent ?? 0) / 100)
                const saved = p.price - discountedPrice

                return (
                  <a
                    key={p.id}
                    href={`/product/${p.id}`}
                    className="group flex gap-4 items-center bg-bushal-surface rounded-xl border border-bushal-border p-3.5 shadow-card hover:shadow-cardHover hover:border-bushal-borderMid hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-bushal-ivoryDeep flex-shrink-0 border border-bushal-border">
                      {cover ? (
                        <img src={cover} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-bushal-borderMid">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="inline-block bg-bushal-danger text-white text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5">
                        -{p.discount_percent}% OFF
                      </span>
                      <p className="text-bushal-ink text-sm font-semibold leading-tight line-clamp-2 mb-1.5">{p.name}</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-bushal-forest font-bold text-base">{formatPrice(discountedPrice)}</span>
                        <span className="text-bushal-inkSoft text-xs line-through">{formatPrice(p.price)}</span>
                      </div>
                      <p className="text-bushal-success text-xs font-semibold mt-0.5">Save {formatPrice(saved)}</p>
                    </div>
                  </a>
                )
              })}
            </div>
          </section>
        )}

        <section id="products">
          <SectionHeader
            title="All Products"
            subtitle={`${allProducts.length} items available`}
          />
          <CategoryFilter products={allProducts} />
        </section>
      </PageWrapper>

      <Footer />
      <BottomNav />
    </div>
  )
}