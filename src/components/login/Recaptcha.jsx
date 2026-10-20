import React, { useEffect, useRef, useState } from 'react'

// Google reCAPTCHA v2 ("I'm not a robot"): a check that the person signing in is human. It hands us a one-time token
// that the server verifies with Google. Without VITE_RECAPTCHA_SITE_KEY it renders nothing (development).
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY
const SCRIPT = 'https://www.google.com/recaptcha/api.js?render=explicit'

export const recaptchaEnabled = Boolean(SITE_KEY)

let loading = null
function loadScript() {
  loading ||= new Promise((resolve, reject) => {
    const ready = () => window.grecaptcha.ready(resolve)
    if (window.grecaptcha?.ready) return ready()
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = ready
    s.onerror = () => { loading = null; reject(new Error('reCAPTCHA did not load')) }
    document.head.appendChild(s)
  })
  return loading
}

// onToken('') means "no valid token right now" (expired or errored). A token works once, so after a failed submit
// the form changes this component's `key`, which mounts a fresh widget and a fresh token.
export default function Recaptcha({ onToken }) {
  const box = useRef(null)
  const report = useRef(onToken)
  report.current = onToken
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!SITE_KEY) return undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return
        window.grecaptcha.render(box.current, {
          sitekey: SITE_KEY,
          theme: 'light', // the sign-in card is always white
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(''),
          'error-callback': () => report.current(''),
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true } // the widget goes with its box; a new key mounts a new box
  }, [])

  if (!SITE_KEY) return null
  return (
    <div className="recaptcha">
      {failed
        ? <p className="login-alert" role="alert">The security check could not load. Check your connection and reload the page.</p>
        : <div ref={box} />}
    </div>
  )
}
