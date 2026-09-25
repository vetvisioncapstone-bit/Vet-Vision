import React, { useState } from 'react'
import LoginButton from './LoginButton'
import { useAuth } from '../hooks/useAuth'

const EMPTY = { firstName: '', lastName: '', email: '', mobile: '', branch: 'Ibaan', password: '', confirm: '' }

// Pet owners create their own account here (the staff and admin accounts are created by the admin).
function SignUpForm({ onSignedUp }) {
  const { register } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password) {
      setError('Fill in your name, email and a password.')
      return
    }
    if (form.password !== form.confirm) {
      setError('The passwords do not match.')
      return
    }
    setError('')
    setIsLoading(true)
    const result = await register({
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
      mobile: form.mobile.trim(), branch: form.branch, password: form.password
    })
    if (result.success) {
      onSignedUp()
      return
    }
    setError(result.message)
    setIsLoading(false)
  }

  return (
    <form id="signUpForm" onSubmit={handleSubmit}>
      {error && <div className="login-alert" role="alert">{error}</div>}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="su-first">First name</label>
          <input id="su-first" className="form-input plain" autoComplete="given-name" maxLength={60}
            value={form.firstName} onChange={set('firstName')} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-last">Last name</label>
          <input id="su-last" className="form-input plain" autoComplete="family-name" maxLength={60}
            value={form.lastName} onChange={set('lastName')} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="su-email">Email</label>
        <input id="su-email" type="email" name="email" className="form-input plain" autoComplete="email" spellCheck={false} placeholder="you@example.com"
          value={form.email} onChange={set('email')} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="su-mobile">Mobile</label>
          <input id="su-mobile" type="tel" className="form-input plain" autoComplete="tel" placeholder="Optional" maxLength={20}
            value={form.mobile} onChange={set('mobile')} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-branch">Nearest branch</label>
          <select id="su-branch" className="form-input plain" value={form.branch} onChange={set('branch')}>
            <option>Ibaan</option>
            <option>San Jose</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="su-password">Password</label>
        <input id="su-password" type="password" className="form-input plain" autoComplete="new-password"
          placeholder="At least 8 characters" value={form.password} onChange={set('password')} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="su-confirm">Confirm password</label>
        <input id="su-confirm" type="password" className="form-input plain" autoComplete="new-password"
          value={form.confirm} onChange={set('confirm')} />
      </div>

      <LoginButton isLoading={isLoading} label="Create account" />
    </form>
  )
}

export default SignUpForm
