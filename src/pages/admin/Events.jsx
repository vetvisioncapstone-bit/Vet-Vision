import React, { useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEventPosts, useEventAvailability } from '../../hooks/useEvents'
import { errorMessage } from '../../api/client'
import { useToast } from '../../components/shared/Toast'
import { getInitialsFromName } from '../../utils/initials'
import '../../styles/admin/events.css'

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
  if (photo) {
    return <img src={photo} alt={name} className="avatar-photo-img" />
  }
  return getInitialsFromName(name)
}

export default function Events() {
  const { user } = useAuth()
  const profile = { name: user?.name || '', photo: user?.photo || null }
  const showToast = useToast()

  const { items: posts, loading: postsLoading, create: createPost, remove: removePost } = useEventPosts()
  const { availability, setState: setAvailabilityState } = useEventAvailability()
  const [busy, setBusy] = useState(false)

  const [composerText, setComposerText] = useState('')
  const [composerPhoto, setComposerPhoto] = useState(null)
  const composerPhotoInputRef = useRef(null)

  const [selectedBranch, setSelectedBranch] = useState('Ibaan')
  const [calendarViewDate, setCalendarViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  // ==================== COMPOSER ====================

  const canPost = composerText.trim().length > 0 || Boolean(composerPhoto)

  function handleComposerPhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      setComposerPhoto(ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveComposerPhoto() {
    setComposerPhoto(null)
    if (composerPhotoInputRef.current) composerPhotoInputRef.current.value = ''
  }

  function resetComposer() {
    setComposerText('')
    setComposerPhoto(null)
    if (composerPhotoInputRef.current) composerPhotoInputRef.current.value = ''
  }

  async function handlePost() {
    const text = composerText.trim()
    if ((!text && !composerPhoto) || busy) return

    setBusy(true)
    try {
      await createPost({ text, photo: composerPhoto })
      resetComposer()
      showToast('Announcement posted.')
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // ==================== FEED ====================

  async function handleDeletePost(id) {
    if (busy) return
    if (!confirm('Delete this announcement?')) return
    setBusy(true)
    try {
      await removePost(id)
      showToast('Announcement deleted.')
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // ==================== AVAILABILITY CALENDAR ====================

  const branchAvailability = availability[selectedBranch] || {}

  const calendarCells = useMemo(() => {
    const year = calendarViewDate.getFullYear()
    const month = calendarViewDate.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const todayIso = toIsoDate(new Date())

    const cells = []
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ blank: true, key: `blank-${i}` })
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(new Date(year, month, day))
      cells.push({
        blank: false,
        key: iso,
        day,
        iso,
        isToday: iso === todayIso,
        state: branchAvailability[iso]
      })
    }
    return cells
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarViewDate, branchAvailability])

  const closureEntries = useMemo(() => {
    const todayIso = toIsoDate(new Date())
    return Object.entries(branchAvailability)
      .filter(([date]) => date >= todayIso)
      .sort(([a], [b]) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchAvailability])

  async function handleDateClick(iso) {
    if (busy) return
    const current = branchAvailability[iso]
    const nextState = !current ? 'unavailable' : current === 'unavailable' ? 'available' : null

    setBusy(true)
    try {
      await setAvailabilityState(selectedBranch, iso, nextState)
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

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
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Events</h1>
      </div>

      <div className="events-layout">
        {/* Announcement feed */}
        <div className="events-feed-col">
          <div className="table-card composer-card">
            <div className="composer-top">
              <span className="composer-avatar" id="composerAvatar">
                <Avatar name={profile.name} photo={profile.photo} />
              </span>
              <textarea
                id="postComposerInput"
                className="composer-input"
                placeholder="Share an announcement or update with pet owners…\"
                rows="2"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
              />
            </div>

            {composerPhoto && (
              <div className="composer-photo-wrap" id="composerPhotoWrap">
                <img className="composer-photo-preview" id="composerPhotoPreview" alt="Attached photo" src={composerPhoto} />
                <button type="button" className="composer-photo-remove" id="composerPhotoRemoveBtn" aria-label="Remove photo" onClick={handleRemoveComposerPhoto}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )}

            <div className="composer-actions">
              <label className="composer-photo-btn" htmlFor="composerPhotoInput">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                <span>Photo</span>
              </label>
              <input type="file" id="composerPhotoInput" accept="image/*" hidden ref={composerPhotoInputRef} onChange={handleComposerPhotoChange} />
              <button type="button" className="composer-post-btn" id="composerPostBtn" disabled={!canPost || busy} onClick={handlePost}>Post</button>
            </div>
          </div>

          <div className="events-feed" id="eventsFeed">
            {postsLoading && posts.length === 0 ? (
              <p className="empty-state">Loading…</p>
            ) : posts.length === 0 ? (
              <p className="empty-state">No announcements yet. Share an update above.</p>
            ) : posts.map(post => (
              <div className="post-card" key={post.id} data-id={post.id}>
                <div className="post-head">
                  <span className="post-avatar"><Avatar name={post.authorName} photo={post.authorPhoto} /></span>
                  <div className="post-head-text">
                    <p className="post-author">{post.authorName}</p>
                    <p className="post-timestamp">{formatTimestamp(post.createdAt)}</p>
                  </div>
                  <button type="button" className="post-delete-btn" data-id={post.id} aria-label="Delete post" disabled={busy} onClick={() => handleDeletePost(post.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
                {post.text && <p className="post-text">{post.text}</p>}
                {post.photo && <img className="post-photo" src={post.photo} alt="Announcement photo" />}
              </div>
            ))}
          </div>
        </div>

        {/* Clinic availability */}
        <div className="events-side-col">
          <div className="table-card availability-card">
            <div className="availability-branch-row">
              <label className="form-label" htmlFor="eventsBranchSelect">Clinic</label>
              <div className="select-wrapper">
                <select id="eventsBranchSelect" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  <option value="Ibaan">Ibaan</option>
                  <option value="San Jose">San Jose</option>
                </select>
                <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>

            <div className="availability-header">
              <button type="button" className="cal-nav-btn" id="calPrevBtn" aria-label="Previous month" onClick={goPrevMonth}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <h2 id="calMonthLabel">{calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <button type="button" className="cal-nav-btn" id="calNextBtn" aria-label="Next month" onClick={goNextMonth}>
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
            <div className="calendar-grid" id="calendarGrid">
              {calendarCells.map(cell => cell.blank ? (
                <div className="cal-cell" key={cell.key}></div>
              ) : (
                <div className="cal-cell" key={cell.key}>
                  <button
                    type="button"
                    className={`cal-day-btn${cell.isToday ? ' is-today' : ''}${cell.state === 'unavailable' ? ' is-unavailable' : ''}${cell.state === 'available' ? ' is-available' : ''}`}
                    data-date={cell.iso}
                    disabled={busy}
                    onClick={() => handleDateClick(cell.iso)}
                  >
                    {cell.day}
                  </button>
                </div>
              ))}
            </div>

            <p className="availability-hint">Click a date to cycle: unset &rarr; unavailable &rarr; available &rarr; unset.</p>
          </div>

          <div className="table-card closures-card">
            <h2 id="closuresListTitle">Upcoming changes — {selectedBranch}</h2>
            <ul className="closures-list" id="closuresList">
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
