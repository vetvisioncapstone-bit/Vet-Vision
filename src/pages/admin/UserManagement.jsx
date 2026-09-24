import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStaffAccounts } from '../../hooks/useStaffAccounts'
import { useToast } from '../../components/shared/Toast'
import '../../styles/admin/user-management.css'

const EMPTY_FORM = {
  name: '',
  address: '',
  email: '',
  mobile: '',
  branch: '',
  position: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false,
  agreeDataPrivacy: false,
  photo: null
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

function isPasswordStrong(value) {
  return value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
}

function isValidStaffEmail(email) {
  return email.toLowerCase().endsWith('@ecovet.ph')
}

export default function UserManagement() {
  const [accounts, setAccounts] = useStaffAccounts()
  const showToast = useToast()

  const [searchTerm, setSearchTerm] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [emailValidation, setEmailValidation] = useState('none') // 'none' | 'error' | 'success'
  const [canSubmit, setCanSubmit] = useState(false)

  const formRef = useRef(null)
  const photoInputRef = useRef(null)

  const isEditing = Boolean(editingId)

  const visibleAccounts = useMemo(() => {
    if (!searchTerm) return accounts
    return accounts.filter(a =>
      a.name.toLowerCase().includes(searchTerm) ||
      a.email.toLowerCase().includes(searchTerm)
    )
  }, [accounts, searchTerm])

  const passwordRules = useMemo(() => ({
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    number: /[0-9]/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password)
  }), [form.password])

  const passwordIsStrong = Object.values(passwordRules).every(Boolean)
  const passwordsMatch = form.confirmPassword === form.password

  // Mirrors the original's validateForm(): re-check native field validity plus
  // the password strong/match rules (which are optional-and-skipped when
  // editing and the password field was left blank) every time the form changes.
  useEffect(() => {
    const passwordOptionalAndBlank = isEditing && form.password === ''
    const strong = passwordOptionalAndBlank || isPasswordStrong(form.password)
    const match = passwordOptionalAndBlank || (form.password.length > 0 && form.password === form.confirmPassword)
    const formValid = formRef.current ? formRef.current.checkValidity() : false
    setCanSubmit(formValid && strong && match)
  }, [form, isEditing])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeAccountModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function openAccountModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowPassword(false)
    setShowConfirmPassword(false)
    setEmailValidation('none')
    setModalOpen(true)
  }

  function openEditAccountModal(account) {
    setEditingId(account.id)
    setForm({
      name: account.name,
      address: account.address || '',
      email: account.email,
      mobile: account.mobile || '',
      branch: account.branch,
      position: account.position || '',
      password: '',
      confirmPassword: '',
      agreeTerms: true,
      agreeDataPrivacy: true,
      photo: account.photo || null
    })
    setShowPassword(false)
    setShowConfirmPassword(false)
    setEmailValidation('none')
    setModalOpen(true)
  }

  function closeAccountModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowPassword(false)
    setShowConfirmPassword(false)
    setEmailValidation('none')
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function handleEmailBlur() {
    const email = form.email.trim()
    if (email === '') {
      setEmailValidation('none')
      return
    }
    setEmailValidation(isValidStaffEmail(email) ? 'success' : 'error')
  }

  function handleEmailChange(value) {
    setForm(f => ({ ...f, email: value }))
    if (emailValidation === 'error') setEmailValidation('none')
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm(f => ({ ...f, photo: ev.target.result }))
    reader.readAsDataURL(file)
  }

  function handlePhotoRemove(e) {
    e.preventDefault()
    setForm(f => ({ ...f, photo: null }))
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function handleSubmit(e) {
    e.preventDefault()

    const email = form.email.trim().toLowerCase()
    const password = form.password
    const confirmPassword = form.confirmPassword
    const keepingExistingPassword = isEditing && password === ''

    if (!isValidStaffEmail(form.email.trim()) && form.email.trim() !== '') {
      setEmailValidation('error')
      showToast('Staff email must be a @ecovet.ph address.')
      return
    }

    if (accounts.some(a => a.email === email && a.id !== editingId)) {
      showToast('That email is already registered to another account.')
      return
    }

    if (!keepingExistingPassword) {
      if (!isPasswordStrong(password)) {
        showToast("Password doesn't meet all the requirements yet.")
        return
      }
      if (password !== confirmPassword) {
        showToast("Password and confirm password don't match.")
        return
      }
    }

    const accountData = {
      name: form.name.trim(),
      address: form.address.trim(),
      email,
      mobile: form.mobile.trim(),
      branch: form.branch,
      position: form.position,
      photo: form.photo
    }

    if (!keepingExistingPassword) {
      accountData.password = password
    }

    if (isEditing) {
      setAccounts(prev => prev.map(a => a.id === editingId ? { ...a, ...accountData } : a))
      showToast(`"${accountData.name}"'s account was updated.`)
    } else {
      setAccounts(prev => {
        const nextId = prev.reduce((max, a) => Math.max(max, a.id + 1), 1)
        return [...prev, { id: nextId, role: 'Staff', lastLogin: 'Never', ...accountData }]
      })
      showToast(`"${accountData.name}" was added as staff.`)
    }

    closeAccountModal()
  }

  function handleDelete(account) {
    if (!confirm(`Remove "${account.name}"'s account?`)) return
    setAccounts(prev => prev.filter(a => a.id !== account.id))
    showToast(`"${account.name}" was removed.`)
  }

  function handleSort(columnLabel) {
    showToast(`Sorting by ${columnLabel} isn't connected yet.`)
  }

  return (
    <main className="content">
      <div className="content-header">
        <h1>User management</h1>
      </div>

      <div className="user-toolbar">
        <div className="search-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="search account"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.trim().toLowerCase())}
          />
        </div>
        <button className="new-btn" onClick={openAccountModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span>New</span>
        </button>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th className="sortable-col" onClick={() => handleSort('Branch')}>
                  Branch
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </th>
                <th className="sortable-col" onClick={() => handleSort('Position')}>
                  Position
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </th>
                <th>Last login</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No accounts yet. Click "+ New" to add one.</td></tr>
              ) : visibleAccounts.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No accounts match your search.</td></tr>
              ) : visibleAccounts.map(a => (
                <tr className="account-row" key={a.id} onClick={() => openEditAccountModal(a)}>
                  <td>
                    {a.photo
                      ? <img className="account-avatar" src={a.photo} alt={a.name} />
                      : <span className="account-avatar">{getInitials(a.name)}</span>}
                    {a.name}
                  </td>
                  <td>{a.email}</td>
                  <td>{a.branch}</td>
                  <td><span className="role-pill">{a.position || 'Staff'}</span></td>
                  <td>{a.lastLogin}</td>
                  <td className="action-col">
                    <div className="account-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="account-row-action-btn edit" aria-label="Edit account" onClick={() => openEditAccountModal(a)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                      </button>
                      <button type="button" className="account-row-action-btn delete" aria-label="Delete account" onClick={() => handleDelete(a)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit staff account modal */}
      <div className={`modal-overlay${modalOpen ? ' show' : ''}`} onClick={closeAccountModal}>
        <div className="modal account-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header account-modal-header">
            <div className="account-modal-logo">
              <img src="/Images/VET%20Vision.png" alt="Vet Vision logo" />
            </div>
            <button className="modal-close" aria-label="Close" onClick={closeAccountModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <form className="modal-body account-modal-body" ref={formRef} onSubmit={handleSubmit}>
            <h2 className="account-modal-title">{isEditing ? 'Edit staff account' : 'Create an staff account'}</h2>
            <p className="account-modal-subtitle">
              {isEditing ? "Update this employee's details below:" : 'Please fill in the employee details below:'}
            </p>

            <div className="account-form-panel">
              <div className="account-form-col">
                <h3 className="account-form-col-head">Personal Information</h3>

                <div className="staff-photo-upload">
                  <label className="staff-photo-circle" htmlFor="staffPhotoInput">
                    {form.photo
                      ? <img className="staff-photo-preview" src={form.photo} alt="Staff photo preview" />
                      : (
                        <div className="staff-photo-placeholder">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
                        </div>
                      )}
                    <span className="staff-photo-edit-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </span>
                  </label>
                  <input type="file" id="staffPhotoInput" ref={photoInputRef} accept="image/*" hidden onChange={handlePhotoChange} />
                  <div className="staff-photo-actions">
                    <p className="staff-photo-hint">Upload a profile photo (optional)</p>
                    {form.photo && (
                      <button type="button" className="staff-photo-remove" onClick={handlePhotoRemove}>Remove</button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffFullName">Full Name <span className="required">*</span></label>
                  <input
                    type="text" id="staffFullName" className="form-input" required
                    value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffAddress">Address <span className="required">*</span></label>
                  <input
                    type="text" id="staffAddress" className="form-input" required
                    value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffEmail">Email Address <span className="required">*</span></label>
                  <div className="icon-input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                    <input
                      type="email" id="staffEmail"
                      className={`form-input${emailValidation === 'error' ? ' error' : emailValidation === 'success' ? ' success' : ''}`}
                      pattern="^[^\s@]+@ecovet\.ph$"
                      title="Email must be a @ecovet.ph address"
                      placeholder="e.g. juan.delacruz@ecovet.ph"
                      required
                      value={form.email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      onBlur={handleEmailBlur}
                    />
                  </div>
                  <p className={`field-hint${emailValidation === 'error' ? ' show' : ''}`}>Email must end with @ecovet.ph (not @gmail.com).</p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffMobile">Mobile No. <span className="required">*</span></label>
                  <div className="phone-input-wrapper">
                    <span className="phone-country-code">PH</span>
                    <input
                      type="tel" id="staffMobile" className="form-input" placeholder="+63 (555) 000-0000" required
                      value={form.mobile} onChange={(e) => setForm(f => ({ ...f, mobile: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="account-form-col account-form-col-noheading">
                <div className="form-group">
                  <label className="form-label" htmlFor="staffPassword">Password <span className="required">*</span></label>
                  <p className="field-hint" hidden={!isEditing}>Leave blank to keep their current password.</p>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'} id="staffPassword" className="form-input" minLength={8}
                      required={!isEditing}
                      value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    />
                    <button
                      type="button" className={`toggle-password${showPassword ? ' is-visible' : ''}`}
                      aria-label="Show password" onClick={() => setShowPassword(v => !v)}
                    >
                      <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                      <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                    </button>
                  </div>
                  <ul className="password-hints">
                    <li className={passwordRules.length ? 'met' : ''}>minimum 8 characters</li>
                    <li className={passwordRules.upper ? 'met' : ''}>one uppercase character</li>
                    <li className={passwordRules.special ? 'met' : ''}>one special character</li>
                    <li className={passwordRules.lower ? 'met' : ''}>one lowercase character</li>
                    <li className={passwordRules.number ? 'met' : ''}>one number</li>
                  </ul>
                  {form.password && (
                    <p className={`password-strength-msg${passwordIsStrong ? ' is-strong' : ''}`}>
                      {passwordIsStrong ? '✓ Strong password' : 'Password is too weak'}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffConfirmPassword">Confirm Password <span className="required">*</span></label>
                  <div className="password-input-wrapper">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'} id="staffConfirmPassword" className="form-input"
                      required={!isEditing}
                      value={form.confirmPassword} onChange={(e) => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    />
                    <button
                      type="button" className={`toggle-password${showConfirmPassword ? ' is-visible' : ''}`}
                      aria-label="Show password" onClick={() => setShowConfirmPassword(v => !v)}
                    >
                      <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                      <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                    </button>
                  </div>
                  {form.confirmPassword && (
                    <p className={`password-match-msg${passwordsMatch ? ' is-match' : ' is-mismatch'}`}>
                      {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffLocation">Select location <span className="required">*</span></label>
                  <div className="form-select-wrapper">
                    <select
                      id="staffLocation" className="form-input" required
                      value={form.branch} onChange={(e) => setForm(f => ({ ...f, branch: e.target.value }))}
                    >
                      <option value="" disabled hidden></option>
                      <option>Ibaan</option>
                      <option>San Jose</option>
                    </select>
                    <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                  {form.branch && (
                    <span className="access-badge">
                      <span className="access-badge-dot"></span>
                      <span>{form.branch} — Staff access</span>
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="staffPosition">Position / role in the clinic <span className="required">*</span></label>
                  <div className="form-select-wrapper">
                    <select
                      id="staffPosition" className="form-input" required
                      value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                    >
                      <option value="" disabled hidden></option>
                      <option>Veterinarian</option>
                      <option>Veterinary Technician</option>
                      <option>Veterinary Assistant</option>
                      <option>Groomer</option>
                      <option>Receptionist</option>
                      <option>Secretary</option>
                      <option>Inventory Clerk</option>
                    </select>
                    <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>

                <div className="form-checkbox-group">
                  <label className="form-checkbox">
                    <input
                      type="checkbox" required={!isEditing}
                      checked={form.agreeTerms}
                      onChange={(e) => setForm(f => ({ ...f, agreeTerms: e.target.checked }))}
                    />
                    <span>I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a> of Vet Vision.</span>
                  </label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox" required={!isEditing}
                      checked={form.agreeDataPrivacy}
                      onChange={(e) => setForm(f => ({ ...f, agreeDataPrivacy: e.target.checked }))}
                    />
                    <span>I agree to the collection and processing of my personal data for employee registration in Vet Vision.</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="account-form-actions">
              <button type="submit" className="account-submit-btn" disabled={!canSubmit}>{isEditing ? 'Save changes' : 'Submit'}</button>
              <button type="button" className="account-cancel-btn" onClick={closeAccountModal}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
