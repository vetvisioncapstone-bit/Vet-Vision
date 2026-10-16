import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useResource, invalidate } from '../../api/store'
import { useApprovalRequests } from '../../hooks/useRequests'
import { useToast } from '../../components/shared/Toast'
import { useConfirm } from '../../components/shared/ConfirmDialog'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import '../../styles/admin/requests.css'

// Staff requests in one place: the delete requests and restock heads-ups staff send, with who asked, when, what
// for, a link to the item, and the admin's decision. The bell shows the pending ones and links here.
const KIND = {
  'inventory-product': 'Delete product',
  patient: 'Delete patient record',
  consultation: 'Delete consultation',
  restock: 'Restock'
}
const STATUS = { pending: 'Pending', approved: 'Approved', denied: 'Denied', dismissed: 'Dismissed' }

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

// A pending restock opens the Receive form for that branch's item (and the request is marked done once received);
// anything else opens the item.
const restockLink = (r) => `/admin/inventory?item=${encodeURIComponent(r.targetId)}&receive=1&request=${r.id}`

function itemLink(r) {
  if (r.type === 'restock' && r.status === 'pending') return restockLink(r)
  if (r.type === 'inventory-product' || r.type === 'restock') return `/admin/inventory?item=${encodeURIComponent(r.targetId)}`
  return r.petId ? `/admin/patients?followUp=${encodeURIComponent(r.petId)}` : null
}

export default function Requests() {
  const [searchParams] = useSearchParams()
  const focusId = Number(searchParams.get('id')) || null
  const [tab, setTab] = useState('pending')
  const { data, loading, error, reload } = useResource('/requests/?all=1', { refreshMs: 30000 })
  const { approve, deny, dismiss } = useApprovalRequests()
  const [ask, confirmBox] = useConfirm()
  const showToast = useToast()
  const [busy, setBusy] = useState(null)

  const all = data || []
  const rows = useMemo(() => all.filter((r) => (tab === 'pending' ? r.status === 'pending' : true)), [all, tab])
  const pendingCount = all.filter((r) => r.status === 'pending').length

  useEffect(() => { // from the bell: show the request, even if it was already handled
    if (focusId && all.length && !all.some((r) => r.id === focusId && r.status === 'pending')) setTab('all')
  }, [focusId, all])
  useEffect(() => {
    if (focusId) document.getElementById(`request-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [focusId, rows])

  async function act(r, action) {
    if (action === 'approve' && !(await ask({
      title: `${KIND[r.type]}?`,
      message: <p>Approving deletes <strong>{r.label}</strong> as {r.requestedByName} asked. This cannot be undone.</p>,
      confirmLabel: 'Approve and delete'
    }))) return
    setBusy(r.id)
    try {
      await { approve, deny, dismiss }[action](r.id)
      if (action === 'approve') await invalidate('/analytics/') // a deleted visit or product changes the figures
      showToast({ approve: 'Request approved.', deny: 'Request denied.', dismiss: 'Request dismissed.' }[action])
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Staff requests</h1>
      </div>

      <div className="request-tabs" role="tablist" aria-label="Requests">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pending{pendingCount ? ` (${pendingCount})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          All requests
        </button>
      </div>

      {error && <div className="load-error">Could not load the requests. <button type="button" className="link-btn" onClick={reload}>Try again</button></div>}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Requested</th><th>Request</th><th>Item</th><th>Branch</th><th>By</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan="7" className="empty-state">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">{tab === 'pending' ? 'No pending requests.' : 'No requests yet.'}</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} id={`request-${r.id}`} className={r.id === focusId ? 'request-focus' : ''}>
                  <td>{when(r.requestedAt)}</td>
                  <td>{KIND[r.type] || r.type}{r.extra?.reason ? <small className="muted-inline"> · {r.extra.reason}</small> : null}</td>
                  <td>{itemLink(r) ? <Link to={itemLink(r)}>{r.label}</Link> : r.label}</td>
                  <td>{r.branch || '—'}</td>
                  <td>{r.requestedByName}</td>
                  <td>
                    <span className={`request-status status-${r.status}`}>{STATUS[r.status] || r.status}</span>
                    {r.resolvedAt && <small className="muted-inline"> {r.resolvedByName ? `by ${r.resolvedByName}, ` : ''}{when(r.resolvedAt)}</small>}
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <div className="request-actions">
                        {r.type === 'restock' ? (
                          <>
                            <Link className="notif-action-btn approve" to={restockLink(r)} title="Open the Receive form for this item">Restock</Link>
                            <button type="button" className="notif-action-btn" disabled={busy === r.id} onClick={() => act(r, 'dismiss')}>Done</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="notif-action-btn approve" disabled={busy === r.id} onClick={() => act(r, 'approve')}>Approve</button>
                            <button type="button" className="notif-action-btn deny" disabled={busy === r.id} onClick={() => act(r, 'deny')}>Deny</button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {confirmBox}
    </main>
  )
}
