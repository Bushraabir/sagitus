// app/(admin)/admin/products/[id]/edit/page.tsx
import ProductForm from '@/app/components/product/ProductForm'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

interface Props {
  params: { id: string }
}

export default async function EditProductPage({ params }: Props) {
  const supabase = createServerClient()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').eq('id', params.id).single(),
    supabase.from('categories').select('id, name, slug').order('sort_order', { ascending: true }),
  ])

  if (!product) notFound()

  const normalised = {
    ...product,
    images:
      Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : product.image_url
        ? [product.image_url]
        : [],
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
        <p className="text-sm text-slate-400 mt-0.5 truncate">{product.name}</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <ProductForm mode="edit" product={normalised} categories={categories ?? []} />
      </div>
    </div>
  )
}