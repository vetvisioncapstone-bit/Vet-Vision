import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  salesAnalytics: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17 9 11 13 15 21 7" /><path d="M15 7h6v6" /></svg>,
  inventory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></svg>,
  forecasting: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  events: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10" /><path d="M12 20V4" /><path d="M20 20v-7" /></svg>,
  patients: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.3" /><circle cx="12" cy="4.5" r="2.3" /><circle cx="17" cy="7" r="2.3" /><path d="M12 12c-3.5 0-6.5 2.4-6.5 5.4 0 2 1.7 3.1 3.6 2.4.9-.3 1.9-.5 2.9-.5s2 .2 2.9.5c1.9.7 3.6-.4 3.6-2.4C18.5 14.4 15.5 12 12 12Z" /></svg>,
  userManagement: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  systemSettings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  feed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
  sales: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
}

const ADMIN_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
      { to: '/admin/sales-analytics', label: 'Sales analytics', icon: ICONS.salesAnalytics },
      { to: '/admin/inventory', label: 'Inventory', icon: ICONS.inventory },
      { to: '/admin/forecasting', label: 'Forecasting', icon: ICONS.forecasting },
      { to: '/admin/events', label: 'Events', icon: ICONS.events }
    ]
  },
  {
    label: 'Reports',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: ICONS.reports },
      { to: '/admin/patients', label: 'Patients', icon: ICONS.patients }
    ]
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin/user-management', label: 'User management', icon: ICONS.userManagement },
      { to: '/admin/system-settings', label: 'System settings', icon: ICONS.systemSettings }
    ]
  }
]

const EMPLOYEE_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/employee/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
      { to: '/employee/feed', label: 'Feed', icon: ICONS.feed },
      { to: '/employee/sales', label: 'Sales', icon: ICONS.sales },
      { to: '/employee/inventory', label: 'Inventory', icon: ICONS.inventory },
      { to: '/employee/patients', label: 'Patients', icon: ICONS.patients }
    ]
  }
]

export default function Sidebar({ role, open, onNavigate }) {
  const sections = role === 'admin' ? ADMIN_SECTIONS : EMPLOYEE_SECTIONS
  const { clearSession } = useSession()
  const navigate = useNavigate()

  function handleLogout(e) {
    e.preventDefault()
    clearSession()
    navigate('/')
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
      <div className="sidebar-logo">
        <img src="/Images/VET%20Vision.png" alt="Vet Vision logo" className="sidebar-logo-img logo-expanded" />
        <img src="/Images/EcovetLogo%201.png" alt="Vet Vision icon" className="sidebar-logo-icon logo-collapsed" />
      </div>

      <nav className="sidebar-nav">
        {sections.map(section => (
          <div className="nav-section" key={section.label}>
            <p className="nav-label">{section.label}</p>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                data-page={item.label}
                onClick={onNavigate}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <a href="/" className="logout-link" id="logoutBtn" onClick={handleLogout}>
        {ICONS.logout}
        <span>Log out</span>
      </a>
    </aside>
  )
}
