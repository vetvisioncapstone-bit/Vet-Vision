import React from 'react'

function LeftSection() {
  return (
    <div className="left-section">
      <div className="paw-print paw-1">🐾</div>
      <div className="paw-print paw-2">🐾</div>
      <div className="paw-print paw-3">🐾</div>

      <div className="left-content">
        <div className="logo">
          <img src="/Images/VET Vision.png" alt="Vet Vision logo" className="logo-img" />
        </div>
        
        <p className="tagline">
          Better care for pets,<br />
          better lives <span className="tagline-highlight">for all.</span>
        </p>

        <div className="pet-image">
          <img src="/Images/Dogs and Cat.png" alt="Dog and Cat - Vet Vision" />
        </div>
      </div>
    </div>
  )
}

export default LeftSection
