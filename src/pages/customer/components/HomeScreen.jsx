// Main authenticated shell: renders the active "page" (home/calendar/records/settings),
// ported verbatim from customer/index.html.

import { useMemo, useState } from "react";
import { CLINIC_HOURS, CLINIC_STATUS, PETS } from "../lib/mockData";
import { getDayAvailability } from "../lib/dateUtils";
import { NAV_ITEMS } from "../nav";
import ClinicCalendar from "./ClinicCalendar";
import NotificationButton from "./NotificationButton";
import PetDetailModal from "./PetDetailModal";
import PetHistoryModal from "./PetHistoryModal";
import ToggleSwitch from "./ToggleSwitch";
import { ArrowRightIcon, ChevronRightIcon, MenuIcon, PawIcon, PetIcon } from "./icons";

export default function HomeScreen({ email, page, onOpenNav, darkMode, onToggleDarkMode, notifsEnabled, onToggleNotifs }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);
  const [selectedHistoryPet, setSelectedHistoryPet] = useState(null);

  const firstName = useMemo(() => {
    const handle = email.split("@")[0] || "there";
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  }, [email]);

  const initials = useMemo(() => firstName.slice(0, 2).toUpperCase(), [firstName]);

  const activeItem = useMemo(() => NAV_ITEMS.find((item) => item.id === page), [page]);

  const today = useMemo(() => new Date(), []);
  const todayAvailability = useMemo(() => getDayAvailability(today), [today]);
  const todayLabel = useMemo(
    () => today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
    [today]
  );

  const notifButton = (
    <NotificationButton open={notifOpen} onToggle={() => setNotifOpen((v) => !v)} onClose={() => setNotifOpen(false)} />
  );
  const menuButton = (
    <button type="button" className="topbar__menu" onClick={onOpenNav} aria-label="Open menu">
      <MenuIcon />
    </button>
  );

  return (
    <>
      {page === "home" && (
        <main className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <p className="page-greeting page-topbar__title">Hi {firstName}</p>
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
        </main>
      )}

      {page === "calendar" && (
        <main className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <div className="section-head page-topbar__title">
              <h1 className="page-title">Calendar</h1>
              <span className={`status-pill ${CLINIC_STATUS.isOpen ? "status-pill--open" : "status-pill--closed"}`}>
                <span className="status-dot" />
                {CLINIC_STATUS.label}
              </span>
            </div>
            {notifButton}
          </div>

          <div className="calendar-layout">
            <ClinicCalendar />

            <div className="calendar-side">
              <div className="section-head">
                <h3>Weekly hours</h3>
              </div>

              <div className="availability-list">
                {CLINIC_HOURS.map((h) => (
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
        <main className="content home-content">
          <div className="page-topbar">
            {menuButton}
            <h1 className="page-title page-topbar__title">Records</h1>
            {notifButton}
          </div>

          <div className="records-list">
            {PETS.map((pet) => (
              <div className="records-card" key={pet.id}>
                <div className="records-card__body">
                  <div className="records-card__text">
                    <p className="records-card__eyebrow">Medical Records</p>
                    <h2>{pet.name}'s Health History</h2>
                    <p className="records-card__meta">Last checkup: {pet.lastCheckup} · {pet.note}</p>
                    <button type="button" className="records-card__cta" onClick={() => setSelectedHistoryPet(pet)}>
                      View records <ArrowRightIcon />
                    </button>
                  </div>
                  <span className="records-card__avatar"><PawIcon /></span>
                </div>
              </div>
            ))}
          </div>

          {selectedHistoryPet && (
            <PetHistoryModal pet={selectedHistoryPet} onDismiss={() => setSelectedHistoryPet(null)} />
          )}
        </main>
      )}

      {page === "settings" && (
        <main className="content home-content">
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
              {PETS.map((pet) => (
                <button type="button" className="pet-row" key={pet.id} onClick={() => setSelectedPet(pet)}>
                  <span className="pet-row__icon"><PetIcon species={pet.species} /></span>
                  <div>
                    <p className="pet-row__name">{pet.name}</p>
                    <p className="pet-row__meta">{pet.species} · {pet.breed}</p>
                  </div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>

          {selectedPet && <PetDetailModal pet={selectedPet} onDismiss={() => setSelectedPet(null)} />}

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
        <main className="content home-content">
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
    </>
  );
}
