// ==================== DOM ELEMENTS ====================

const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.querySelector('.login-btn');
const rememberCheckbox = document.getElementById('remember');

// ==================== ADMIN CREDENTIALS ====================
// This is a client-side prototype with no backend - these credentials
// live in this file (and localStorage) and are visible to anyone who
// opens dev tools. It gates access to the demo UI, not real authentication.
// The profile is stored under the same localStorage key the dashboard
// pages use (see dashboard.js), so a name/email/password change made in
// System settings is picked up here too.

const ADMIN_PROFILE_KEY = 'vetVisionAdminProfile';
const DEFAULT_ADMIN_PROFILE = {
    name: 'June Jericho Humarang',
    email: 'junejerichohumarang@ecovet.ph',
    password: 'Vetvision2026!'
};

function getAdminProfile() {
    try {
        const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
        if (!raw) return { ...DEFAULT_ADMIN_PROFILE };
        const parsed = JSON.parse(raw);
        return {
            name: parsed.name || DEFAULT_ADMIN_PROFILE.name,
            email: parsed.email || DEFAULT_ADMIN_PROFILE.email,
            password: parsed.password || DEFAULT_ADMIN_PROFILE.password
        };
    } catch {
        return { ...DEFAULT_ADMIN_PROFILE };
    }
}

// ==================== STAFF (EMPLOYEE) ACCOUNTS ====================
// Same login form, same point of entry - which portal you land in depends
// on which of these two lists your email matches. Staff accounts are
// created by the admin in User management (admin/user-management.js),
// which persists them to this same localStorage key.

const STAFF_ACCOUNTS_KEY = 'vvStaffAccounts';

function getStaffAccounts() {
    try {
        const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// ==================== SESSION ====================
// Records who just logged in (admin or a specific staff account) so every
// page's topbar can show the right name/photo and the sidebar can show the
// right nav, without asking the admin/employee to log in twice.

const SESSION_KEY = 'vvCurrentSession';

function setSession(session) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
        // Not critical - worst case the topbar falls back to defaults.
    }
}

// ==================== PASSWORD VISIBILITY TOGGLE ====================

togglePassword.addEventListener('click', function(e) {
    e.preventDefault();

    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);

    // Change icon
    togglePassword.classList.toggle('is-visible', type === 'text');

    // Add animation
    togglePassword.style.animation = 'none';
    setTimeout(() => {
        togglePassword.style.animation = 'spin 0.4s ease-out';
    }, 10);
});

// ==================== EMAIL VALIDATION ====================

emailInput.addEventListener('blur', function() {
    validateEmail();
});

emailInput.addEventListener('input', function() {
    // Remove error state while typing
    if (this.classList.contains('error')) {
        this.classList.remove('error');
        emailHint.classList.remove('show');
    }
    clearLoginError();
});

const emailHint = document.getElementById('emailHint');

function validateEmail() {
    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email === '') {
        emailInput.classList.remove('error', 'success');
        emailHint.classList.remove('show');
        return true;
    }

    if (!emailRegex.test(email)) {
        emailInput.classList.add('error');
        emailInput.classList.remove('success');
        emailHint.classList.add('show');
        return false;
    } else {
        emailInput.classList.add('success');
        emailInput.classList.remove('error');
        emailHint.classList.remove('show');
        return true;
    }
}

// ==================== PASSWORD VALIDATION ====================

passwordInput.addEventListener('input', function() {
    if (this.value.length >= 6) {
        this.classList.add('success');
        this.classList.remove('error');
    } else if (this.value.length > 0) {
        this.classList.add('error');
        this.classList.remove('success');
    } else {
        this.classList.remove('error', 'success');
    }
    clearLoginError();
});

// ==================== LOGIN ERROR BANNER ====================

function showLoginError(message) {
    let alertEl = document.querySelector('.login-alert');
    if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.className = 'login-alert';
        const loginCard = document.querySelector('.login-card');
        loginCard.insertBefore(alertEl, loginCard.firstChild);
    }
    alertEl.textContent = message;
}

function clearLoginError() {
    const alertEl = document.querySelector('.login-alert');
    if (alertEl) alertEl.remove();
}

// ==================== FORM SUBMISSION ====================

loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Validate email
    if (!validateEmail()) {
        shakeElement(emailInput);
        return;
    }
    
    const password = passwordInput.value.trim();
    
    // Validate password
    if (!password) {
        passwordInput.classList.add('error');
        shakeElement(passwordInput);
        return;
    }

    const email = emailInput.value.trim();
    const adminProfile = getAdminProfile();

    // Same login form for everyone - which portal you land in depends on
    // whether the email matches the one fixed admin account or one of the
    // staff accounts the admin created in User management.
    let matchedSession = null;

    if (email.toLowerCase() === adminProfile.email.toLowerCase() && password === adminProfile.password) {
        matchedSession = { role: 'admin', name: adminProfile.name, email: adminProfile.email };
    } else {
        const staffAccount = getStaffAccounts().find(a => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
        if (staffAccount) {
            matchedSession = {
                role: 'employee',
                id: staffAccount.id,
                name: staffAccount.name,
                email: staffAccount.email,
                branch: staffAccount.branch,
                photo: staffAccount.photo || null
            };
        }
    }

    if (!matchedSession) {
        emailInput.classList.add('error');
        passwordInput.classList.add('error');
        shakeElement(emailInput);
        shakeElement(passwordInput);
        showLoginError('Incorrect email or password.');
        return;
    }

    clearLoginError();
    setSession(matchedSession);
    submitForm(matchedSession);
});

// ==================== FORM SUBMISSION HANDLER ====================

function submitForm(session) {
    const email = emailInput.value;
    const remember = rememberCheckbox.checked;

    // Add loading state to button
    loginBtn.disabled = true;
    loginBtn.classList.add('loading');
    const pawIconHTML = loginBtn.querySelector('.paw-icon').outerHTML;
    loginBtn.innerHTML = pawIconHTML;

    // Simulate API call
    setTimeout(() => {
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
        loginBtn.innerHTML = pawIconHTML + '<span class="btn-text">Login</span>';

        // Show success message
        showSuccessMessage(email, remember);

        // Admin and staff land in different portals - same login point,
        // different folder depending on which account matched.
        const destination = session.role === 'admin' ? 'admin/dashboard.html' : 'employee/employee-dashboard.html';

        setTimeout(() => {
            window.location.href = destination;
        }, 1500);
    }, 2000);
}

// ==================== SUCCESS MESSAGE ====================

function showSuccessMessage(email, remember) {
    // Build a centered popup instead of an inline banner
    const overlay = document.createElement('div');
    overlay.className = 'success-overlay';

    const popup = document.createElement('div');
    popup.className = 'success-popup';
    popup.innerHTML = `
        <div class="success-popup-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3>Login Successful!</h3>
        <p>Welcome back! You logged in as <strong></strong></p>
    `;
    popup.querySelector('strong').textContent = email;

    if (remember) {
        const note = document.createElement('p');
        note.className = 'remember-note';
        note.textContent = '✓ Your device has been remembered.';
        popup.appendChild(note);
    }

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Auto-remove shortly before the redirect kicks in
    setTimeout(() => {
        overlay.classList.add('closing');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }, 1300);
}

// ==================== FORM RESET ====================

function resetForm() {
    emailInput.value = '';
    passwordInput.value = '';
    rememberCheckbox.checked = false;
    
    // Remove validation classes
    emailInput.classList.remove('error', 'success');
    passwordInput.classList.remove('error', 'success');
    
    // Reset password visibility
    passwordInput.setAttribute('type', 'password');
    togglePassword.classList.remove('is-visible');
}

// ==================== SHAKE ANIMATION ====================

function shakeElement(element) {
    element.style.animation = 'none';
    setTimeout(() => {
        element.style.animation = 'shake 0.5s ease-in-out';
    }, 10);
}

// Add shake animation to stylesheet dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    @keyframes slideUp {
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(style);

// ==================== INTERACTIVE ANIMATIONS ====================

// Animate form labels on focus
const formLabels = document.querySelectorAll('.form-label');
formLabels.forEach(label => {
    label.addEventListener('mouseover', function() {
        this.style.transform = 'translateX(5px)';
        this.style.color = '#4caf50';
    });
    
    label.addEventListener('mouseout', function() {
        this.style.transform = 'translateX(0)';
        this.style.color = '#333';
    });
});

// ==================== CHECKBOX ANIMATION ====================

rememberCheckbox.addEventListener('change', function() {
    if (this.checked) {
        const label = document.querySelector('label[for="remember"]');
        label.style.animation = 'pulse 0.4s ease';
    }
});

// ==================== FORGOT PASSWORD LINK ====================

document.querySelector('.forgot-password').addEventListener('click', function(e) {
    e.preventDefault();
    alert('Password reset functionality would be implemented here! 🔐');
});

// ==================== INPUT FOCUS EFFECTS ====================

const inputs = document.querySelectorAll('.form-input');
inputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.style.transform = 'scale(1.01)';
    });
    
    input.addEventListener('blur', function() {
        this.parentElement.style.transform = 'scale(1)';
    });
});

// ==================== BUTTON RIPPLE EFFECT ====================

loginBtn.addEventListener('click', function(e) {
    const ripple = document.createElement('span');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    
    this.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
});

// Add ripple styles
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    .login-btn {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);

// ==================== KEYBOARD SHORTCUTS ====================

document.addEventListener('keydown', function(e) {
    // Enter key to submit form
    if (e.key === 'Enter' && document.activeElement !== loginBtn) {
        e.preventDefault();
        loginForm.dispatchEvent(new Event('submit'));
    }
    
    // Escape key to clear form
    if (e.key === 'Escape') {
        resetForm();
    }
});

// ==================== PAGE LOAD ANIMATIONS ====================

window.addEventListener('load', function() {
    // Add some delay to form elements for staggered animation
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach((group, index) => {
        group.style.opacity = '0';
        group.style.transform = 'translateY(20px)';
        setTimeout(() => {
            group.style.transition = 'all 0.6s ease-out';
            group.style.opacity = '1';
            group.style.transform = 'translateY(0)';
        }, 500 + index * 100);
    });
});

// ==================== FORM ACTIONS ANIMATION ====================

const formActions = document.querySelector('.form-actions');
if (formActions) {
    formActions.addEventListener('mouseover', function() {
        this.style.opacity = '1';
    });
    
    formActions.addEventListener('mouseout', function() {
        this.style.opacity = '0.8';
    });
}

// ==================== CONSOLE WELCOME MESSAGE ====================

console.log('%c🐾 Welcome to Vet Vision! 🐾', 'font-size: 20px; color: #4caf50; font-weight: bold;');
console.log('%cBetter care for pets, better lives for all.', 'font-size: 14px; color: #2d7a4d;');
console.log('%cTry pressing Escape to clear the form!', 'font-size: 12px; color: #666; font-style: italic;');

// ==================== INPUT PLACEHOLDER ANIMATION ====================

inputs.forEach(input => {
    input.addEventListener('focus', function() {
        if (this.placeholder) {
            const placeholderText = this.placeholder;
            this.placeholder = '';
            this.dataset.placeholder = placeholderText;
        }
    });
    
    input.addEventListener('blur', function() {
        if (this.dataset.placeholder) {
            this.placeholder = this.dataset.placeholder;
        }
    });
});

// ==================== DETECT CAPS LOCK ====================

passwordInput.addEventListener('keydown', function(e) {
    const capsLockOn = e.getModifierState('CapsLock');
    
    if (capsLockOn) {
        this.style.borderColor = '#ff9800';
        this.title = '⚠️ Caps Lock is ON';
    } else {
        if (!this.classList.contains('error') && !this.classList.contains('success')) {
            this.style.borderColor = '#ddd';
        }
        this.title = '';
    }
});

// ==================== SMOOTH SCROLL BEHAVIOR ====================

document.documentElement.style.scrollBehavior = 'smooth';

// ==================== MOBILE TOUCH FEEDBACK ====================

if ('ontouchstart' in window) {
    inputs.forEach(input => {
        input.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#f5f5f5';
        });
        
        input.addEventListener('touchend', function() {
            this.style.backgroundColor = '#fafafa';
        });
    });
    
    loginBtn.addEventListener('touchstart', function() {
        this.style.transform = 'scale(0.98)';
    });
    
    loginBtn.addEventListener('touchend', function() {
        this.style.transform = 'scale(1)';
    });
}

// ==================== AUTO-FOCUS FIRST INPUT ====================

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        emailInput.focus();
    }, 500);
});

console.log('%cPage fully loaded with animations! 🎨', 'font-size: 12px; color: #4caf50;');