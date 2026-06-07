// app/(admin)/admin/products/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import AdminProductsClient from '@/app/components/admin/AdminProductsClient'

export default async function AdminProductsPage() {
  const supabase = createServerClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('name').order('name'),
  ])

  return (
    <AdminProductsClient
      products={products ?? []}
      categories={(categories ?? []).map((c) => c.name)}
    />
  )
}