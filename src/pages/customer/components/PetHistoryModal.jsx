// Pet visit-history modal (empty state placeholder), ported verbatim from customer/index.html.

import { CloseIcon, RecordsIcon } from "./icons";

export default function PetHistoryModal({ pet, onDismiss }) {
  return (
    <div className="pet-modal-backdrop" onClick={onDismiss}>
      <div className="pet-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pet-modal__close" onClick={onDismiss} aria-label="Close">
          <CloseIcon />
        </button>
        <p className="pet-modal__eyebrow">Visit History</p>
        <h2 className="pet-modal__title">{pet.name}</h2>

        <div className="empty-state">
          <span className="empty-state__icon"><RecordsIcon /></span>
          <p className="empty-state__title">No visit history yet</p>
          <p className="empty-state__text">
            Visit dates, services, and products will appear here once this connects to the clinic's system.
          </p>
        </div>
      </div>
    </div>
  );
}
