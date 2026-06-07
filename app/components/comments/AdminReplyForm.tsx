// components/comments/AdminReplyForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../ui/Button'


interface Props {
  commentId: string
}

export default function AdminReplyForm({ commentId }: Props) {
  const router = useRouter()
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return

    setLoading(true)
    setError('')

    const res = await fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId, reply }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to submit reply')
      return
    }

    setSuccess(true)
    setReply('')
    router.refresh()
  }

  if (success) {
    return (
      <p className="text-sm text-green-600 font-medium">
        ✓ Reply posted successfully.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
        placeholder="Write your reply as Bushal Team..."
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none text-sm"
        required
      />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <Button type="submit" loading={loading} size="sm">
        Post Reply
      </Button>
    </form>
  )
}