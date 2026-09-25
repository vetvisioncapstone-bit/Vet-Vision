import React, { useEffect, useRef } from 'react'

// The overlay behind every modal, made accessible: it is a labelled dialog for screen readers, moves focus into the
// modal when it opens, keeps Tab inside it, closes on Escape, and puts focus back where it was. A modal that is closed
// is hidden from the accessibility tree and cannot be tabbed into (see the visibility rule on .modal-overlay).
//
//   <Dialog open={isOpen} onClose={close} label="Edit patient"> ...the .modal element... </Dialog>
//
// `className` is the overlay's base class ('modal-overlay' unless the page styles its own).

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])'
const open_ = [] // dialogs currently open, oldest first: only the newest reacts to Escape and Tab

const visible = (el) => el.offsetParent !== null

export default function Dialog({ open, onClose, label, className = 'modal-overlay', children }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const el = ref.current
    const opener = document.activeElement
    open_.push(el)

    // Focus the first form field, else the first control, else the dialog itself. The overlay is already visible
    // here (the "show" class removes visibility:hidden at once), so this needs no wait.
    const target = [...el.querySelectorAll(FIELD)].find(visible) || [...el.querySelectorAll(FOCUSABLE)].find(visible) || el
    target.focus({ preventScroll: true })

    const onKey = (e) => {
      if (open_[open_.length - 1] !== el) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll(FOCUSABLE)].filter(visible)
        if (!items.length) { e.preventDefault(); return }
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)

    return () => {
      document.removeEventListener('keydown', onKey, true)
      open_.splice(open_.indexOf(el), 1)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <div
      ref={ref}
      className={`${className}${open ? ' show' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-hidden={open ? undefined : true}
      tabIndex={-1}
      onClick={() => closeRef.current?.()}
    >
      {children}
    </div>
  )
}
