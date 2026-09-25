// Visit history for one pet, newest first, from the clinic's medical records.

import { CloseIcon, RecordsIcon } from "./icons";

import Dialog from '../../../components/shared/Dialog';
function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Line({ label, value }) {
  if (!value) return null;
  return (
    <p className="visit__line">
      <span className="visit__label">{label}: </span>
      {value}
    </p>
  );
}

export default function PetHistoryModal({ pet, onDismiss }) {
  return (
    <Dialog open onClose={onDismiss} label={`${pet.name}'s health history`} className="pet-modal-backdrop">
      <div className="pet-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pet-modal__close" onClick={onDismiss} aria-label="Close">
          <CloseIcon />
        </button>
        <p className="pet-modal__eyebrow">Visit History</p>
        <h2 className="pet-modal__title">{pet.name}</h2>

        {pet.visits.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon"><RecordsIcon /></span>
            <p className="empty-state__title">No visit history yet</p>
            <p className="empty-state__text">Visits, services and treatments will appear here after your pet's next check-up.</p>
          </div>
        ) : (
          <ul className="visit-list">
            {pet.visits.map((v) => (
              <li className="visit" key={v.id}>
                <p className="visit__date">{formatDate(v.date)}{v.type ? ` · ${v.type}` : ""}</p>
                <Line label="Diagnosis" value={v.diagnosis} />
                <Line label="Treatment" value={v.treatment} />
                <Line label="Services" value={v.services} />
                <Line label="Items" value={(v.availedItems || []).map((i) => (typeof i === "string" ? i : i.name)).filter(Boolean).join(", ")} />
                <Line label="Weight" value={v.weight} />
                <Line label="Remarks" value={v.remarks} />
                {v.totalPrice > 0 && <Line label="Total" value={`PHP ${v.totalPrice.toLocaleString()}`} />}
                {v.followUp && <span className="visit__flag">Follow-up{v.followUpNote ? `: ${v.followUpNote}` : ""}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
