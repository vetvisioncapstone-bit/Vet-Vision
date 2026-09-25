import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RequireRole from './components/shared/RequireRole'
import ErrorBoundary from './components/shared/ErrorBoundary'
import AdminLayout from './components/shared/AdminLayout'
import EmployeeLayout from './components/shared/EmployeeLayout'
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminSalesAnalytics = lazy(() => import('./pages/admin/SalesAnalytics'))
const AdminInventory = lazy(() => import('./pages/admin/Inventory'))
const AdminForecasting = lazy(() => import('./pages/admin/Forecasting'))
const AdminEvents = lazy(() => import('./pages/admin/Events'))
const AdminReports = lazy(() => import('./pages/admin/Reports'))
const AdminPatients = lazy(() => import('./pages/admin/Patients'))
const AdminUserManagement = lazy(() => import('./pages/admin/UserManagement'))
const AdminSystemSettings = lazy(() => import('./pages/admin/SystemSettings'))
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard'))
const EmployeeFeed = lazy(() => import('./pages/employee/Feed'))
const EmployeeInventory = lazy(() => import('./pages/employee/Inventory'))
const EmployeePatients = lazy(() => import('./pages/employee/Patients'))
const EmployeeSales = lazy(() => import('./pages/employee/Sales'))
const CustomerApp = lazy(() => import('./pages/customer/CustomerApp'))

function App() {
  return (
    <Router>
      <ErrorBoundary>
      <Suspense fallback={<div className="skeleton" style={{ height: 120, margin: 24 }} />}>
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

        <Route path="/customer/*" element={<RequireRole role="customer"><CustomerApp /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </Router>
  )
}

export default App
