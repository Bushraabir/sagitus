// app/(customer)/product/[id]/page.tsx
import { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Navbar from '@/app/components/layout/Navbar'
import ProductDetail from '@/app/components/product/ProductDetail'
import CommentList from '@/app/components/comments/CommentList'
import PageWrapper from '@/app/components/layout/PageWrapper'
import CommentForm from '@/app/components/comments/CommentForm'
import FrequentlyBoughtTogether from '@/app/components/product/FrequentlyBoughtTogether'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerClient()
  const { data: product } = await supabase
    .from('products')
    .select('name, description, images, image_url')
    .eq('id', params.id)
    .is('is_deleted', false)
    .single()

  if (!product) return { title: 'Product Not Found' }

  const coverImage =
    (Array.isArray(product.images) && product.images[0]) ||
    product.image_url ||
    '/og-image.png'

  return {
    title: `${product.name} — Bushal`,
    description:
      product.description ||
      `Shop ${product.name} at Bushal. Curated quality, fast delivery across Bangladesh.`,
    openGraph: {
      title: product.name,
      description: product.description || `Shop ${product.name} at Bushal.`,
      images: [{ url: coverImage, width: 800, height: 800, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      images: [coverImage],
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const supabase = await createServerClient()

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*, comments ( rating )')
    .eq('id', params.id)
    .is('is_deleted', false)
    .single()

  if (!product || productError) notFound()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const currentUserId = session?.user?.id ?? null
  let isAdmin = false

  if (currentUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUserId)
      .single()
    isAdmin = profile?.role === 'admin'
  }

  const { data: comments } = await supabase
    .from('comments')
    .select('id, body, rating, admin_reply, created_at, user_id')
    .eq('product_id', params.id)
    .order('created_at', { ascending: false })

  const userIds = Array.from(new Set((comments ?? []).map((c) => c.user_id)))
  let profilesMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    profiles?.forEach((p) => {
      profilesMap[p.id] = p.full_name ?? 'Anonymous'
    })
  }

  const commentsWithProfiles = (comments ?? []).map((c) => ({
    ...c,
    profiles: { full_name: profilesMap[c.user_id] ?? 'Anonymous' },
  }))

  const coverImage =
    (Array.isArray(product.images) && product.images[0]) ||
    product.image_url ||
    'https://bushal.vercel.app/og-image.png'

  const discountedPrice = product.discount_percent
    ? product.price * (1 - product.discount_percent / 100)
    : product.price

  const avgRating =
    product.comments?.length
      ? product.comments.reduce(
          (sum: number, c: any) => sum + (c.rating || 0),
          0
        ) / product.comments.length
      : 0

  const productJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    image: coverImage,
    description: product.description || 'Curated product at Bushal.',
    sku: product.id,
    offers: {
      '@type': 'Offer',
      url: `https://bushal.vercel.app/product/${product.id}`,
      priceCurrency: 'BDT',
      price: discountedPrice.toFixed(2),
      availability: product.in_stock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      seller: {
        '@type': 'Store',
        name: 'Bushal',
        url: 'https://bushal.vercel.app',
      },
    },
    aggregateRating: product.comments?.length
      ? {
          '@type': 'AggregateRating',
          ratingValue: avgRating.toFixed(1),
          reviewCount: product.comments.length,
          bestRating: '5',
          worstRating: '1',
        }
      : undefined,
  }

  return (
    <div className="min-h-screen bg-bushal-ivory">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <Navbar />

      {/* FIX: Added pb-32 lg:pb-0 to PageWrapper to ensure the comment form 
          at the bottom is not hidden behind the mobile sticky "Add to bag" bar */}
      <PageWrapper maxWidth="5xl" withBottomNav={false} className="py-10 lg:py-16 pb-32 lg:pb-0">
        <ProductDetail product={product} />

        {/* Reviews Section */}
        <section className="mt-20 lg:mt-28">
          {/* Section header */}
          <div className="flex items-center gap-5 mb-10">
            <div>
              <p className="eyebrow mb-1">Customer voices</p>
              <h2 className="font-heading text-3xl text-bushal-forest">
                Reviews
                {commentsWithProfiles.length > 0 && (
                  <span className="ml-3 font-body text-base font-normal text-bushal-inkSoft">
                    {commentsWithProfiles.length}{' '}
                    {commentsWithProfiles.length === 1 ? 'review' : 'reviews'}
                  </span>
                )}
              </h2>
            </div>
            <div className="flex-1 h-px bg-bushal-border" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-16 items-start">
            <div>
              <CommentList
                comments={commentsWithProfiles as any}
                currentUserId={currentUserId ?? undefined}
                isAdmin={isAdmin}
              />
            </div>
            <div className="lg:sticky lg:top-8">
              <CommentForm productId={product.id} />
            </div>
          </div>
        </section>

        {/* Frequently Bought Together Section */}
        <FrequentlyBoughtTogether productId={product.id} />
      </PageWrapper>
    </div>
  )
}