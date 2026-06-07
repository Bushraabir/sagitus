// app/(admin)/admin/categories/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import AdminCategoriesClient from '@/app/components/admin/AdminCategoriesClient'

export default async function AdminCategoriesPage() {
  const supabase = createServerClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  return <AdminCategoriesClient initialCategories={categories ?? []} />
}