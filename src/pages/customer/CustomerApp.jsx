// The pet-owner portal: home, calendar, records and settings, switched by component state.
// Reached only through RequireRole (App.jsx): everyone signs in on the main login page, and a signed-out owner is
// sent back there. Owners see their own pets, medical history, reminders and the clinic announcements.

import { useEffect, useState } from "react";
import "../../styles/customer/style.css";
import SkipLink from "../../components/shared/SkipLink";
import SideNav from "./components/SideNav";
import HomeScreen from "./components/HomeScreen";
import ChangePasswordScreen from "./components/ChangePasswordScreen";
import { useAuth } from "../../hooks/useAuth";

export default function CustomerApp() {
  const { session, logout, setUser } = useAuth();
  const [page, setPage] = useState("home");
  const [navExpanded, setNavExpanded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("vv-dark-mode") === "1";
    } catch {
      return false;
    }
  });
  const [notifsEnabled, setNotifsEnabled] = useState(() => {
    try {
      return localStorage.getItem("vv-notifs-enabled") !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#F5F9F6");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vv-dark-mode", darkMode ? "1" : "0");
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem("vv-notifs-enabled", notifsEnabled ? "1" : "0");
    } catch {}
  }, [notifsEnabled]);

  function handleLogout() {
    logout();
    setPage("home");
    setNavExpanded(false);
  }

  function handleNavigate(id) {
    setPage(id);
    setNavExpanded(false);
  }

  if (session?.mustChangePassword) {
    return <ChangePasswordScreen email={session.email} onDone={setUser} onCancel={handleLogout} />;
  }

  return (
    <div className={`home-page ${navExpanded ? "home-page--nav-expanded" : ""} ${darkMode ? "dark" : ""}`}>
      <SkipLink />
      <SideNav
        page={page}
        expanded={navExpanded}
        onExpand={() => setNavExpanded(true)}
        onCollapse={() => setNavExpanded(false)}
        onToggle={() => setNavExpanded((v) => !v)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <div className="sidenav-backdrop" onClick={() => setNavExpanded(false)} />
      <div className="home-container">
        <HomeScreen
          session={session}
          page={page}
          onOpenNav={() => setNavExpanded(true)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((v) => !v)}
          notifsEnabled={notifsEnabled}
          onToggleNotifs={() => setNotifsEnabled((v) => !v)}
        />
      </div>
    </div>
  );
}
