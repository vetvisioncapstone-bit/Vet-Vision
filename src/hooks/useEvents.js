import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Announcements: { id, authorName, authorPhoto, text, photo, createdAt } newest first.
// Everyone reads; only the admin can create/remove.
export function useEventPosts() {
  const { session } = useSession()
  const { data, loading, error, reload } = useResource('/events/posts/', { enabled: !!session, refreshMs: 60000 })
  return {
    items: data || [],
    loading,
    error,
    reload,
    create: async ({ text, photo }) => {
      const post = await api.post('/events/posts/', { text, photo })
      await invalidate('/events/posts/')
      return post
    },
    remove: async (id) => { await api.del(`/events/posts/${id}/`); await invalidate('/events/posts/') }
  }
}

// { Ibaan: { '2026-09-26': 'unavailable' | 'available' }, 'San Jose': {...} } - dates with no entry are unset.
export function useEventAvailability() {
  const { session } = useSession()
  const { data, loading, error, reload } = useResource('/events/availability/', { enabled: !!session, refreshMs: 60000 })
  return {
    availability: data || { Ibaan: {}, 'San Jose': {} },
    loading,
    error,
    reload,
    // state: 'available' | 'unavailable' | null (clears the override). Admin only.
    setState: async (branch, date, state) => {
      await api.put('/events/availability/', { branch, date, state })
      await invalidate('/events/availability/')
    }
  }
}
