// app/(admin)/admin/layout.tsx
import AdminSidebar from '@/app/components/layout/AdminSidebar'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex min-h-screen bg-slate-100">
      <AdminSidebar />
      <main className="flex-1 pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  )
}