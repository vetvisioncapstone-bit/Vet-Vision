import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null) // { message, actionLabel, actionFn }
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  const showToast = useCallback((message, actionLabel, actionFn) => {
    setToast({ message, actionLabel, actionFn })
    setVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), actionLabel ? 5000 : 2600)
  }, [])

  const handleAction = () => {
    if (toast?.actionFn) toast.actionFn()
    setVisible(false)
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast${visible ? ' show' : ''}`}>
        {toast && (
          <>
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button type="button" className="toast-action" onClick={handleAction}>
                {toast.actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
