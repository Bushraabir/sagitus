// app/(customer)/product/[id]/page.tsx
import { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Navbar from '@/app/components/layout/Navbar'
import ProductDetail from '@/app/components/product/ProductDetail'
import CommentForm from '@/app/components/comments/CommentForm'
import CommentList from '@/app/components/comments/CommentList'

interface Props { params: { id: string } }

// 1. Dynamic SEO Metadata for Social Sharing & Search Titles
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient()
  const { data: product } = await supabase
    .from('products')
    .select('name, description, images, image_url')
    .eq('id', params.id)
    .single()

  if (!product) return { title: 'Product Not Found' }

  const coverImage = (Array.isArray(product.images) && product.images[0]) || product.image_url || '/og-image.png'

  return {
    title: `${product.name} — Shop at Bushal`,
    description: product.description || `Buy ${product.name} at Bushal. Premium quality, fast delivery across Bangladesh.`,
    openGraph: {
      title: product.name,
      description: product.description || `Buy ${product.name} at Bushal.`,
      // FIX: Removed `type: 'product'` because Next.js Metadata API only accepts 'website', 'article', etc.
      // The default 'website' type is perfectly fine for social media previews.
      images: [{ url: coverImage, width: 800, height: 800, alt: product.name }],
    },
    twitter: { card: 'summary_large_image', title: product.name, images: [coverImage] },
  }
}

export default async function ProductPage({ params }: Props) {
  const supabase = createServerClient()
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*, comments ( rating )') // Fetch ratings for JSON-LD
    .eq('id', params.id)
    .single()

  if (!product || productError) notFound()

  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id ?? null
  let isAdmin = false
  if (currentUserId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', currentUserId).single()
    isAdmin = profile?.role === 'admin'
  }

  const { data: comments } = await supabase.from('comments').select('id, body, rating, admin_reply, created_at, user_id').eq('product_id', params.id).order('created_at', { ascending: false })
  const userIds = Array.from(new Set((comments ?? []).map((c) => c.user_id)))
  let profilesMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
    profiles?.forEach((p) => { profilesMap[p.id] = p.full_name ?? 'Anonymous' })
  }
  const commentsWithProfiles = (comments ?? []).map((c) => ({ ...c, profiles: { full_name: profilesMap[c.user_id] ?? 'Anonymous' } }))

  // 2. Product JSON-LD for Google Rich Snippets (Price, Stock, Ratings)
  const coverImage = (Array.isArray(product.images) && product.images[0]) || product.image_url || 'https://bushal.vercel.app/og-image.png'
  const discountedPrice = product.discount_percent ? product.price * (1 - product.discount_percent / 100) : product.price
  const avgRating = product.comments?.length ? product.comments.reduce((sum: number, c: any) => sum + (c.rating || 0), 0) / product.comments.length : 0

  const productJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product', // <--- This is what Google actually reads for Product Rich Snippets!
    name: product.name,
    image: coverImage,
    description: product.description || 'Premium curated product at Bushal.',
    sku: product.id,
    offers: {
      '@type': 'Offer',
      url: `https://bushal.vercel.app/product/${product.id}`,
      priceCurrency: 'BDT',
      price: discountedPrice.toFixed(2),
      availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      seller: { '@type': 'Store', name: 'Bushal', url: 'https://bushal.vercel.app' }
    },
    aggregateRating: product.comments?.length ? {
      '@type': 'AggregateRating',
      ratingValue: avgRating.toFixed(1),
      reviewCount: product.comments.length,
      bestRating: '5',
      worstRating: '1',
    } : undefined,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Inject Product Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <ProductDetail product={product} />
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Customer Reviews {commentsWithProfiles.length > 0 && (<span className="ml-2 text-base font-normal text-gray-500">({commentsWithProfiles.length})</span>)}
          </h2>
          <CommentForm productId={product.id} />
          <CommentList comments={commentsWithProfiles as any} currentUserId={currentUserId ?? undefined} isAdmin={isAdmin} />
        </section>
      </main>
    </div>
  )
}