import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../../components/shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { api, errorMessage } from '../../api/client'
import { useResource } from '../../api/store'
import { useDebounced } from '../../hooks/useDebounced'
import { getInitialsFromName } from '../../utils/initials'
import '../../styles/admin/system-settings.css'

import Dialog from '../../components/shared/Dialog'
const EMPTY_EDIT_FORM = { name: '', email: '', newPassword: '', confirmPassword: '' }

function Row({ title, desc }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <p className="settings-row-title">{title}</p>
        <p className="settings-row-desc">{desc}</p>
      </div>
    </div>
  )
}

const ACTION_LABELS = {
  login: 'Signed in', login_failed: 'Wrong password', login_locked: 'Blocked (locked)', logout: 'Signed out',
  password_change: 'Password changed', 'staff.create': 'Staff added', 'staff.update': 'Staff edited',
  'staff.deactivate': 'Staff deactivated', 'patient.delete': 'Patient deleted', 'consultation.delete': 'Record deleted',
  'product.delete': 'Product deleted', 'sale.create': 'Sale recorded', 'event.delete': 'Post deleted',
  'request.approve': 'Request approved', 'request.deny': 'Request denied', 'request.dismiss': 'Request dismissed'
}
const BAD_ACTIONS = new Set(['login_failed', 'login_locked'])

function ActivityLog() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const term = useDebounced(search.trim())
  const { data, loading, error } = useResource(
    `/auth/audit/?page=${page}&pageSize=10${term ? `&q=${encodeURIComponent(term)}` : ''}`,
    { refreshMs: 30000 }
  )
  const rows = data?.results || []
  const totalPages = data?.totalPages || 1

  return (
    <div className="table-card settings-card audit-card">
      <div className="audit-head">
        <h2>Activity log</h2>
        <input
          type="search" className="audit-search" placeholder="Search email or action…" aria-label="Search the activity log"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>
      {error && <p className="settings-field-error">Could not load the activity log.</p>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>From</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={BAD_ACTIONS.has(r.action) ? 'audit-bad' : undefined}>
                <td>{new Date(r.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{r.email || '—'}</td>
                <td>{ACTION_LABELS[r.action] || r.action}{r.detail ? ` (${r.detail})` : ''}</td>
                <td>{r.target || '—'}</td>
                <td>{r.ip || '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan="5" className="empty-state">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="audit-pager">
        <span>{data ? `${data.count} events` : ''}</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>{data?.page || page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  )
}

export default function SystemSettings() {
  const showToast = useToast()
  const { user, setUser } = useAuth()
  const adminProfile = { name: user?.name || '', email: user?.email || '', photo: user?.photo || null }
  const [saving, setSaving] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // ---- admin edit modal ----
  // step: null (closed) | 'verify' | 'edit'
  const [modalStep, setModalStep] = useState(null)

  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifyError, setVerifyError] = useState(false)
  const [verifyPasswordVisible, setVerifyPasswordVisible] = useState(false)
  const verifyPasswordRef = useRef(null)

  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [editPasswordError, setEditPasswordError] = useState('')
  const [newPasswordVisible, setNewPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)

  const [photoDataUrl, setPhotoDataUrl] = useState(null)
  const photoInputRef = useRef(null)

  // ==================== MODAL FLOW ====================

  function showAdminVerifyStep() {
    setModalStep('verify')
    setVerifyPassword('')
    setVerifyError(false)
    setVerifyPasswordVisible(false)
  }

  function showAdminEditStep() {
    setEditForm({ name: adminProfile.name, email: adminProfile.email, newPassword: '', confirmPassword: '' })
    setEditPasswordError('')
    setPhotoDataUrl(adminProfile.photo || null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    setNewPasswordVisible(false)
    setConfirmPasswordVisible(false)
    setModalStep('edit')
  }

  function openAdminEditModal() {
    showAdminVerifyStep()
  }

  function closeAdminEditModal() {
    setModalStep(null)
  }

  // Focus the password field whenever the verify step becomes visible,
  // matching the original's adminVerifyPasswordField.focus().
  useEffect(() => {
    if (modalStep === 'verify' && verifyPasswordRef.current) {
      verifyPasswordRef.current.focus()
    }
  }, [modalStep])

  // ==================== DEEP LINK ====================
  // Clicking the name/avatar in the profile popover (any page) navigates
  // here with ?openAdminEdit=1 so the edit flow opens immediately. This is
  // the React equivalent of the original's history.replaceState cleanup.
  useEffect(() => {
    if (searchParams.has('openAdminEdit')) {
      openAdminEditModal()
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==================== VERIFY FORM ====================

  function handleVerifySubmit(e) {
    e.preventDefault()
    // The server checks the current password when the changes are saved.
    showAdminEditStep()
  }

  function handleVerifyPasswordChange(e) {
    setVerifyPassword(e.target.value)
    setVerifyError(false)
  }

  // ==================== EDIT FORM ====================

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoDataUrl(ev.target.result)
    reader.readAsDataURL(file)
  }

  function handlePhotoRemove(e) {
    e.preventDefault()
    setPhotoDataUrl(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    if (saving) return

    const name = editForm.name.trim()
    const email = editForm.email.trim().toLowerCase()
    const newPassword = editForm.newPassword
    const confirmPassword = editForm.confirmPassword

    if (!name || !email) return

    if (newPassword || confirmPassword) {
      if (newPassword.length < 8) {
        setEditPasswordError('New password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        setEditPasswordError("New password and confirmation don't match.")
        return
      }
    }

    const payload = { name, email, photo: photoDataUrl, currentPassword: verifyPassword }
    if (newPassword) payload.newPassword = newPassword

    setSaving(true)
    try {
      const updated = await api.patch('/auth/me/', payload)
      setUser(updated)
      closeAdminEditModal()
      showToast('Admin account updated.')
    } catch (err) {
      if (err?.status === 400 && err.data?.currentPassword) {
        showToast(errorMessage(err))
        showAdminVerifyStep()
        setVerifyError(true)
      } else {
        showToast(errorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  const summaryInitials = getInitialsFromName(adminProfile.name)

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>System settings</h1>
      </div>

      <div className="table-card settings-card settings-admin-card">
        <div className="settings-admin-head">
          <div>
            <h2>Admin account</h2>
            <p className="settings-admin-sub">This is the only account with full access to this portal.</p>
          </div>
          <button type="button" className="settings-primary-btn" onClick={openAdminEditModal}>Update admin information</button>
        </div>

        <div className="settings-admin-summary">
          <span className="settings-admin-avatar">
            {adminProfile.photo
              ? <img src={adminProfile.photo} alt={adminProfile.name} className="avatar-photo-img" />
              : summaryInitials}
          </span>
          <div>
            <p className="settings-admin-summary-name">{adminProfile.name}</p>
            <p className="settings-admin-summary-email">{adminProfile.email}</p>
          </div>
        </div>
      </div>

      <div className="settings-grid">
        <div className="table-card settings-card">
          <h2>Forecast method</h2>
          <p className="settings-admin-sub">Fixed by the study's methodology so results stay comparable with the thesis.</p>
          <Row title="Technique" desc="Simple Moving Average" />
          <Row title="Window" desc="The previous 6 complete months" />
          <Row title="Horizon" desc="The following month" />
          <Row title="Accuracy" desc="MAE and MAPE from a 12-month back-test" />
          <Row title="Fast / slow movers" desc="Top and bottom third (terciles) of each category" />
        </div>

        <div className="table-card settings-card">
          <h2>Sign-in protection</h2>
          <p className="settings-admin-sub">How accounts are protected. Every event is recorded in the activity log below.</p>
          <Row title="Account lockout" desc="5 wrong passwords lock that account for 15 minutes" />
          <Row title="Sessions" desc="15-minute access, renewed automatically; signing out or changing a password ends other sessions" />
          <Row title="Passwords" desc="At least 8 characters; common and all-number passwords are refused; stored hashed" />
          <Row title="Access" desc="Admin, staff (own branch only) and customer (own pets only)" />
        </div>
      </div>

      <ActivityLog />

      {/* Update admin information modal */}
      <Dialog open={!!modalStep} onClose={closeAdminEditModal} label={modalStep === 'edit' ? 'Update admin information' : 'Verify your password'}>
        <div className="modal admin-edit-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{modalStep === 'edit' ? 'Update admin information' : 'Verify your password'}</h2>
            <button className="modal-close" aria-label="Close" onClick={closeAdminEditModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div className="modal-body">
            {/* Step 1: re-enter password before anything is editable */}
            {modalStep !== 'edit' && (
              <form className="settings-admin-form" onSubmit={handleVerifySubmit}>
                <p className="settings-admin-sub">For security, enter your current password to update the admin account.</p>
                <div className="form-group">
                  <label className="form-label" htmlFor="adminVerifyPassword">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={verifyPasswordVisible ? 'text' : 'password'}
                      id="adminVerifyPassword"
                      className={`form-input${verifyError ? ' error' : ''}`}
                      required
                      autoComplete="current-password"
                      ref={verifyPasswordRef}
                      value={verifyPassword}
                      onChange={handleVerifyPasswordChange}
                    />
                    <button type="button" className={`toggle-password${verifyPasswordVisible ? ' is-visible' : ''}`} aria-label="Show password"
                      onClick={() => setVerifyPasswordVisible(v => !v)}>
                      <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                      <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                    </button>
                  </div>
                  <p className="settings-field-error" hidden={!verifyError}>Incorrect password.</p>
                </div>
                <div className="settings-admin-actions">
                  <button type="submit" className="settings-primary-btn">Continue</button>
                </div>
              </form>
            )}

            {/* Step 2: revealed only after the password check passes */}
            {modalStep === 'edit' && (
              <form className="settings-admin-form" onSubmit={handleEditSubmit}>
                <div className="staff-photo-upload">
                  <label className="staff-photo-circle" htmlFor="adminPhotoInput">
                    {photoDataUrl
                      ? <img className="staff-photo-preview" src={photoDataUrl} alt="Admin photo preview" />
                      : (
                        <div className="staff-photo-placeholder">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
                        </div>
                      )}
                    <span className="staff-photo-edit-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </span>
                  </label>
                  <input type="file" id="adminPhotoInput" accept="image/*" hidden ref={photoInputRef} onChange={handlePhotoChange} />
                  <div className="staff-photo-actions">
                    <p className="staff-photo-hint">Upload a profile photo (optional)</p>
                    <button type="button" className="staff-photo-remove" hidden={!photoDataUrl} onClick={handlePhotoRemove}>Remove</button>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="adminName">Full name</label>
                    <input type="text" id="adminName" className="form-input" required
                      value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="adminEmail">Email</label>
                    <input type="email" id="adminEmail" className="form-input" required
                      value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>

                <div className="settings-admin-divider"></div>

                <h3 className="settings-admin-subhead">Change password <span className="settings-optional-tag">(optional)</span></h3>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="adminNewPassword">New password</label>
                    <div className="password-input-wrapper">
                      <input
                        type={newPasswordVisible ? 'text' : 'password'}
                        id="adminNewPassword"
                        className="form-input"
                        minLength="8"
                        autoComplete="new-password"
                        value={editForm.newPassword}
                        onChange={(e) => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                      />
                      <button type="button" className={`toggle-password${newPasswordVisible ? ' is-visible' : ''}`} aria-label="Show password"
                        onClick={() => setNewPasswordVisible(v => !v)}>
                        <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                        <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="adminConfirmPassword">Confirm new password</label>
                    <div className="password-input-wrapper">
                      <input
                        type={confirmPasswordVisible ? 'text' : 'password'}
                        id="adminConfirmPassword"
                        className="form-input"
                        minLength="8"
                        autoComplete="new-password"
                        value={editForm.confirmPassword}
                        onChange={(e) => setEditForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      />
                      <button type="button" className={`toggle-password${confirmPasswordVisible ? ' is-visible' : ''}`} aria-label="Show password"
                        onClick={() => setConfirmPasswordVisible(v => !v)}>
                        <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                        <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94" /><path d="M1 1l22 22" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <p className="settings-field-error" hidden={!editPasswordError}>{editPasswordError}</p>

                <div className="settings-admin-actions">
                  <button type="submit" className="settings-primary-btn" disabled={saving}>Save changes</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </Dialog>
    </main>
  )
}
