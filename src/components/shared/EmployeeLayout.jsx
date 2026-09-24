import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useSidebarToggle } from './useSidebarToggle'
import '../../styles/admin/dashboard.css'
import '../../styles/employee/employee.css'

export default function EmployeeLayout() {
  const sidebar = useSidebarToggle()

  return (
    <>
      <div className={`sidebar-overlay${sidebar.open ? ' show' : ''}`} onClick={sidebar.close}></div>
      <div className="dashboard-container">
        <Sidebar role="employee" open={sidebar.open} onNavigate={sidebar.close} />
        <div className="main-area">
          <Topbar role="employee" onToggleSidebar={sidebar.toggle} />
          <Outlet />
        </div>
      </div>
    </>
  )
}
