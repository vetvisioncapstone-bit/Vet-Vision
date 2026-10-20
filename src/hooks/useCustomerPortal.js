import { useCallback, useMemo, useState } from 'react'
import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useAuth } from './useAuth'

// The signed-in pet owner's pets. Pet: { id, name, species, breed, sex, age, dob, color, status,
// followUpNote, lastCheckup, visits: [{ id, date, type, diagnosis, treatment, services, availedItems,
// totalPrice, weight, remarks, followUp, followUpNote }] } - visits newest first.
export function useMyPets() {
  const { session } = useAuth()
  const { data, loading, error, reload } = useResource('/me/pets/', {
    enabled: session?.role === 'customer',
    refreshMs: 120000
  })
  return { pets: data || [], loading, error, reload }
}

// Clinic announcements (newest first) plus which ones this owner has not opened yet.
// "Seen" is remembered per browser only; opening the bell marks everything seen.
export function useAnnouncements() {
  const { session } = useAuth()
  const { data, loading, error } = useResource('/events/posts/', {
    enabled: session?.role === 'customer',
    refreshMs: 30000
  })
  const storageKey = `vv-customer-seen-${session?.customerId || ''}`
  const [seenAt, setSeenAt] = useState(() => {
    try { return localStorage.getItem(storageKey) || '' } catch { return '' }
  })

  const items = data || []
  const unread = useMemo(() => items.filter((p) => p.createdAt > seenAt), [items, seenAt])

  const markSeen = useCallback(() => {
    const newest = items[0]?.createdAt
    if (!newest || newest <= seenAt) return
    try { localStorage.setItem(storageKey, newest) } catch { /* ignore */ }
    setSeenAt(newest)
  }, [items, seenAt, storageKey])

  return { items, unread, unreadCount: unread.length, loading, error, markSeen }
}

// Which days the owner's branch is open (regular schedule + the admin's per-date closures), for [from, to] as
// 'YYYY-MM-DD'. `weekly` is the regular week for the hours list.
export function useClinicCalendar(from, to) {
  const { session } = useAuth()
  const { data, loading, error } = useResource(`/clinic/calendar/?from=${from}&to=${to}`, {
    enabled: session?.role === 'customer',
    refreshMs: 300000
  })
  return { days: data?.days || {}, weekly: data?.weekly || [], branch: data?.branch || '', loading, error }
}

// Vet follow-ups and vaccine boosters that are due. Same "seen" idea as the announcements, keyed per reminder.
export function useReminders() {
  const { session } = useAuth()
  const { data, loading, error } = useResource('/me/reminders/', {
    enabled: session?.role === 'customer',
    refreshMs: 120000
  })
  const storageKey = `vv-customer-seen-reminders-${session?.customerId || ''}`
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  })

  const items = data || []
  const tag = (r) => `${r.id}@${r.dueDate}`
  const unread = useMemo(() => items.filter((r) => !seen.includes(tag(r))), [items, seen])

  const markSeen = useCallback(() => {
    if (!unread.length) return
    const all = [...new Set([...seen, ...items.map(tag)])]
    try { localStorage.setItem(storageKey, JSON.stringify(all)) } catch { /* ignore */ }
    setSeen(all)
  }, [items, seen, storageKey, unread.length])

  return { items, unread, unreadCount: unread.length, loading, error, markSeen }
}

// The owner registers one of their own pets; the pets list refreshes everywhere.
export async function registerPet(fields) {
  const pet = await api.post('/me/pets/', fields)
  await invalidate('/me/pets/')
  return pet
}
