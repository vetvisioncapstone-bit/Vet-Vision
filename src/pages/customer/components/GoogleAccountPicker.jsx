// Mock Google account picker modal, ported verbatim from customer/index.html.
// Purely a self-contained demo — does not touch any admin/employee auth state.

import { MOCK_GOOGLE_ACCOUNTS } from "../lib/mockData";
import { initialsOf } from "../lib/misc";
import { CloseIcon, GoogleIcon, UserIcon } from "./icons";

export default function GoogleAccountPicker({ onSelect, onDismiss }) {
  return (
    <div className="google-modal-backdrop" onClick={onDismiss}>
      <div className="google-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="google-modal__close" onClick={onDismiss} aria-label="Close">
          <CloseIcon />
        </button>
        <GoogleIcon />
        <h2>Choose an account</h2>
        <p>to continue to Vet Vision</p>

        <div className="google-modal__list">
          {MOCK_GOOGLE_ACCOUNTS.map((acc) => (
            <button key={acc.email} type="button" className="google-account-row" onClick={() => onSelect(acc.email)}>
              <span className="google-account-row__avatar">{initialsOf(acc.name)}</span>
              <span className="google-account-row__text">
                <span className="google-account-row__name">{acc.name}</span>
                <span className="google-account-row__email">{acc.email}</span>
              </span>
            </button>
          ))}
          <button type="button" className="google-account-row" onClick={onDismiss}>
            <span className="google-account-row__avatar google-account-row__avatar--generic"><UserIcon /></span>
            <span className="google-account-row__text">
              <span className="google-account-row__name">Use another account</span>
            </span>
          </button>
        </div>

        <p className="google-modal__footnote">Demo picker — connect a Google OAuth Client ID to enable real sign-in.</p>
      </div>
    </div>
  );
}
