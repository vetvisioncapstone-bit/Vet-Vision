import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../../components/shared/Toast'
import { useAdminProfile } from '../../hooks/useAdminProfile'
import { getInitialsFromName } from '../../utils/auth'
import '../../styles/admin/system-settings.css'

// ==================== STATE ====================
// In-memory only - there's no database yet, so this resets on reload.
// These values aren't read by any other page yet (inventory, forecasting,
// etc. still use their own hardcoded numbers) - this page just captures
// and previews the configuration. Matches system-settings.js exactly:
// no localStorage persistence for this object.

const DEFAULT_SETTINGS = {
  lowStockThreshold: 20,
  highDemandThreshold: 100,
  loyalVisitCount: 8,
  movingAverageWindow: 3,
  forecastHorizon: 1,
  defaultForecastBranch: 'All Branches',
  lowStockEmailAlerts: true,
  followUpReminders: true,
  autoDailyBackup: false
}

// ==================== EXPORT HELPERS ====================

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function settingsToCsv(settings) {
  const rows = [['Setting', 'Value']]
  Object.entries(settings).forEach(([key, value]) => rows.push([key, String(value)]))
  return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
}

const EMPTY_EDIT_FORM = { name: '', email: '', newPassword: '', confirmPassword: '' }

export default function SystemSettings() {
  const showToast = useToast()
  const [adminProfile, setAdminProfile] = useAdminProfile()
  const [searchParams, setSearchParams] = useSearchParams()

  // ---- in-memory settings ----
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

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

  // Escape closes the modal, same as the original's document-level listener.
  useEffect(() => {
    if (!modalStep) return undefined
    function handleKeydown(e) {
      if (e.key === 'Escape') closeAdminEditModal()
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
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
    if (verifyPassword !== adminProfile.password) {
      setVerifyError(true)
      return
    }
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

  function handleEditSubmit(e) {
    e.preventDefault()

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

    const updated = { ...adminProfile, name, email, photo: photoDataUrl }
    if (newPassword) updated.password = newPassword

    setAdminProfile(updated)
    closeAdminEditModal()
    showToast('Admin account updated.')
  }

  // ==================== NUMBER / SELECT / TOGGLE FIELDS ====================
  // Native number/text inputs fire 'change' on blur, not on every
  // keystroke - onBlur here is the faithful React equivalent (onChange
  // would fire on every keystroke and doesn't match the original).

  function handleNumberBlur(e, key, label, min) {
    let value = Math.round(Number(e.target.value))
    if (Number.isNaN(value) || value < min) {
      value = min
    }
    e.target.value = value
    setSettings(prev => ({ ...prev, [key]: value }))
    showToast(`${label} set to ${value}.`)
  }

  function handleBranchChange(e) {
    const value = e.target.value
    setSettings(prev => ({ ...prev, defaultForecastBranch: value }))
    showToast(`Default forecast branch set to ${value}.`)
  }

  function handleToggleChange(e, key, label) {
    const checked = e.target.checked
    setSettings(prev => ({ ...prev, [key]: checked }))
    showToast(`${label} ${checked ? 'enabled' : 'disabled'}.`)
  }

  // ==================== EXPORT ====================

  function handleExportCsv() {
    downloadFile('vet-vision-settings.csv', settingsToCsv(settings), 'text/csv')
    showToast('Settings exported as CSV.')
  }

  function handleExportJson() {
    downloadFile('vet-vision-settings.json', JSON.stringify(settings, null, 2), 'application/json')
    showToast('Settings exported as JSON.')
  }

  const summaryInitials = getInitialsFromName(adminProfile.name)

  return (
    <main className="content">
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
        <div className="settings-col">
          <div className="table-card settings-card">
            <h2>KPI thresholds</h2>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Low stock alert threshold</p>
                <p className="settings-row-desc">Flag item when stock falls below this quantity</p>
              </div>
              <input type="number" className="settings-number-input" min="0" defaultValue={DEFAULT_SETTINGS.lowStockThreshold}
                onBlur={(e) => handleNumberBlur(e, 'lowStockThreshold', 'Low stock alert threshold', 0)} />
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">High demand threshold</p>
                <p className="settings-row-desc">Mark service as high demand above this count</p>
              </div>
              <input type="number" className="settings-number-input" min="0" defaultValue={DEFAULT_SETTINGS.highDemandThreshold}
                onBlur={(e) => handleNumberBlur(e, 'highDemandThreshold', 'High demand threshold', 0)} />
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Loyal customer visit count</p>
                <p className="settings-row-desc">Auto-tag patient owner as loyal after this many visits</p>
              </div>
              <input type="number" className="settings-number-input" min="0" defaultValue={DEFAULT_SETTINGS.loyalVisitCount}
                onBlur={(e) => handleNumberBlur(e, 'loyalVisitCount', 'Loyal customer visit count', 0)} />
            </div>
          </div>

          <div className="table-card settings-card">
            <h2>Forecast parameters</h2>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Moving average window</p>
                <p className="settings-row-desc">Number of past months to average for forecast</p>
              </div>
              <input type="number" className="settings-number-input" min="1" defaultValue={DEFAULT_SETTINGS.movingAverageWindow}
                onBlur={(e) => handleNumberBlur(e, 'movingAverageWindow', 'Moving average window', 1)} />
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Forecast horizon</p>
                <p className="settings-row-desc">How many months ahead to predict demand</p>
              </div>
              <input type="number" className="settings-number-input" min="1" defaultValue={DEFAULT_SETTINGS.forecastHorizon}
                onBlur={(e) => handleNumberBlur(e, 'forecastHorizon', 'Forecast horizon', 1)} />
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Default forecast branch</p>
                <p className="settings-row-desc">Branch to show by default on forecast screen</p>
              </div>
              <div className="select-wrapper settings-select-wrapper">
                <select defaultValue={DEFAULT_SETTINGS.defaultForecastBranch} onChange={handleBranchChange}>
                  <option>All Branches</option>
                  <option>Ibaan</option>
                  <option>San Jose</option>
                </select>
                <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-col">
          <div className="table-card settings-card">
            <h2>Notifications &amp; backup</h2>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Low stock email alerts</p>
                <p className="settings-row-desc">Send admin email when item hits threshold</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={DEFAULT_SETTINGS.lowStockEmailAlerts}
                  onChange={(e) => handleToggleChange(e, 'lowStockEmailAlerts', 'Low stock email alerts')} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Follow-up reminders</p>
                <p className="settings-row-desc">Notify staff of patients due for follow-up</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={DEFAULT_SETTINGS.followUpReminders}
                  onChange={(e) => handleToggleChange(e, 'followUpReminders', 'Follow-up reminders')} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <p className="settings-row-title">Auto daily backup</p>
                <p className="settings-row-desc">Automatically back up database at midnight</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={DEFAULT_SETTINGS.autoDailyBackup}
                  onChange={(e) => handleToggleChange(e, 'autoDailyBackup', 'Auto daily backup')} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-row settings-row-backup">
              <div className="settings-row-label">
                <p className="settings-row-title">Manual backup &amp; export</p>
                <p className="settings-row-desc">Download full system data as CSV or JSON</p>
              </div>
              <div className="settings-backup-actions">
                <button type="button" className="settings-outline-btn" onClick={handleExportCsv}>Export CSV</button>
                <button type="button" className="settings-outline-btn" onClick={handleExportJson}>Export JSON</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Update admin information modal */}
      <div className={`modal-overlay${modalStep ? ' show' : ''}`} onClick={closeAdminEditModal}>
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
                  <button type="submit" className="settings-primary-btn">Save changes</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
