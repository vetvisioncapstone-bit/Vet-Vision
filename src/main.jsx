import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/shared/Toast'
import { AuthProvider } from './hooks/useAuth'
import './styles/index.css'

// The browser can restore a page from its back/forward cache without running any code. After signing out that
// would show the old screen, so a restored page is always reloaded (and then checks the sign-in afresh).
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
)
