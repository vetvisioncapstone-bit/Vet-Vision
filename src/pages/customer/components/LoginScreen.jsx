// Mock Google sign-in landing screen, ported verbatim from customer/index.html.
// Image paths updated from relative "Images/..." to root-relative "/Images/..." (%20-encoded)
// to match the Vite public/ directory; no other behavior changed.

import { useState } from "react";
import GoogleAccountPicker from "./GoogleAccountPicker";
import { GoogleIcon, PawIcon, ShieldIcon } from "./icons";

export default function LoginScreen({ onContinue }) {
  const [loading, setLoading] = useState(false);
  const [showGooglePicker, setShowGooglePicker] = useState(false);

  function handleGoogleSelect(googleEmail) {
    setShowGooglePicker(false);
    setLoading(true);
    setTimeout(() => onContinue(googleEmail), 600);
  }

  return (
    <div className="login-light">
      <div className="login-light__left">
        <div className="ll-brand">
          <img src="/Images/VET%20Vision.png" alt="Vet Vision" className="ll-brand__logo" />
        </div>

        <p className="ll-tagline">
          Better care for pets,<br />
          better lives <span className="ll-tagline__accent">for all.</span>
        </p>

        <div className="ll-blob">
          <span className="ll-paw ll-paw--1"><PawIcon /></span>
          <span className="ll-paw ll-paw--2"><PawIcon /></span>
          <span className="ll-paw ll-paw--3"><PawIcon /></span>
          <span className="ll-paw ll-paw--4"><PawIcon /></span>
          <div className="ll-blob__shape">
            <img className="ll-blob__photo" src="/Images/dogcat_trimmed.png" alt="Dog and cat, happy and healthy" />
          </div>
        </div>
      </div>

      <div className="login-light__right">
        <div className="ll-card">
          <h1>Welcome back</h1>
          <p className="ll-card__subtitle">Sign in with Google to continue</p>

          <button
            type="button"
            className="google-btn"
            onClick={() => setShowGooglePicker(true)}
            disabled={loading}
          >
            {loading ? (
              <span className="btn__spinner" aria-label="Loading" />
            ) : (
              <>
                <GoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <p className="ll-footer-note"><ShieldIcon /> Your data is safe and secure with us.</p>
        </div>
      </div>

      {showGooglePicker && (
        <GoogleAccountPicker
          onSelect={handleGoogleSelect}
          onDismiss={() => setShowGooglePicker(false)}
        />
      )}
    </div>
  );
}
