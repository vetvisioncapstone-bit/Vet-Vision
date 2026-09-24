import React, { useMemo, useState } from 'react'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useEventPosts, useEventAvailability } from '../../hooks/useEvents'
import { getInitialsFromName } from '../../utils/auth'
import '../../styles/admin/events.css'

// ==================== HELPERS ====================
// Ported from employee-feed.js - this page only reads the admin Events
// keys (vvEventsPosts / vvEventsAvailability), it never writes to them.

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateLabel(isoString) {
  const [year, month, day] = isoString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Avatar({ name, photo }) {
  if (photo) return <img src={photo} alt={name} className="avatar-photo-img" />
  return getInitialsFromName(name)
}

export default function Feed() {
  const { branch } = useEmployeeContext()
  const [posts] = useEventPosts()
  const [availability] = useEventAvailability()

  const [calendarViewDate, setCalendarViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const branchAvailability = availability[branch] || {}
  const todayIso = toIsoDate(new Date())
  const isClosed = branchAvailability[todayIso] === 'unavailable'

  const calendarCells = useMemo(() => {
    const year = calendarViewDate.getFullYear()
    const month = calendarViewDate.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells = []
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ blank: true, key: `blank-${i}` })
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(new Date(year, month, day))
      cells.push({ blank: false, key: iso, day, iso, isToday: iso === todayIso, state: branchAvailability[iso] })
    }
    return cells
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarViewDate, branchAvailability])

  const closureEntries = useMemo(() => {
    return Object.entries(branchAvailability)
      .filter(([date]) => date >= todayIso)
      .sort(([a], [b]) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchAvailability])

  function goPrevMonth() {
    setCalendarViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() - 1)
      return nd
    })
  }

  function goNextMonth() {
    setCalendarViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + 1)
      return nd
    })
  }

  return (
    <main className="content">
      <div className="content-header">
        <h1>My Branch - {branch}</h1>
      </div>

      <div className="events-layout">
        {/* Announcement feed */}
        <div className="events-feed-col">
          <div className={`table-card clinic-status-card${isClosed ? ' is-closed' : ''}`}>
            <span className="clinic-status-dot"></span>
            <div className="clinic-status-text">
              <p className="clinic-status-label">{isClosed ? 'Clinic is Closed Today' : 'Clinic is Open Today'}</p>
              <p className="clinic-status-sub">{isClosed ? 'Marked unavailable by the admin for today.' : 'No closures scheduled for today.'}</p>
            </div>
          </div>

          <div className="events-feed">
            {posts.length === 0 ? (
              <p className="empty-state">No announcements yet.</p>
            ) : posts.map(post => (
              <div className="post-card" key={post.id}>
                <div className="post-head">
                  <span className="post-avatar"><Avatar name={post.authorName} photo={post.authorPhoto} /></span>
                  <div className="post-head-text">
                    <p className="post-author">{post.authorName}</p>
                    <p className="post-timestamp">{formatTimestamp(post.createdAt)}</p>
                  </div>
                </div>
                {post.text && <p className="post-text">{post.text}</p>}
                {post.photo && <img className="post-photo" src={post.photo} alt="Announcement photo" />}
              </div>
            ))}
          </div>
        </div>

        {/* Clinic availability (read-only) */}
        <div className="events-side-col">
          <div className="table-card availability-card">
            <div className="availability-header">
              <button type="button" className="cal-nav-btn" aria-label="Previous month" onClick={goPrevMonth}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <h2>{calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <button type="button" className="cal-nav-btn" aria-label="Next month" onClick={goNextMonth}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            <div className="availability-legend">
              <span><i className="cal-dot cal-dot-available"></i>Available</span>
              <span><i className="cal-dot cal-dot-unavailable"></i>Unavailable</span>
            </div>

            <div className="calendar-weekdays">
              <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div className="calendar-grid">
              {calendarCells.map(cell => cell.blank ? (
                <div className="cal-cell" key={cell.key}></div>
              ) : (
                <div className="cal-cell" key={cell.key}>
                  <span className={`cal-day-btn${cell.isToday ? ' is-today' : ''}${cell.state === 'unavailable' ? ' is-unavailable' : ''}${cell.state === 'available' ? ' is-available' : ''}`}>
                    {cell.day}
                  </span>
                </div>
              ))}
            </div>

            <p className="availability-hint">View-only - ask the admin to change a date's availability.</p>
          </div>

          <div className="table-card closures-card">
            <h2>Upcoming changes</h2>
            <ul className="closures-list">
              {closureEntries.length === 0 ? (
                <li className="empty-state">No dates marked yet.</li>
              ) : closureEntries.map(([date, state]) => (
                <li className="closure-item" key={date}>
                  <span className="closure-date">{formatDateLabel(date)}</span>
                  <span className={`closure-status ${state}`}>{state === 'unavailable' ? 'Unavailable' : 'Available'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
