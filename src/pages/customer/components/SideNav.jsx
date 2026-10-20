// Collapsible side navigation, ported verbatim from customer/index.html.
// Image paths updated from relative "Images/..." to root-relative "/Images/..." (%20-encoded).

import { NAV_GROUPS } from "../nav";
import { LogoutIcon } from "./icons";

export default function SideNav({ page, expanded, onExpand, onCollapse, onToggle, onNavigate, onLogout }) {
  return (
    <nav
      className={`sidenav ${expanded ? "sidenav--expanded" : ""}`}
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
      aria-label="Primary"
    >
      <button type="button" className="sidenav__brand" onClick={onToggle} aria-label="Toggle navigation">
        <img
          src={expanded ? "/Images/VET%20Vision.png" : "/Images/EcovetLogo%201.png"}
          alt=""
          className="sidenav__brand-logo"
        />
      </button>

      <div className="sidenav__scroll">
        {NAV_GROUPS.map((group) => (
          <div className="sidenav__group" key={group.label}>
            <p className="sidenav__group-label">{group.label}</p>
            <div className="sidenav__list">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sidenav__item ${page === item.id ? "sidenav__item--active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <span className="sidenav__icon">{item.icon}</span>
                  <span className="sidenav__label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sidenav__footer">
        <button type="button" className="sidenav__item sidenav__item--logout" onClick={onLogout}>
          <span className="sidenav__icon"><LogoutIcon /></span>
          <span className="sidenav__label">Log out</span>
        </button>
      </div>
    </nav>
  );
}
