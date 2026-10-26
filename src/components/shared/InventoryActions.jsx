import React from 'react'

// The inventory pages' row buttons and guide, shared by the admin and staff pages so both explain stock the same way:
// a delivery is received (adds to stock), an edit fixes details or corrects a miscount, a delete removes the item.
const ICONS = {
  receive: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M12 13v8" /><path d="m3 8 9 5 9-5" /></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>,
  delete: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>,
  request: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
}

// `needsStock` makes Receive the highlighted button on rows that are low or out of stock. Leave out onReceive or onEdit
// to hide that button (a position that may not use it).
export function RowActions({ product, needsStock, onReceive, onEdit, onDelete, deleteLabel = 'Delete', onRequest }) {
  return (
    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
      {onRequest && (
        <button type="button" className="act-btn" onClick={() => onRequest(product)} title="Tell the admin this item needs to be ordered">
          {ICONS.request}<span>Ask to restock</span>
        </button>
      )}
      {onReceive && (
        <button type="button" className={`act-btn act-receive${needsStock ? ' act-primary' : ''}`} onClick={() => onReceive(product)}
          title="A delivery arrived: add it to the stock" aria-label={`Receive a delivery of ${product.name}`}>
          {ICONS.receive}<span>Receive</span>
        </button>
      )}
      {onEdit && (
        <button type="button" className="act-btn" onClick={() => onEdit(product)}
          title="Change details, price, dates, or correct the count" aria-label={`Edit ${product.name}`}>
          {ICONS.edit}<span>Edit</span>
        </button>
      )}
      <button type="button" className="act-btn act-delete" onClick={() => onDelete(product)}
        title={deleteLabel === 'Delete' ? 'Remove this item from the branch' : 'Ask the admin to remove this item'} aria-label={`${deleteLabel} ${product.name}`}>
        {ICONS.delete}<span>{deleteLabel}</span>
      </button>
    </div>
  )
}

// One line above the staff table saying what each button is for (the admin page has its own, per branch).
export function ActionsGuide() {
  return (
    <ul className="actions-guide" aria-label="What the buttons do">
      <li><b>Ask to restock</b> tells the admin to order more.</li>
      <li><b>Receive</b> when a delivery arrives: it adds to the count.</li>
      <li><b>Edit</b> to change details or fix a wrong count.</li>
      <li><b>Ask to delete</b> sends the admin a request to remove an item.</li>
    </ul>
  )
}

// Under the Edit form's Quantity: what the save will do to the count, so a delivery is not entered as a correction.
export function QuantityChangeHint({ before, after }) {
  if (after === '' || after === null || after === undefined || Number(after) === Number(before)) {
    return <p className="field-hint">The count on the shelf. For a delivery, use <b>Receive</b> instead.</p>
  }
  const diff = Number(after) - Number(before)
  return (
    <p className="field-hint field-hint-change">
      {before} → {Number(after)} ({diff > 0 ? '+' : ''}{diff}). Saved as a count correction. If this is a delivery, use <b>Receive</b> instead.
    </p>
  )
}
