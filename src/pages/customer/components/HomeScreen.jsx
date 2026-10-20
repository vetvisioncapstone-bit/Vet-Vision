// Main authenticated shell: renders the active "page" (home/calendar/records/settings),
// ported verbatim from customer/index.html.

import { useMemo, useState } from "react";
import { useAnnouncements, useClinicCalendar, useMyPets, useReminders } from "../../../hooks/useCustomerPortal";
import { toDateKey } from "../lib/dateUtils";
import { NAV_ITEMS } from "../nav";
import ClinicCalendar from "./ClinicCalendar";
import NotificationButton from "./NotificationButton";
import PetDetailModal from "./PetDetailModal";
import PetHistoryModal from "./PetHistoryModal";
import PetRegisterModal from "./PetRegisterModal";
import ToggleSwitch from "./ToggleSwitch";
import { ArrowRightIcon, ChevronRightIcon, MenuIcon, PawIcon, PetIcon } from "./icons";

export default function HomeScreen({ session, page, onOpenNav, darkMode, onToggleDarkMode, notifsEnabled, onToggleNotifs }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);
  const [selectedHistoryPet, setSelectedHistoryPet] = useState(null);
  const [registeringPet, setRegisteringPet] = useState(false);

  const email = session.email;
  const fullName = session.name || email;
  const firstName = useMemo(() => fullName.split(" ")[0] || "there", [fullName]);
  const initials = useMemo(
    () => fullName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
    [fullName]
  );

  const { pets, loading: petsLoading, error: petsError } = useMyPets();
  const announcements = useAnnouncements();
  const reminders = useReminders();

  const activeItem = useMemo(() => NAV_ITEMS.find((item) => item.id === page), [page]);

  const today = useMemo(() => new Date(), []);
  const { days: todaySchedule, weekly, branch } = useClinicCalendar(toDateKey(today), toDateKey(today));
  const info = todaySchedule[toDateKey(today)];
  const todayAvailability = { isOpen: info ? info.state !== "closed" : true, hours: info?.hours || "", reason: info?.reason || null };
  // "Open right now": today is a working day and the current time is inside its hours.
  const nowHm = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const openNow = Boolean(info && info.opens && nowHm >= info.opens && nowHm < info.closes);
  const todayLabel = useMemo(
    () => today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
    [today]
  );

  const notifButton = (
    <NotificationButton
      open={notifOpen}
      onToggle={() => setNotifOpen((v) => !v)}
      onClose={() => setNotifOpen(false)}
      announcements={announcements}
      reminders={reminders}
      enabled={notifsEnabled}
    />
  );
  const menuButton = (
    <button type="button" className="topbar__menu" onClick={onOpenNav} aria-label="Open menu">
      <MenuIcon />
    </button>
  );

  return (
    <>
      {page === "home" && (
        <main id="main-content" tabIndex={-1} className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <h1 className="page-greeting page-topbar__title">Hi {firstName}</h1>
            {notifButton}
          </div>

          <div className="records-card">
            <div className="records-card__top">
              <span className={`status-pill ${todayAvailability.isOpen ? "status-pill--open" : "status-pill--closed"}`}>
                <span className="status-dot" />
                {todayAvailability.isOpen ? "Open today" : "Closed today"}
              </span>
            </div>

            <div className="records-card__body">
              <div className="records-card__text">
                <h2>{todayLabel}</h2>
                <p className="records-card__meta">
                  {todayAvailability.isOpen ? `Open · ${todayAvailability.hours}` : "Closed"}
                  {todayAvailability.reason ? ` — ${todayAvailability.reason}` : ""}
                </p>
              </div>
            </div>
          </div>

          {reminders.items.length > 0 && (
            <div className="settings-card">
              <h2 className="settings-card__label">Coming up</h2>
              <ul className="notif-list">
                {reminders.items.slice(0, 3).map((r) => (
                  <li key={r.id} className="notif-item">
                    <p className="notif-item__meta">
                      {r.petName} · {new Date(`${r.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {r.overdue ? " · overdue" : ""}
                    </p>
                    <p className="notif-item__text">{r.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="settings-card">
            <h2 className="settings-card__label">My pets</h2>
            {petsLoading && pets.length === 0 ? (
              <p className="records-card__meta">Loading your pets…</p>
            ) : pets.length === 0 ? (
              <p className="records-card__meta">Register your pet to see its visits and vaccine reminders here.</p>
            ) : (
              <div className="pet-list">
                {pets.map((pet) => (
                  <button type="button" className="pet-row" key={pet.id} onClick={() => setSelectedHistoryPet(pet)}>
                    <span className="pet-row__icon"><PetIcon species={pet.species} /></span>
                    <div>
                      <p className="pet-row__name">{pet.name}</p>
                      <p className="pet-row__meta">
                        {pet.lastCheckup
                          ? `Last visit ${new Date(`${pet.lastCheckup}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : "No visits yet"}
                      </p>
                    </div>
                    <ChevronRightIcon />
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="ll-submit pet-add-btn" onClick={() => setRegisteringPet(true)}>Register a pet</button>
          </div>

          <div className="settings-card announce-card">
            <h2 className="settings-card__label">Clinic announcements</h2>
            {announcements.items.length === 0 ? (
              <p className="records-card__meta">No announcements right now.</p>
            ) : (
              <ul className="notif-list">
                {announcements.items.slice(0, 3).map((post) => (
                  <li key={post.id} className="notif-item">
                    <p className="notif-item__meta">
                      {post.authorName} · {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                    {post.text && <p className="notif-item__text">{post.text}</p>}
                    {post.photo && <img className="notif-item__photo" src={post.photo} alt="" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      )}

      {page === "calendar" && (
        <main id="main-content" tabIndex={-1} className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <div className="section-head page-topbar__title">
              <h1 className="page-title">Calendar</h1>
              <span className={`status-pill ${openNow ? "status-pill--open" : "status-pill--closed"}`}>
                <span className="status-dot" />
                {openNow ? "Clinic is open now" : info ? "Clinic is closed right now" : "Checking hours…"}
              </span>
            </div>
            {notifButton}
          </div>

          <div className="calendar-layout">
            <ClinicCalendar />

            <div className="calendar-side">
              <div className="section-head">
                <h3>Weekly hours{branch ? ` · ${branch}` : ""}</h3>
              </div>

              <div className="availability-list">
                {weekly.map((h) => (
                  <div className="availability-row" key={h.day}>
                    <span className="availability-row__day">{h.day}</span>
                    <span className={`availability-row__hours ${h.closed ? "availability-row__hours--closed" : ""}`}>
                      {h.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {page === "records" && (
        <main id="main-content" tabIndex={-1} className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <h1 className="page-title page-topbar__title">Records</h1>
            {notifButton}
          </div>

          <div className="records-list">
            {petsLoading && pets.length === 0 && <p className="records-card__meta">Loading your pets…</p>}
            {petsError && <p className="records-card__meta">Could not load your pets. Please try again.</p>}
            {!petsLoading && !petsError && pets.length === 0 && (
              <div className="records-card">
                <p className="records-card__meta">You have not registered a pet yet.</p>
                <button type="button" className="ll-submit pet-add-btn" onClick={() => setRegisteringPet(true)}>Register a pet</button>
              </div>
            )}
            {pets.map((pet) => (
              <div className="records-card" key={pet.id}>
                <div className="records-card__body">
                  <div className="records-card__text">
                    <p className="records-card__eyebrow">Medical Records</p>
                    <h2>{pet.name}'s Health History</h2>
                    <p className="records-card__meta">
                      {pet.lastCheckup
                        ? `Last checkup: ${new Date(`${pet.lastCheckup}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                        : "No visits yet"}
                      {pet.followUpNote ? ` · Follow-up: ${pet.followUpNote}` : ""}
                    </p>
                    <button type="button" className="records-card__cta" onClick={() => setSelectedHistoryPet(pet)}>
                      View records <ArrowRightIcon />
                    </button>
                  </div>
                  <span className="records-card__avatar"><PawIcon /></span>
                </div>
              </div>
            ))}
          </div>

        </main>
      )}

      {page === "settings" && (
        <main id="main-content" tabIndex={-1} className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <h1 className="page-title page-topbar__title">Settings</h1>
            {notifButton}
          </div>

          <div className="settings-card">
            <p className="settings-card__label">Profile</p>
            <div className="profile-row">
              <span className="profile-avatar">{initials}</span>
              <div>
                <p className="profile-row__name">{firstName}</p>
                <p className="profile-row__email">{email}</p>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <p className="settings-card__label">My Pets</p>
            <div className="pet-list">
              {pets.length === 0 && <p className="records-card__meta">You have not registered a pet yet.</p>}
              {pets.map((pet) => (
                <button type="button" className="pet-row" key={pet.id} onClick={() => setSelectedPet(pet)}>
                  <span className="pet-row__icon"><PetIcon species={pet.species} /></span>
                  <div>
                    <p className="pet-row__name">{pet.name}</p>
                    <p className="pet-row__meta">{[pet.species, pet.breed].filter(Boolean).join(" · ")}</p>
                  </div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
            <button type="button" className="ll-submit pet-add-btn" onClick={() => setRegisteringPet(true)}>Register a pet</button>
          </div>

          <div className="settings-card">
            <p className="settings-card__label">System</p>
            <div className="settings-toggle-row">
              <div>
                <p className="settings-toggle-row__title">Dark mode</p>
                <p className="settings-toggle-row__desc">Switch the app to a dark color theme.</p>
              </div>
              <ToggleSwitch checked={darkMode} onChange={onToggleDarkMode} label="Toggle dark mode" />
            </div>
            <div className="settings-toggle-row">
              <div>
                <p className="settings-toggle-row__title">Notifications</p>
                <p className="settings-toggle-row__desc">Get notified about clinic updates and reminders.</p>
              </div>
              <ToggleSwitch checked={notifsEnabled} onChange={onToggleNotifs} label="Toggle notifications" />
            </div>
          </div>
        </main>
      )}

      {page !== "home" && page !== "calendar" && page !== "records" && page !== "settings" && (
        <main id="main-content" tabIndex={-1} className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <h1 className="page-title page-topbar__title">{activeItem?.label}</h1>
            {notifButton}
          </div>

          <div className="placeholder-page">
            <div className="placeholder-page__icon">{activeItem?.icon}</div>
            <h2>{activeItem?.label}</h2>
            <p>This section is coming soon.</p>
          </div>
        </main>
      )}

      {/* Shared by the Home, Records and Settings pages. */}
      {selectedHistoryPet && <PetHistoryModal pet={selectedHistoryPet} onDismiss={() => setSelectedHistoryPet(null)} />}
      {selectedPet && <PetDetailModal pet={selectedPet} onDismiss={() => setSelectedPet(null)} />}
      {registeringPet && <PetRegisterModal onDismiss={() => setRegisteringPet(false)} onDone={() => setRegisteringPet(false)} />}
    </>
  );
}
