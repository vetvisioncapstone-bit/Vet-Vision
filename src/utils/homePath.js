// Where each role lands after signing in.
export function homePathFor(role) {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'customer') return '/customer'
  return '/employee/dashboard'
}
