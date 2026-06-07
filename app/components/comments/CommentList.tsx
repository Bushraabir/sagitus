// components/comments/CommentList.tsx
'use client'

import { useState } from 'react'

import { formatDate } from '@/app/lib/utils/formatDate'
import { Comment } from '@/app/types/comment'


interface Props {
  comments: Comment[]
  currentUserId?: string
  isAdmin?: boolean
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`w-4 h-4 fill-current ${i < rating ? 'text-yellow-400' : 'text-gray-200'}`} viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

interface CommentCardProps {
  comment: Comment
  currentUserId?: string
  isAdmin?: boolean
}

function CommentCard({ comment, currentUserId, isAdmin }: CommentCardProps) {
  const isOwner = comment.user_id === currentUserId

  // Edit comment state
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [editRating, setEditRating] = useState(comment.rating ?? 0)
  const [editLoading, setEditLoading] = useState(false)

  // Edit reply state
  const [editingReply, setEditingReply] = useState(false)
  const [replyBody, setReplyBody] = useState(comment.admin_reply ?? '')
  const [replyLoading, setReplyLoading] = useState(false)

  const [deleted, setDeleted] = useState(false)
  const [currentComment, setCurrentComment] = useState(comment)

  if (deleted) return null

  const handleEditComment = async () => {
    setEditLoading(true)
    const res = await fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment_id: comment.id,
        type: 'comment',
        body: editBody,
        rating: editRating || null,
      }),
    })
    setEditLoading(false)
    if (res.ok) {
      const data = await res.json()
      setCurrentComment({ ...currentComment, body: data.body, rating: data.rating })
      setEditing(false)
    }
  }

  const handleDeleteComment = async () => {
    if (!confirm('Delete this review?')) return
    const res = await fetch('/api/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: comment.id, type: 'comment' }),
    })
    if (res.ok) setDeleted(true)
  }

  const handleEditReply = async () => {
    setReplyLoading(true)
    const res = await fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment_id: comment.id,
        type: 'reply',
        reply: replyBody,
      }),
    })
    setReplyLoading(false)
    if (res.ok) {
      const data = await res.json()
      setCurrentComment({ ...currentComment, admin_reply: data.admin_reply })
      setEditingReply(false)
    }
  }

  const handleDeleteReply = async () => {
    if (!confirm('Delete your reply?')) return
    const res = await fetch('/api/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: comment.id, type: 'reply' }),
    })
    if (res.ok) {
      setCurrentComment({ ...currentComment, admin_reply: null })
      setReplyBody('')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {(comment.profiles?.full_name ?? 'A').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {comment.profiles?.full_name ?? 'Anonymous'}
            </p>
            <p className="text-xs text-gray-400">{formatDate(comment.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentComment.rating != null && !editing && (
            <StarDisplay rating={currentComment.rating} />
          )}
          {/* Owner actions */}
          {isOwner && !editing && (
            <div className="flex gap-1 ml-2">
              <button onClick={() => setEditing(true)}
                className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">
                Edit
              </button>
              <button onClick={handleDeleteComment}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                Delete
              </button>
            </div>
          )}
          {/* Admin delete any comment */}
          {isAdmin && !isOwner && (
            <button onClick={handleDeleteComment}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 ml-2">
              🗑 Remove
            </button>
          )}
        </div>
      </div>

      {/* Comment body — edit mode or display */}
      {editing ? (
        <div className="space-y-3">
          {/* Star edit */}
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} type="button" onClick={() => setEditRating(i + 1)}>
                <svg className={`w-6 h-6 fill-current ${i < editRating ? 'text-yellow-400' : 'text-gray-200'}`} viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
          </div>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleEditComment} disabled={editLoading}
              className="bg-orange-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {editLoading ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setEditBody(currentComment.body); setEditRating(currentComment.rating ?? 0) }}
              className="bg-gray-100 text-gray-700 text-xs px-4 py-2 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-700 text-sm leading-relaxed">{currentComment.body}</p>
      )}

      {/* Admin reply */}
      {currentComment.admin_reply && !editingReply && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-orange-600">💬 Bushal Team:</p>
            {isAdmin && (
              <div className="flex gap-1">
                <button onClick={() => { setEditingReply(true); setReplyBody(currentComment.admin_reply ?? '') }}
                  className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50">
                  Edit
                </button>
                <button onClick={handleDeleteReply}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">
                  Delete
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-700">{currentComment.admin_reply}</p>
        </div>
      )}

      {/* Edit reply form */}
      {editingReply && isAdmin && (
        <div className="mt-4 space-y-2">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-orange-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-orange-50"
          />
          <div className="flex gap-2">
            <button onClick={handleEditReply} disabled={replyLoading}
              className="bg-orange-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {replyLoading ? 'Saving...' : 'Save Reply'}
            </button>
            <button onClick={() => setEditingReply(false)}
              className="bg-gray-100 text-gray-700 text-xs px-4 py-2 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CommentList({ comments, currentUserId, isAdmin }: Props) {
  if (!comments || comments.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-sm">No reviews yet. Be the first to leave one!</p>
      </div>
    )
  }

  const ratingsOnly = comments.filter((c) => c.rating != null)
  const avgRating = ratingsOnly.length
    ? ratingsOnly.reduce((sum, c) => sum + (c.rating ?? 0), 0) / ratingsOnly.length
    : null

  return (
    <div className="mt-2">
      {avgRating !== null && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-orange-50 rounded-xl border border-orange-100">
          <span className="text-4xl font-bold text-gray-900">{avgRating.toFixed(1)}</span>
          <div>
            <StarDisplay rating={Math.round(avgRating)} />
            <p className="text-xs text-gray-500 mt-0.5">
              Based on {ratingsOnly.length} {ratingsOnly.length === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  )
}