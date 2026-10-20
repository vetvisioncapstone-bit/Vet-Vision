import React from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { homePathFor } from '../../utils/homePath'

// Blocks a portal until the API session is known, and sends no session to login and a signed-in user with the wrong role to their own home.
export default function RequireRole({ role, children }) {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <Navigate to="/" replace />
  if (session.role !== role) return <Navigate to={homePathFor(session.role)} replace />
  return children
}
