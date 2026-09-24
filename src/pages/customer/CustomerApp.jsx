// Top-level customer portal component — equivalent to the `App()` function in the
// original customer/index.html standalone build. Mount this as a single route element
// (e.g. <Route path="/customer/*" element={<CustomerApp />} />); it manages its own
// login/home view switching and in-page navigation internally via component state,
// exactly as the original did (see CustomerApp's report notes on why `page` was kept
// as state rather than promoted to nested routes).
//
// Intentionally isolated: this portal's mock Google login never reads or writes the
// admin/employee localStorage keys (`vvStaffAccounts`, `vetVisionAdminProfile`) or
// src/utils/auth.js — that separation is preserved as-is per product decision.

import { useEffect, useState } from "react";
import "../../styles/customer/style.css";
import LoginScreen from "./components/LoginScreen";
import SideNav from "./components/SideNav";
import HomeScreen from "./components/HomeScreen";
import ChatAssistant from "./components/ChatAssistant";

export default function CustomerApp() {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
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
  }, [view]);

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

  function handleContinue(value) {
    setEmail(value);
    setView("home");
  }

  function handleLogout() {
    setView("login");
    setEmail("");
    setPage("home");
    setNavExpanded(false);
  }

  function handleNavigate(id) {
    setPage(id);
    setNavExpanded(false);
  }

  if (view === "login") {
    return <LoginScreen onContinue={handleContinue} />;
  }

  return (
    <div className={`home-page ${navExpanded ? "home-page--nav-expanded" : ""} ${darkMode ? "dark" : ""}`}>
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
          email={email}
          page={page}
          onOpenNav={() => setNavExpanded(true)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((v) => !v)}
          notifsEnabled={notifsEnabled}
          onToggleNotifs={() => setNotifsEnabled((v) => !v)}
        />
      </div>
      <ChatAssistant />
    </div>
  );
}
