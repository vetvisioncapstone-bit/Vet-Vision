// Pet detail modal, ported verbatim from customer/index.html.

import { CloseIcon, PetIcon } from "./icons";

export default function PetDetailModal({ pet, onDismiss }) {
  return (
    <div className="pet-modal-backdrop" onClick={onDismiss}>
      <div className="pet-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pet-modal__close" onClick={onDismiss} aria-label="Close">
          <CloseIcon />
        </button>
        <div className="pet-modal__icon"><PetIcon species={pet.species} /></div>
        <p className="pet-modal__eyebrow">Pet</p>
        <h2 className="pet-modal__title">{pet.name}</h2>
        <div className="pet-modal__details">
          <div className="pet-modal__row">
            <span className="pet-modal__row-label">Species</span>
            <span className="pet-modal__row-value">{pet.species}</span>
          </div>
          <div className="pet-modal__row">
            <span className="pet-modal__row-label">Breed</span>
            <span className="pet-modal__row-value">{pet.breed}</span>
          </div>
          <div className="pet-modal__row">
            <span className="pet-modal__row-label">Sex</span>
            <span className="pet-modal__row-value">{pet.sex}</span>
          </div>
          <div className="pet-modal__row">
            <span className="pet-modal__row-label">Age</span>
            <span className="pet-modal__row-value">{pet.age} yr(s) old</span>
          </div>
          <div className="pet-modal__row">
            <span className="pet-modal__row-label">Color</span>
            <span className="pet-modal__row-value">{pet.color}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
