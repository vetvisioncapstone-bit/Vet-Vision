// Keyboard support for elements that are clickable with a mouse (e.g. a whole table row that opens a record).
// Spread the result on the element: <tr tabIndex={0} onKeyDown={onActivate(open)} onClick={open}>.
// It only reacts when the row itself has focus, so keys pressed inside a button or link in the row are left alone.
export function onActivate(action) {
  return (e) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      action()
    }
  }
}
