// app/(admin)/admin/comments/page.tsx
import { createServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/app/lib/utils/formatDate'
import AdminReplyForm from '@/app/components/comments/AdminReplyForm'

export default async function AdminCommentsPage() {
  const supabase = createServerClient()

  const { data: allComments } = await supabase
    .from('comments')
    .select(`
      id,
      body,
      rating,
      admin_reply,
      created_at,
      user_id,
      product_id,
      products ( name )
    `)
    .order('created_at', { ascending: false })

  const commentUserIds = Array.from(new Set((allComments ?? []).map((c) => c.user_id)))
  let commentProfilesMap: Record<string, string> = {}

  if (commentUserIds.length > 0) {
    const { data: commentProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', commentUserIds)

    commentProfiles?.forEach((p) => {
      commentProfilesMap[p.id] = p.full_name ?? 'Anonymous'
    })
  }

  const unreplied = (allComments ?? []).filter((c) => !c.admin_reply).length

  return (
    <div className="animate-fade-in-up space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customer Comments</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {unreplied > 0 ? (
            <span className="text-amber-600 font-semibold">{unreplied} awaiting reply</span>
          ) : (
            <span className="text-emerald-600 font-semibold">All replied ✓</span>
          )}
          {' '}· {(allComments ?? []).length} total
        </p>
      </div>

      {(!allComments || allComments.length === 0) ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <p className="text-slate-400 text-sm">No comments yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(allComments ?? []).map((comment) => (
            <div
              key={comment.id}
              className={`bg-white rounded-2xl border p-5 transition-all ${
                !comment.admin_reply ? 'border-amber-200 shadow-sm shadow-amber-100' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 text-sm">
                      {commentProfilesMap[comment.user_id] ?? 'Anonymous'}
                    </p>
                    {!comment.admin_reply && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        Needs Reply
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    on{' '}
                    <span className="font-medium text-slate-600">
                      {(comment.products as any)?.name ?? 'Unknown product'}
                    </span>
                    {' · '}
                    {formatDate(comment.created_at)}
                  </p>
                </div>

                {comment.rating && (
                  <div className="flex gap-0.5 flex-shrink-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <svg key={i} className={`w-4 h-4 fill-current ${i < comment.rating ? 'text-yellow-400' : 'text-slate-200'}`} viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-slate-700 text-sm mb-4 leading-relaxed">{comment.body}</p>

              {comment.admin_reply ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-orange-600 mb-1">Your reply:</p>
                  <p className="text-sm text-slate-700">{comment.admin_reply}</p>
                </div>
              ) : (
                <AdminReplyForm commentId={comment.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}