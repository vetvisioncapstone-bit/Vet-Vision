// Bell icon + notifications empty-state panel, ported verbatim from customer/index.html.

import { BellIcon, CloseIcon } from "./icons";

export default function NotificationButton({ open, onToggle, onClose }) {
  return (
    <div className="notif">
      <button
        type="button"
        className={`topbar__notif ${open ? "topbar__notif--active" : ""}`}
        onClick={onToggle}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon />
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
            <div className="empty-state">
              <span className="empty-state__icon"><BellIcon /></span>
              <p className="empty-state__title">No notifications yet</p>
              <p className="empty-state__text">
                You'll see clinic updates and reminders here once this is connected.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
