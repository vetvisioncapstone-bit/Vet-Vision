import React from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'

// Blocks a portal until the API session is known, and sends the wrong (or no) role back to login.
export default function RequireRole({ role, children }) {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session || session.role !== role) return <Navigate to="/" replace />
  return children
}
