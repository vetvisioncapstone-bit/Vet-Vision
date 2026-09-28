import React, { useEffect, useRef, useState } from 'react'

// Cloudflare Turnstile: a (usually invisible) check that the person signing in is human. It hands us a one-time
// token that the server verifies with Cloudflare. Without VITE_TURNSTILE_SITE_KEY it renders nothing (development).
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export const turnstileEnabled = Boolean(SITE_KEY)

let loading = null
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = resolve
    s.onerror = () => { loading = null; reject(new Error('Turnstile did not load')) }
    document.head.appendChild(s)
  })
  return loading
}

// onToken('') means "no valid token right now" (expired or errored). A token works once, so after a failed submit
// the form changes this component's `key`, which mounts a fresh widget and a fresh token.
export default function Turnstile({ onToken, action }) {
  const box = useRef(null)
  const widget = useRef(null)
  const report = useRef(onToken)
  report.current = onToken
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!SITE_KEY) return undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'light', // the sign-in card is always white
          size: 'flexible',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(''),
          'error-callback': () => report.current(''),
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (widget.current !== null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [action])

  if (!SITE_KEY) return null
  return (
    <div className="turnstile">
      {failed
        ? <p className="login-alert" role="alert">The security check could not load. Check your connection and reload the page.</p>
        : <div ref={box} />}
    </div>
  )
}
