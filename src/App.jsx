import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RequireRole from './components/shared/RequireRole'
import AdminLayout from './components/shared/AdminLayout'
import EmployeeLayout from './components/shared/EmployeeLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminSalesAnalytics from './pages/admin/SalesAnalytics'
import AdminInventory from './pages/admin/Inventory'
import AdminForecasting from './pages/admin/Forecasting'
import AdminEvents from './pages/admin/Events'
import AdminReports from './pages/admin/Reports'
import AdminPatients from './pages/admin/Patients'
import AdminUserManagement from './pages/admin/UserManagement'
import AdminSystemSettings from './pages/admin/SystemSettings'
import EmployeeDashboard from './pages/employee/Dashboard'
import EmployeeFeed from './pages/employee/Feed'
import EmployeeInventory from './pages/employee/Inventory'
import EmployeePatients from './pages/employee/Patients'
import EmployeeSales from './pages/employee/Sales'
import CustomerApp from './pages/customer/CustomerApp'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="sales-analytics" element={<AdminSalesAnalytics />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="forecasting" element={<AdminForecasting />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="patients" element={<AdminPatients />} />
          <Route path="user-management" element={<AdminUserManagement />} />
          <Route path="system-settings" element={<AdminSystemSettings />} />
        </Route>

        <Route path="/employee" element={<RequireRole role="employee"><EmployeeLayout /></RequireRole>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<EmployeeDashboard />} />
          <Route path="feed" element={<EmployeeFeed />} />
          <Route path="inventory" element={<EmployeeInventory />} />
          <Route path="patients" element={<EmployeePatients />} />
          <Route path="sales" element={<EmployeeSales />} />
        </Route>

        <Route path="/customer/*" element={<CustomerApp />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
