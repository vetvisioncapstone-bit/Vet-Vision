// Bell + notifications panel: reminders for the owner's pets (vet follow-ups, vaccine boosters) and the clinic's
// announcements. The badge counts what has not been opened yet.

import { useState } from "react";
import { BellIcon, CloseIcon } from "./icons";

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationButton({ open, onToggle, onClose, announcements, reminders, enabled = true }) {
  const unreadCount = announcements.unreadCount + reminders.unreadCount;
  // Keep the "new" highlight for the items that were unread when the panel opened.
  const [newIds, setNewIds] = useState(() => new Set());

  function handleToggle() {
    if (!open) {
      setNewIds(new Set([...announcements.unread.map((p) => `post-${p.id}`), ...reminders.unread.map((r) => r.id)]));
      announcements.markSeen();
      reminders.markSeen();
    }
    onToggle();
  }

  const nothing = announcements.items.length === 0 && reminders.items.length === 0;

  return (
    <div className="notif">
      <button
        type="button"
        className={`topbar__notif ${open ? "topbar__notif--active" : ""}`}
        onClick={handleToggle}
        aria-label={unreadCount && enabled ? `Notifications, ${unreadCount} new` : "Notifications"}
        aria-expanded={open}
      >
        <BellIcon />
        {enabled && unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="notif-scrim" onClick={onClose} />
          <div className="notif-panel">
            <div className="notif-panel__header">
              <p className="notif-panel__title">Notifications</p>
              <button type="button" className="notif-panel__close" onClick={onClose} aria-label="Close notifications">
                <CloseIcon />
              </button>
            </div>

            {!enabled ? (
              <div className="empty-state">
                <span className="empty-state__icon"><BellIcon /></span>
                <p className="empty-state__title">Notifications are off</p>
                <p className="empty-state__text">Turn them on in Settings to see reminders and clinic announcements here.</p>
              </div>
            ) : nothing ? (
              <div className="empty-state">
                <span className="empty-state__icon"><BellIcon /></span>
                <p className="empty-state__title">You're all caught up</p>
                <p className="empty-state__text">Reminders for your pets and updates from the clinic will show up here.</p>
              </div>
            ) : (
              <>
                {reminders.items.length > 0 && (
                  <>
                    <p className="notif-section-title">Reminders for your pets</p>
                    <ul className="notif-list">
                      {reminders.items.map((r) => (
                        <li key={r.id} className={`notif-item notif-item--reminder ${r.overdue ? "notif-item--overdue" : ""} ${newIds.has(r.id) ? "notif-item--new" : ""}`}>
                          <p className="notif-item__meta">{r.petName} · {r.title}</p>
                          <p className="notif-item__text">{r.text}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {announcements.items.length > 0 && (
                  <>
                    <p className="notif-section-title">Clinic announcements</p>
                    <ul className="notif-list">
                      {announcements.items.map((post) => (
                        <li key={post.id} className={`notif-item ${newIds.has(`post-${post.id}`) ? "notif-item--new" : ""}`}>
                          <p className="notif-item__meta">{post.authorName} · {formatWhen(post.createdAt)}</p>
                          {post.text && <p className="notif-item__text">{post.text}</p>}
                          {post.photo && <img className="notif-item__photo" src={post.photo} alt="" />}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
