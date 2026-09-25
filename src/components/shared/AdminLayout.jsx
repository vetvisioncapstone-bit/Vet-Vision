import React from 'react'
import { Outlet } from 'react-router-dom'
import SkipLink from './SkipLink'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ChatPanel from './ChatPanel'
import { useSidebarToggle } from './useSidebarToggle'
import '../../styles/admin/dashboard.css'

export default function AdminLayout() {
  const sidebar = useSidebarToggle()

  return (
    <>
      <SkipLink />
      <div className={`sidebar-overlay${sidebar.open ? ' show' : ''}`} onClick={sidebar.close}></div>
      <div className="dashboard-container">
        <Sidebar role="admin" open={sidebar.open} onNavigate={sidebar.close} />
        <div className="main-area">
          <Topbar role="admin" onToggleSidebar={sidebar.toggle} />
          <Outlet />
        </div>
      </div>
      <ChatPanel />
    </>
  )
}
