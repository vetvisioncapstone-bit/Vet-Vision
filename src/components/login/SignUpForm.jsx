import React, { useRef, useState } from 'react'
import LoginButton from './LoginButton'
import Turnstile, { turnstileEnabled } from './Turnstile'
import { useAuth } from '../../hooks/useAuth'

const EMPTY = { firstName: '', lastName: '', email: '', mobile: '', branch: 'Ibaan', password: '', confirm: '' }
const FIELD_IDS = { firstName: 'su-first', lastName: 'su-last', email: 'su-email', mobile: 'su-mobile', password: 'su-password', confirm: 'su-confirm' }

// The same rules the server applies (Django's password validators), shown before the owner trips over them.
const RULES = [
  { id: 'length', label: 'At least 8 characters', ok: (p) => p.length >= 8 },
  { id: 'letters', label: 'Not only numbers', ok: (p) => p !== '' && !/^\d+$/.test(p) }
]

function checkLocally(form) {
  const errors = {}
  if (!form.firstName.trim()) errors.firstName = 'Enter your first name.'
  if (!form.lastName.trim()) errors.lastName = 'Enter your last name.'
  if (!form.email.trim()) errors.email = 'Enter your email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email, like name@example.com.'
  if (form.mobile.trim() && !/^[+\d][\d\s-]{6,19}$/.test(form.mobile.trim())) errors.mobile = 'Use digits only, like 0917 123 4567.'
  if (!RULES.every((r) => r.ok(form.password))) errors.password = 'The password does not meet the rules below.'
  if (form.password && form.confirm !== form.password) errors.confirm = 'The passwords do not match.'
  return errors
}

// The server answers { field: ["message"] } or { detail: "message" }; keep one message per field.
function fromServer(data) {
  const errors = {}
  for (const [key, value] of Object.entries(data || {})) {
    const text = Array.isArray(value) ? value.join(' ') : String(value)
    errors[key in FIELD_IDS ? key : 'form'] = text
  }
  return errors
}

// Pet owners create their own account here (staff and admin accounts are created by the admin).
function SignUpForm({ onSignedUp }) {
  const { register } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [captcha, setCaptcha] = useState('')
  const [attempt, setAttempt] = useState(0) // new Turnstile widget (and token) per attempt
  const formRef = useRef(null)

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    // Fixing a field clears its message (and the general one), instead of leaving a stale error on screen.
    setErrors((errs) => (errs[key] || errs.form ? { ...errs, [key]: undefined, form: undefined } : errs))
  }

  function show(found) {
    setErrors(found)
    const first = Object.keys(FIELD_IDS).find((k) => found[k])
    if (first) formRef.current?.querySelector(`#${FIELD_IDS[first]}`)?.focus()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLoading) return
    const found = checkLocally(form)
    if (Object.keys(found).length) return show(found)
    if (turnstileEnabled && !captcha) return show({ form: 'Please wait for the security check below to finish, then try again.' })

    setErrors({})
    setIsLoading(true)
    const result = await register({
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
      mobile: form.mobile.trim(), branch: form.branch, password: form.password, captcha
    })
    if (result.success) {
      onSignedUp()
      return
    }
    setCaptcha('')
    setAttempt((n) => n + 1) // each token works once
    const serverErrors = fromServer(result.fields)
    show(Object.keys(serverErrors).length ? serverErrors : { form: result.message })
    setIsLoading(false)
  }

  // Label, input and its own error line, wired together for screen readers.
  const field = (key, label, input) => (
    <div className="form-group">
      <label className="form-label" htmlFor={FIELD_IDS[key]}>{label}</label>
      {React.cloneElement(input, {
        id: FIELD_IDS[key],
        className: `form-input plain${errors[key] ? ' error' : ''}`,
        value: form[key],
        onChange: set(key),
        'aria-invalid': errors[key] ? true : undefined,
        'aria-describedby': errors[key] ? `${FIELD_IDS[key]}-error` : input.props['aria-describedby']
      })}
      {errors[key] && <p className="field-error" id={`${FIELD_IDS[key]}-error`}>{errors[key]}</p>}
    </div>
  )

  return (
    <form id="signUpForm" ref={formRef} onSubmit={handleSubmit} noValidate>
      {errors.form && <div className="login-alert" role="alert">{errors.form}</div>}

      <div className="form-row">
        {field('firstName', 'First name', <input autoComplete="given-name" autoCapitalize="words" maxLength={60} />)}
        {field('lastName', 'Last name', <input autoComplete="family-name" autoCapitalize="words" maxLength={60} />)}
      </div>
      {field('email', 'Email', <input type="email" name="email" autoComplete="email" spellCheck={false} placeholder="you@example.com" maxLength={100} />)}
      <div className="form-row">
        {field('mobile', <>Mobile <span className="optional">(optional)</span></>,
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={20} />)}
        <div className="form-group">
          <label className="form-label" htmlFor="su-branch">Nearest branch</label>
          <div className="select-field">
            <select id="su-branch" className="form-input plain" value={form.branch} onChange={set('branch')}>
              <option>Ibaan</option>
              <option>San Jose</option>
            </select>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="su-password">Password</label>
        <div className="input-wrapper password-input-wrapper">
          <input id="su-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
            className={`form-input plain${errors.password ? ' error' : ''}`} value={form.password} onChange={set('password')}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={`su-password-rules${errors.password ? ' su-password-error' : ''}`} />
          <button type="button" className={`toggle-password${showPassword ? ' is-visible' : ''}`}
            aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}>
            <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
            <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
          </button>
        </div>
        <ul className="password-rules" id="su-password-rules">
          {RULES.map((r) => {
            const met = r.ok(form.password)
            return <li key={r.id} className={met ? 'met' : ''}>{r.label}<span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span></li>
          })}
          <li className="rule-note">Avoid common passwords like "password123"</li>
        </ul>
        {errors.password && <p className="field-error" id="su-password-error">{errors.password}</p>}
      </div>
      {field('confirm', 'Confirm password', <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" />)}

      <Turnstile key={attempt} action="register" onToken={setCaptcha} />

      <LoginButton isLoading={isLoading} label="Create account" />
    </form>
  )
}

export default SignUpForm
