// The owner registers one of their own pets (thesis: customer portal, pet registration).

import { useState } from "react";
import { errorMessage } from "../../../api/client";
import { registerPet } from "../../../hooks/useCustomerPortal";
import { CloseIcon } from "./icons";

import Dialog from '../../../components/shared/Dialog';
const EMPTY = { petName: "", petSpecie: "Dog", petBreed: "", petSex: "Male", petDob: "", petMarking: "" };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PetRegisterModal({ onDismiss, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.petName.trim() || !form.petDob) {
      setError("Enter your pet's name and date of birth.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      onDone(await registerPet({ ...form, petName: form.petName.trim() }));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onDismiss} label={"Register a pet"} className="pet-modal-backdrop">
      <form className="pet-modal pet-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <button type="button" className="pet-modal__close" onClick={onDismiss} aria-label="Close"><CloseIcon /></button>
        <p className="pet-modal__eyebrow">New pet</p>
        <h2 className="pet-modal__title">Register a pet</h2>

        {error && <p className="ll-error" role="alert">{error}</p>}

        <label className="ll-field">
          <span>Name</span>
          <input value={form.petName} onChange={set("petName")} maxLength={40} autoFocus />
        </label>
        <div className="ll-row">
          <label className="ll-field">
            <span>Species</span>
            <select value={form.petSpecie} onChange={set("petSpecie")}>
              <option>Dog</option>
              <option>Cat</option>
              <option>Other</option>
            </select>
          </label>
          <label className="ll-field">
            <span>Sex</span>
            <select value={form.petSex} onChange={set("petSex")}>
              <option>Male</option>
              <option>Female</option>
            </select>
          </label>
        </div>
        <label className="ll-field">
          <span>Breed</span>
          <input value={form.petBreed} onChange={set("petBreed")} maxLength={40} placeholder="Optional" />
        </label>
        <div className="ll-row">
          <label className="ll-field">
            <span>Date of birth</span>
            <input type="date" value={form.petDob} onChange={set("petDob")} max={todayIso()} />
          </label>
          <label className="ll-field">
            <span>Color / marking</span>
            <input value={form.petMarking} onChange={set("petMarking")} maxLength={40} placeholder="Optional" />
          </label>
        </div>

        <button type="submit" className="ll-submit" disabled={saving}>
          {saving ? <span className="btn__spinner" aria-label="Saving" /> : "Register pet"}
        </button>
      </form>
    </Dialog>
  );
}
