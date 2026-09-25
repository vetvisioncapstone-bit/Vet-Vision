// Shown right after an owner signs in for the first time with the starter password.

import { useState } from "react";
import { api, errorMessage } from "../../../api/client";

export default function ChangePasswordScreen({ email, onDone, onCancel }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const user = await api.patch("/auth/me/", { currentPassword: current, newPassword: next });
      onDone(user);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="login-light login-light--single">
      <div className="login-light__right">
        <form className="ll-card" onSubmit={handleSubmit} noValidate>
          <h1>Choose a new password</h1>
          <p className="ll-card__subtitle">
            {email} is using a starter password. Set your own before you continue.
          </p>

          {error && <p className="ll-error" role="alert">{error}</p>}

          <label className="ll-field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </label>
          <label className="ll-field">
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="ll-field">
            <span>Confirm new password</span>
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </label>

          <button type="submit" className="ll-submit" disabled={saving}>
            {saving ? <span className="btn__spinner" aria-label="Saving" /> : "Save password"}
          </button>
          <button type="button" className="ll-link" onClick={onCancel}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
