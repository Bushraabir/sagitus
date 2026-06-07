// app/(admin)/admin/products/new/page.tsx
import ProductForm from '@/app/components/product/ProductForm'
import { createServerClient } from '@/lib/supabase/server'

export default async function NewProductPage() {
  const supabase = createServerClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('sort_order', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="text-sm text-slate-400 mt-0.5">Fill in the details below to list a new product</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <ProductForm mode="create" categories={categories ?? []} />
      </div>
    </div>
  )
}