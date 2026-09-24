import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useNotifications } from '../../hooks/useNotifications'
import { getInitialsFromName } from '../../utils/initials'
import { useToast } from './Toast'
import { errorMessage } from '../../api/client'

function formatDate(isoString) {
  if (!isoString) return '—'
  const [year, month, day] = isoString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function escapeText(str) {
  return str
}

export default function Topbar({ role, onToggleSidebar }) {
  const navigate = useNavigate()
  const { session, clearSession } = useSession()
  const showToast = useToast()
  const notif = useNotifications()

  const [aboutOpen, setAboutOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const displayName = session?.name || ''
  const displayPhoto = session?.photo || null

  async function runAction(fn, id) {
    try {
      await fn(id)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }
  const initials = getInitialsFromName(displayName)

  function closeAllPopovers() {
    setNotifOpen(false)
    setProfileOpen(false)
  }

  function toggleNotif() {
    const opening = !notifOpen
    closeAllPopovers()
    setNotifOpen(opening)
    if (opening) {
      notif.markFollowUpsSeen()
    }
  }

  function toggleProfile() {
    const opening = !profileOpen
    closeAllPopovers()
    setProfileOpen(opening)
  }

  function handleLogout(e) {
    e.preventDefault()
    clearSession()
    navigate('/')
  }

  function handleFollowUpClick(patientId) {
    closeAllPopovers()
    const destination = role === 'employee'
      ? `/employee/patients?followUp=${patientId}`
      : `/admin/patients?followUp=${patientId}`
    navigate(destination)
  }

  function handleProfileClick() {
    if (role === 'admin') {
      closeAllPopovers()
      navigate('/admin/system-settings?openAdminEdit=1')
    }
  }

  return (
    <header className="topbar" onClick={closeAllPopovers}>
      <button className="hamburger-btn" id="hamburgerBtn" aria-label="Toggle menu" onClick={(e) => { e.stopPropagation(); onToggleSidebar() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
      </button>
      <div className="topbar-spacer"></div>
      <div className="topbar-actions">
        <button className="icon-btn" id="aboutBtn" aria-label="About" onClick={(e) => { e.stopPropagation(); closeAllPopovers(); setAboutOpen(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        </button>

        <div className={`about-modal-overlay${aboutOpen ? ' show' : ''}`} onClick={() => setAboutOpen(false)}>
          <div className="about-modal" onClick={(e) => e.stopPropagation()}>
            <button className="about-modal-close" aria-label="Close" onClick={() => setAboutOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <div className="about-modal-logos">
              <img src="/Images/VET%20Vision.png" alt="Vet Vision logo" className="about-modal-logo" />
            </div>
            <p className="about-modal-title">About VET Vision</p>
            <p className="about-text">VET Vision is a centralized web-based business analytics dashboard built for EcoVet Animal Clinic. It brings sales, inventory, and patient records from both branches into one platform so management and staff can monitor performance, track stock, and make faster, data-driven decisions.</p>
            <ul className="about-list">
              <li>Real-time KPI monitoring and branch performance comparison</li>
              <li>Sales trend analysis and demand forecasting</li>
              <li>Centralized inventory and patient record management</li>
              <li>AI-assisted analytics and chatbot support for admins</li>
            </ul>
            <p className="about-text">Developed as a Capstone Project by Bedar, Jomar Ichiro M.; Dimaculangan, Johann Jay C.; and Macalalad, Roldan &mdash; BS Information Technology (Business Analytics), Batangas State University &ndash; The National Engineering University, Alangilan Campus. May 2026.</p>
            <p className="about-modal-title about-subtitle">About EcoVet Animal Clinic</p>
            <p className="about-text">EcoVet Animal Clinic is a growing veterinary practice offering animal consultation and treatment, grooming, and retail pet products. It currently operates two branches &mdash; in Ibaan and San Jose, Batangas &mdash; serving pet owners across both communities.</p>
          </div>
        </div>

        <div className="popover-wrapper">
          <button className="icon-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded={notifOpen} onClick={(e) => { e.stopPropagation(); toggleNotif() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {notif.totalCount > 0 && <span className="notif-dot"></span>}
          </button>
          <div className={`popover notif-popover${notifOpen ? ' show' : ''}`} onClick={(e) => e.stopPropagation()}>
            <p className="popover-title">Notifications</p>
            <div className="notif-list">
              {notif.totalCount === 0 && <p className="empty-state">No notifications yet.</p>}

              {notif.deleteRequests.map(r => (
                <div className="notif-item notif-item-request" key={r.id}>
                  <p className="notif-item-title">Delete request: {escapeText(r.label)}</p>
                  <p className="notif-item-sub">{escapeText(r.requestedByName)}{r.requestedByBranch ? ` · ${escapeText(r.requestedByBranch)}` : ''}</p>
                  <div className="notif-item-actions">
                    <button type="button" className="notif-action-btn approve" onClick={() => runAction(notif.approveDeleteRequest, r.id)}>Approve</button>
                    <button type="button" className="notif-action-btn deny" onClick={() => runAction(notif.denyDeleteRequest, r.id)}>Deny</button>
                  </div>
                </div>
              ))}

              {notif.restockRequests.map(r => (
                <div className="notif-item notif-item-request" key={r.id}>
                  <p className="notif-item-title">Restock requested: {escapeText(r.productName)}</p>
                  <p className="notif-item-sub">{escapeText(r.requestedByName)}{r.branch ? ` · ${escapeText(r.branch)}` : ''}</p>
                  <div className="notif-item-actions">
                    <button type="button" className="notif-action-btn" onClick={() => runAction(notif.dismissRestockRequest, r.id)}>Dismiss</button>
                  </div>
                </div>
              ))}

              {notif.followUps.map(p => (
                <div className={`notif-item${notif.seenKeys.has(notif.followUpSeenKey(p)) ? ' is-seen' : ''}`} key={p.id}>
                  <button type="button" className="notif-item-body" onClick={() => handleFollowUpClick(p.id)}>
                    <p className="notif-item-title">{escapeText(p.petName)} needs a follow-up{p.followUpNote ? `: ${escapeText(p.followUpNote)}` : ''}</p>
                    <p className="notif-item-sub">{escapeText(p.ownerName)} {escapeText(p.ownerSurname)} · Last visit {formatDate(notif.getPatientLastVisitDate(p))}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="popover-wrapper">
          <button className="avatar" aria-label="Account menu" aria-haspopup="true" aria-expanded={profileOpen} onClick={(e) => { e.stopPropagation(); toggleProfile() }}>
            {displayPhoto ? <img src={displayPhoto} alt={displayName} className="avatar-photo-img" /> : initials}
          </button>
          <div className={`popover profile-popover${profileOpen ? ' show' : ''}`} onClick={(e) => e.stopPropagation()}>
            {role === 'admin' ? (
              <a className="profile-info" href="/admin/system-settings?openAdminEdit=1" onClick={(e) => { e.preventDefault(); handleProfileClick() }}>
                <div className="profile-avatar">{displayPhoto ? <img src={displayPhoto} alt={displayName} className="avatar-photo-img" /> : initials}</div>
                <div>
                  <p className="profile-name">{displayName}</p>
                  <p className="profile-role">Owner/Admin</p>
                </div>
              </a>
            ) : (
              <div className="profile-info">
                <div className="profile-avatar">{displayPhoto ? <img src={displayPhoto} alt={displayName} className="avatar-photo-img" /> : initials}</div>
                <div>
                  <p className="profile-name">{displayName}</p>
                  <p className="profile-role">Staff — {session ? session.branch : ''}</p>
                </div>
              </div>
            )}
            <a href="/" className="popover-logout" onClick={handleLogout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              <span>Log out</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
